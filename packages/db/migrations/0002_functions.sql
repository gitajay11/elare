-- ============================================================================
-- ÉLARÉ BEAUTY — business logic
-- Everything that touches money, stock or points lives here, server-side.
-- The frontend only ever sends variant ids, quantities, codes and intents.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function get_setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from settings where key = p_key;
$$;

create or replace function require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- Creates the profile (+ loyalty account, wishlist, cart) for a Neon Auth user the
-- first time we see them. Reads neon_auth."user" as the owner role; idempotent.
create or replace function _ensure_profile(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text; v_name text;
begin
  if p_uid is null then return; end if;
  if exists (select 1 from profiles where id = p_uid) then return; end if;
  select u.email, u.name into v_email, v_name from neon_auth."user" u where u.id = p_uid;
  if v_email is null then
    v_email := coalesce(auth.jwt() ->> 'email', '');
    v_name  := coalesce(auth.jwt() ->> 'name', '');
  end if;
  insert into profiles (id, email, full_name) values (p_uid, coalesce(v_email, ''), nullif(v_name, ''))
  on conflict (id) do nothing;
  insert into loyalty_accounts (user_id) values (p_uid) on conflict do nothing;
  insert into wishlists (user_id) values (p_uid) on conflict do nothing;
  insert into carts (user_id) values (p_uid) on conflict do nothing;
end $$;

-- Called by the client right after sign-in / sign-up; returns the profile.
create or replace function ensure_profile(p_full_name text default null, p_phone text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  perform _ensure_profile(v_uid);
  update profiles set full_name = coalesce(nullif(trim(p_full_name), ''), full_name), phone = coalesce(nullif(trim(p_phone), ''), phone)
   where id = v_uid and (p_full_name is not null or p_phone is not null);
  return (select jsonb_build_object('id', id, 'email', email, 'full_name', full_name, 'phone', phone, 'avatar_url', avatar_url, 'role', role, 'status', status) from profiles where id = v_uid);
end $$;

create or replace function require_user() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform _ensure_profile(v_uid);
  if exists (select 1 from profiles where id = v_uid and status = 'suspended') then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  return v_uid;
end $$;

-- ---------------------------------------------------------------------------
-- Aggregated, real sales / rating / stock figures per product.
-- Social-proof numbers are derived from here and nowhere else.
-- ---------------------------------------------------------------------------
create or replace view product_stats as
select
  p.id as product_id,
  coalesce(sold.units, 0)::int as units_sold,
  coalesce(sold.recent_buyers, 0)::int as recent_buyers,
  coalesce(round(rv.avg_rating, 1), 0)::numeric as avg_rating,
  coalesce(rv.review_count, 0)::int as review_count,
  coalesce(stk.total_stock, 0)::int as total_stock,
  coalesce(stk.low_threshold, 5)::int as low_threshold
from products p
left join lateral (
  select
    sum(oi.quantity) as units,
    count(distinct o.user_id) filter (
      where o.placed_at > now() - make_interval(days =>
        coalesce((select (value ->> 'window_days')::int from settings where key = 'social_proof'), 30))
    ) as recent_buyers
  from order_items oi
  join orders o on o.id = oi.order_id
  where oi.product_id = p.id
    and oi.is_gift = false
    and o.status in ('confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered')
) sold on true
left join lateral (
  select avg(rating)::numeric as avg_rating, count(*) as review_count
  from reviews r where r.product_id = p.id and r.status = 'approved'
) rv on true
left join lateral (
  select sum(i.quantity) as total_stock, max(i.low_stock_threshold) as low_threshold
  from product_variants v join inventory i on i.variant_id = v.id
  where v.product_id = p.id and v.is_active
) stk on true;

-- ---------------------------------------------------------------------------
-- One serialiser for a product card, reused by every listing surface.
-- ---------------------------------------------------------------------------
create or replace function product_card(p products) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'name', p.name,
    'short_description', p.short_description,
    'price', p.price,
    'compare_at_price', p.compare_at_price,
    'discount_percent', case when p.compare_at_price is not null and p.compare_at_price > p.price
      then round((1 - p.price / p.compare_at_price) * 100) else null end,
    'is_best_seller', p.is_best_seller,
    'is_new', p.is_new,
    'is_gift_only', p.is_gift_only,
    'finish', p.finish,
    'coverage', p.coverage,
    'attributes', p.attributes,
    'image', (select jsonb_build_object('url', i.url, 'alt', i.alt)
              from product_images i where i.product_id = p.id
              order by i.is_primary desc, i.sort_order limit 1),
    'hover_image', (select jsonb_build_object('url', i.url, 'alt', i.alt)
              from product_images i where i.product_id = p.id
              order by i.is_primary desc, i.sort_order offset 1 limit 1),
    'shades', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'hex', s.hex) order by s.sort_order), '[]'::jsonb)
               from (select * from product_shades s where s.product_id = p.id and s.is_active order by s.sort_order limit 8) s),
    'shade_count', (select count(*) from product_shades s where s.product_id = p.id and s.is_active),
    'default_variant_id', (select v.id from product_variants v where v.product_id = p.id and v.is_active order by v.sort_order limit 1),
    'variant_count', (select count(*) from product_variants v where v.product_id = p.id and v.is_active),
    'rating', st.avg_rating,
    'review_count', st.review_count,
    'units_sold', st.units_sold,
    'recent_buyers', st.recent_buyers,
    'in_stock', st.total_stock > 0,
    'low_stock', st.total_stock > 0 and st.total_stock <= st.low_threshold,
    'category', jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name),
    'subcategory', case when sc.id is null then null else jsonb_build_object('id', sc.id, 'slug', sc.slug, 'name', sc.name) end,
    'created_at', p.created_at
  )
  from product_stats st
  join categories c on c.id = p.category_id
  left join subcategories sc on sc.id = p.subcategory_id
  where st.product_id = p.id;
$$;

-- ---------------------------------------------------------------------------
-- Public store configuration (safe subset of settings).
-- ---------------------------------------------------------------------------
create or replace function get_store_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'currency', coalesce(get_setting('store') ->> 'currency', 'INR'),
    'max_qty_per_line', coalesce((get_setting('store') ->> 'max_qty_per_line')::int, 10),
    'shipping', get_setting('shipping'),
    'tax', get_setting('tax'),
    'loyalty', get_setting('loyalty') - 'wishlist_redeem_max_price',
    'social_proof', get_setting('social_proof'),
    'gift_rule', (
      select jsonb_build_object('min_quantity', g.min_quantity, 'gift_name', p.name, 'gift_quantity', g.gift_quantity)
      from gift_rules g join product_variants v on v.id = g.gift_variant_id join products p on p.id = v.product_id
      where g.is_active and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
      order by g.min_quantity asc limit 1
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'name', c.name, 'description', c.description, 'image_url', c.image_url,
        'subcategories', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name) order by s.sort_order), '[]'::jsonb)
                          from subcategories s where s.category_id = c.id and s.is_active)
      ) order by c.sort_order), '[]'::jsonb)
      from categories c where c.is_active
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Listing with filters, facets, sorting and pagination.
-- ---------------------------------------------------------------------------
create or replace function list_products(
  p_category    text default null,
  p_subcategory text default null,
  p_query       text default null,
  p_filters     jsonb default '{}'::jsonb,
  p_sort        text default 'featured',
  p_page        int default 1,
  p_page_size   int default 24
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_page      int := greatest(coalesce(p_page, 1), 1);
  v_size      int := least(greatest(coalesce(p_page_size, 24), 1), 60);
  v_f         jsonb := coalesce(p_filters, '{}'::jsonb);
  v_price_min numeric := nullif(v_f ->> 'price_min', '')::numeric;
  v_price_max numeric := nullif(v_f ->> 'price_max', '')::numeric;
  v_rating    numeric := nullif(v_f ->> 'rating_min', '')::numeric;
  v_in_stock  boolean := coalesce((v_f ->> 'in_stock')::boolean, false);
  v_best      boolean := coalesce((v_f ->> 'best_seller')::boolean, false);
  v_new       boolean := coalesce((v_f ->> 'is_new')::boolean, false);
  v_wp        text := nullif(v_f ->> 'waterproof', '');
  v_finish    text[] := array(select jsonb_array_elements_text(coalesce(v_f -> 'finish', '[]'::jsonb)));
  v_coverage  text[] := array(select jsonb_array_elements_text(coalesce(v_f -> 'coverage', '[]'::jsonb)));
  v_shades    text[] := array(select jsonb_array_elements_text(coalesce(v_f -> 'shade', '[]'::jsonb)));
  v_subs      text[] := array(select jsonb_array_elements_text(coalesce(v_f -> 'subcategory', '[]'::jsonb)));
  v_q         text := nullif(trim(coalesce(p_query, '')), '');
  v_tsq       tsquery := case when v_q is null then null else websearch_to_tsquery('english', v_q) end;
  v_items     jsonb;
  v_total     int;
  v_facets    jsonb;
  v_category  jsonb;
begin
  with base as (
    select p.*, st.avg_rating, st.review_count, st.units_sold, st.total_stock
    from products p
    join product_stats st on st.product_id = p.id
    join categories c on c.id = p.category_id
    left join subcategories sc on sc.id = p.subcategory_id
    where p.is_published and not p.is_gift_only and c.is_active
      and (p_category is null or c.slug = p_category)
      and (p_subcategory is null or sc.slug = p_subcategory)
      and (v_q is null or p.search_vector @@ v_tsq or p.name ilike '%' || v_q || '%'
           or c.name ilike '%' || v_q || '%' or coalesce(sc.name, '') ilike '%' || v_q || '%'
           or exists (select 1 from product_shades s where s.product_id = p.id and s.name ilike '%' || v_q || '%'))
  ),
  filtered as (
    select b.* from base b
    where (v_price_min is null or b.price >= v_price_min)
      and (v_price_max is null or b.price <= v_price_max)
      and (v_rating is null or b.avg_rating >= v_rating)
      and (not v_in_stock or b.total_stock > 0)
      and (not v_best or b.is_best_seller)
      and (not v_new or b.is_new)
      and (cardinality(v_subs) = 0 or exists (select 1 from subcategories s where s.id = b.subcategory_id and s.slug = any(v_subs)))
      and (cardinality(v_finish) = 0 or b.finish = any(v_finish)
           or exists (select 1 from product_variants v where v.product_id = b.id and v.is_active and v.options ->> 'finish' = any(v_finish)))
      and (cardinality(v_coverage) = 0 or b.coverage = any(v_coverage)
           or exists (select 1 from product_variants v where v.product_id = b.id and v.is_active and v.options ->> 'coverage' = any(v_coverage)))
      and (cardinality(v_shades) = 0 or exists (select 1 from product_shades s where s.product_id = b.id and s.is_active and s.name = any(v_shades)))
      and (v_wp is null
           or (v_wp = 'true'  and (coalesce((b.attributes ->> 'waterproof')::boolean, false)
                or exists (select 1 from product_variants v where v.product_id = b.id and v.is_active and coalesce((v.options ->> 'waterproof')::boolean, false))))
           or (v_wp = 'false' and (b.attributes ? 'waterproof' and not coalesce((b.attributes ->> 'waterproof')::boolean, true)
                or exists (select 1 from product_variants v where v.product_id = b.id and v.is_active and v.options ? 'waterproof' and not coalesce((v.options ->> 'waterproof')::boolean, true)))))
  ),
  paged as (
    select f.id, count(*) over () as total
    from filtered f
    order by
      case when p_sort = 'price_asc'    then f.price end asc,
      case when p_sort = 'price_desc'   then f.price end desc,
      case when p_sort = 'newest'       then f.created_at end desc,
      case when p_sort = 'rating'       then f.avg_rating end desc nulls last,
      case when p_sort = 'best_selling' then f.units_sold end desc,
      case when v_q is not null and p_sort = 'relevance' then ts_rank(f.search_vector, v_tsq) end desc nulls last,
      f.is_best_seller desc, f.units_sold desc, f.created_at desc
    offset (v_page - 1) * v_size limit v_size
  )
  select coalesce(jsonb_agg(product_card(p) order by ord), '[]'::jsonb), max(total)
  into v_items, v_total
  from (select id, total, row_number() over () as ord from paged) pg
  join products p on p.id = pg.id;

  -- Facets are computed on the unfiltered category scope so the UI only offers relevant filters.
  with base as (
    select p.*
    from products p
    join categories c on c.id = p.category_id
    left join subcategories sc on sc.id = p.subcategory_id
    where p.is_published and not p.is_gift_only and c.is_active
      and (p_category is null or c.slug = p_category)
      and (p_subcategory is null or sc.slug = p_subcategory)
      and (v_q is null or p.search_vector @@ v_tsq or p.name ilike '%' || v_q || '%')
  )
  select jsonb_build_object(
    'price', jsonb_build_object('min', coalesce(min(b.price), 0), 'max', coalesce(max(b.price), 0)),
    'finish', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
        select b2.finish as x from base b2 where b2.finish is not null
        union select v.options ->> 'finish' from base b2 join product_variants v on v.product_id = b2.id where v.options ? 'finish') t),
    'coverage', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (
        select b2.coverage as x from base b2 where b2.coverage is not null
        union select v.options ->> 'coverage' from base b2 join product_variants v on v.product_id = b2.id where v.options ? 'coverage') t),
    'shade', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'hex', hex)), '[]'::jsonb) from (
        select s.name, min(s.hex) as hex from base b2 join product_shades s on s.product_id = b2.id and s.is_active
        group by s.name order by s.name limit 40) t),
    'has_waterproof', exists (select 1 from base b2 where b2.attributes ? 'waterproof'
        or exists (select 1 from product_variants v where v.product_id = b2.id and v.options ? 'waterproof')),
    'subcategories', (select coalesce(jsonb_agg(jsonb_build_object('slug', sc.slug, 'name', sc.name, 'count', cnt) order by sc.sort_order), '[]'::jsonb)
        from (select subcategory_id, count(*) cnt from base group by 1) t join subcategories sc on sc.id = t.subcategory_id),
    'has_best_sellers', exists (select 1 from base b2 where b2.is_best_seller),
    'has_new', exists (select 1 from base b2 where b2.is_new)
  ) into v_facets from base b;

  if p_category is not null then
    select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'description', c.description, 'image_url', c.image_url,
      'subcategory', (select jsonb_build_object('slug', s.slug, 'name', s.name, 'description', s.description)
                      from subcategories s where s.category_id = c.id and s.slug = p_subcategory))
    into v_category from categories c where c.slug = p_category;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'total', coalesce(v_total, 0),
    'page', v_page,
    'page_size', v_size,
    'facets', v_facets,
    'category', v_category
  );
end $$;

-- Instant search suggestions.
create or replace function search_suggest(p_query text, p_limit int default 6) returns jsonb
language sql stable security definer set search_path = public as $$
  with q as (select nullif(trim(coalesce(p_query, '')), '') as q)
  select jsonb_build_object(
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'name', p.name, 'price', p.price,
        'category', c.name,
        'image', (select i.url from product_images i where i.product_id = p.id order by i.is_primary desc, i.sort_order limit 1)
      ) order by rank desc, p.is_best_seller desc), '[]'::jsonb)
      from (
        select p.*, greatest(
          similarity(p.name, q.q),
          case when p.search_vector @@ websearch_to_tsquery('english', q.q) then 0.6 else 0 end,
          case when exists (select 1 from product_shades s where s.product_id = p.id and s.name ilike '%' || q.q || '%') then 0.5 else 0 end,
          case when p.name ilike '%' || q.q || '%' then 0.7 else 0 end
        ) as rank
        from products p, q
        where q.q is not null and p.is_published and not p.is_gift_only
          and (p.name ilike '%' || q.q || '%' or p.search_vector @@ websearch_to_tsquery('english', q.q)
               or similarity(p.name, q.q) > 0.2
               or exists (select 1 from product_shades s where s.product_id = p.id and s.name ilike '%' || q.q || '%'))
        order by rank desc, p.is_best_seller desc
        limit greatest(coalesce(p_limit, 6), 1)
      ) p join categories c on c.id = p.category_id
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'subcategory', s.slug, 'label',
        case when s.id is null then c.name else s.name || ' · ' || c.name end)), '[]'::jsonb)
      from (
        select c.id, c.slug, c.name, null::uuid as sid from categories c, q where q.q is not null and c.is_active and c.name ilike '%' || q.q || '%'
        union all
        select c.id, c.slug, c.name, s.id from subcategories s join categories c on c.id = s.category_id, q
        where q.q is not null and s.is_active and s.name ilike '%' || q.q || '%'
        limit 4
      ) c left join subcategories s on s.id = c.sid
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Product detail page payload.
-- ---------------------------------------------------------------------------
create or replace function get_product(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_p   products;
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  select * into v_p from products where slug = p_slug and (is_published or is_admin());
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'product', product_card(v_p) || jsonb_build_object(
      'description', v_p.description, 'benefits', coalesce(to_jsonb(v_p.benefits), '[]'::jsonb),
      'how_to_use', v_p.how_to_use, 'ingredients', v_p.ingredients, 'size_label', v_p.size_label,
      'suitability', v_p.suitability, 'video_url', v_p.video_url, 'loyalty_points', v_p.loyalty_points,
      'is_published', v_p.is_published),
    'shades', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'hex', s.hex, 'undertone', s.undertone, 'description', s.description) order by s.sort_order), '[]'::jsonb)
               from product_shades s where s.product_id = v_p.id and s.is_active),
    'variants', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'sku', v.sku, 'name', v.name, 'shade_id', v.shade_id, 'options', v.options,
        'price', coalesce(v.price_override, v_p.price),
        'in_stock', coalesce(i.quantity, 0) > 0,
        'low_stock', coalesce(i.quantity, 0) > 0 and coalesce(i.quantity, 0) <= coalesce(i.low_stock_threshold, 5),
        'stock_hint', case when coalesce(i.quantity, 0) > 0 and coalesce(i.quantity, 0) <= coalesce(i.low_stock_threshold, 5) then i.quantity else null end
      ) order by v.sort_order), '[]'::jsonb)
      from product_variants v left join inventory i on i.variant_id = v.id
      where v.product_id = v_p.id and v.is_active),
    'images', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'url', i.url, 'alt', i.alt, 'shade_id', i.shade_id) order by i.is_primary desc, i.sort_order), '[]'::jsonb)
               from product_images i where i.product_id = v_p.id),
    'bundle_items', (select coalesce(jsonb_agg(jsonb_build_object(
        'variant_id', b.variant_id, 'quantity', b.quantity, 'product_name', bp.name, 'product_slug', bp.slug,
        'variant_name', bv.name, 'shade_hex', s.hex, 'price', coalesce(bv.price_override, bp.price),
        'image', (select i.url from product_images i where i.product_id = bp.id order by (i.shade_id = bv.shade_id) desc nulls last, i.is_primary desc, i.sort_order limit 1)
      ) order by b.sort_order), '[]'::jsonb)
      from product_bundle_items b join product_variants bv on bv.id = b.variant_id join products bp on bp.id = bv.product_id
      left join product_shades s on s.id = bv.shade_id
      where b.bundle_product_id = v_p.id),
    'rating_distribution', (select jsonb_object_agg(r, cnt) from (
        select g.r, count(rv.id) as cnt from generate_series(1, 5) g(r)
        left join reviews rv on rv.product_id = v_p.id and rv.status = 'approved' and rv.rating = g.r group by g.r) t),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'rating', r.rating, 'title', r.title, 'body', r.body, 'images', to_jsonb(r.images),
        'is_verified', r.is_verified, 'created_at', r.created_at,
        'author', coalesce(nullif(split_part(coalesce(pr.full_name, ''), ' ', 1), '') ||
                  case when split_part(coalesce(pr.full_name, ''), ' ', 2) <> '' then ' ' || left(split_part(pr.full_name, ' ', 2), 1) || '.' else '' end, 'Élaré customer')
      ) order by r.created_at desc), '[]'::jsonb)
      from (select * from reviews where product_id = v_p.id and status = 'approved' order by created_at desc limit 12) r
      left join profiles pr on pr.id = r.user_id),
    'recommendations', jsonb_build_object(
      'also_like', (select coalesce(jsonb_agg(product_card(p) order by ord), '[]'::jsonb) from (
          select p.id, r.sort_order as ord from product_recommendations r join products p on p.id = r.recommended_product_id
          where r.product_id = v_p.id and r.kind = 'also_like' and p.is_published
          union all
          select p.id, 100 + row_number() over (order by p.is_best_seller desc, p.created_at desc)
          from products p where p.category_id = v_p.category_id and p.id <> v_p.id and p.is_published and not p.is_gift_only
            and not exists (select 1 from product_recommendations r where r.product_id = v_p.id and r.kind = 'also_like')
          limit 8) t join products p on p.id = t.id),
      'complete_look', (select coalesce(jsonb_agg(product_card(p) order by ord), '[]'::jsonb) from (
          select p.id, r.sort_order as ord from product_recommendations r join products p on p.id = r.recommended_product_id
          where r.product_id = v_p.id and r.kind = 'complete_look' and p.is_published
          union all
          select p.id, 100 + row_number() over (order by p.is_best_seller desc, p.created_at desc)
          from products p where p.category_id <> v_p.category_id and p.is_published and not p.is_gift_only and p.is_best_seller
            and not exists (select 1 from product_recommendations r where r.product_id = v_p.id and r.kind = 'complete_look')
          limit 4) t join products p on p.id = t.id),
      'bought_together', (select coalesce(jsonb_agg(product_card(p) order by cnt desc), '[]'::jsonb) from (
          select oi2.product_id as id, count(*) as cnt
          from order_items oi1 join order_items oi2 on oi2.order_id = oi1.order_id and oi2.product_id <> oi1.product_id
          join orders o on o.id = oi1.order_id
          where oi1.product_id = v_p.id and oi2.is_gift = false and oi2.product_id is not null
            and o.status in ('confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered')
          group by oi2.product_id order by cnt desc limit 3) t
          join products p on p.id = t.id and p.is_published)
    ),
    'coupons', (select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'description', c.description, 'type', c.type, 'value', c.value, 'min_order_value', c.min_order_value)), '[]'::jsonb)
      from coupons c where c.is_active and c.is_public and c.starts_at <= now() and (c.expires_at is null or c.expires_at > now())
        and (c.scope = 'all' or (c.scope = 'products' and v_p.id = any(c.product_ids)) or (c.scope = 'categories' and v_p.category_id = any(c.category_ids)))),
    'can_review', v_uid is not null and exists (
        select 1 from orders o join order_items oi on oi.order_id = o.id
        where o.user_id = v_uid and o.status = 'delivered' and oi.is_gift = false
          and (oi.product_id = v_p.id or oi.product_id in (select b.bundle_product_id from product_bundle_items b join product_variants bv on bv.id = b.variant_id where bv.product_id = v_p.id))),
    'my_review', (select jsonb_build_object('id', r.id, 'rating', r.rating, 'title', r.title, 'body', r.body, 'status', r.status)
                  from reviews r where r.product_id = v_p.id and r.user_id = v_uid),
    'breadcrumb', (select jsonb_build_array(
        jsonb_build_object('name', c.name, 'slug', c.slug),
        case when sc.id is null then null else jsonb_build_object('name', sc.name, 'slug', sc.slug) end)
        from categories c left join subcategories sc on sc.id = v_p.subcategory_id where c.id = v_p.category_id)
  ) into v_out;

  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Home page payload.
-- ---------------------------------------------------------------------------
create or replace function get_home() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'signature', (select coalesce(jsonb_agg(product_card(p) order by p.created_at, p.name), '[]'::jsonb)
      from products p where p.is_published and p.attributes ->> 'collection' = 'signature'),
    'best_sellers', (select coalesce(jsonb_agg(product_card(p) order by st.units_sold desc, p.is_best_seller desc, st.avg_rating desc, p.created_at desc), '[]'::jsonb)
      from (select p.* from products p join product_stats st on st.product_id = p.id
            where p.is_published and not p.is_gift_only and (st.units_sold > 0 or p.is_best_seller)
            order by st.units_sold desc, p.is_best_seller desc, st.avg_rating desc, p.created_at desc limit 8) p
      join product_stats st on st.product_id = p.id),
    'new_arrivals', (select coalesce(jsonb_agg(product_card(p) order by p.created_at desc), '[]'::jsonb)
      from (select * from products p where p.is_published and not p.is_gift_only and p.is_new order by p.created_at desc limit 8) p),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'description', c.description, 'image_url', c.image_url,
        'product_count', (select count(*) from products p where p.category_id = c.id and p.is_published and not p.is_gift_only)) order by c.sort_order), '[]'::jsonb)
      from categories c where c.is_active),
    'bought_together', (
      -- Real co-purchase pairs; falls back to the bundle relationships when there is no order data yet.
      select coalesce((
        select jsonb_agg(jsonb_build_object('a', product_card(pa), 'b', product_card(pb), 'count', t.cnt) order by t.cnt desc)
        from (
          select least(oi1.product_id, oi2.product_id) as a, greatest(oi1.product_id, oi2.product_id) as b, count(distinct oi1.order_id) as cnt
          from order_items oi1 join order_items oi2 on oi2.order_id = oi1.order_id and oi2.product_id > oi1.product_id
          join orders o on o.id = oi1.order_id
          where oi1.is_gift = false and oi2.is_gift = false and oi1.product_id is not null and oi2.product_id is not null
            and o.status in ('confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered')
          group by 1, 2 having count(distinct oi1.order_id) >= 2 order by cnt desc limit 3
        ) t join products pa on pa.id = t.a and pa.is_published join products pb on pb.id = t.b and pb.is_published
      ), (
        select jsonb_agg(jsonb_build_object('a', product_card(pa), 'b', product_card(pb), 'count', 0) order by r.sort_order)
        from (select * from product_recommendations where kind = 'bundle' order by sort_order limit 3) r
        join products pa on pa.id = r.product_id and pa.is_published join products pb on pb.id = r.recommended_product_id and pb.is_published
      ), '[]'::jsonb)),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'rating', r.rating, 'title', r.title, 'body', r.body, 'is_verified', r.is_verified, 'created_at', r.created_at,
        'product', jsonb_build_object('name', p.name, 'slug', p.slug),
        'author', coalesce(nullif(split_part(coalesce(pr.full_name, ''), ' ', 1), ''), 'Élaré customer')
      ) order by r.created_at desc), '[]'::jsonb)
      from (select * from reviews where status = 'approved' order by created_at desc limit 6) r
      join products p on p.id = r.product_id left join profiles pr on pr.id = r.user_id),
    'review_summary', (select jsonb_build_object('count', count(*), 'average', coalesce(round(avg(rating), 1), 0)) from reviews where status = 'approved')
  );
$$;

-- Products by ids (recently viewed etc.)
create or replace function get_product_cards(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(product_card(p) order by array_position(p_ids, p.id)), '[]'::jsonb)
  from products p where p.id = any(p_ids) and p.is_published;
$$;

-- ---------------------------------------------------------------------------
-- Cart pricing engine (internal). Used by quote_cart and place_order so the
-- number the customer sees is the number they are charged.
-- ---------------------------------------------------------------------------
create or replace function _validate_coupon(p_code text, p_user_id uuid, p_lines jsonb, p_subtotal numeric) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_c        coupons;
  v_eligible numeric := 0;
  v_discount numeric := 0;
  v_used     int;
begin
  if p_code is null or trim(p_code) = '' then
    return jsonb_build_object('valid', false, 'code', null, 'discount', 0, 'message', null);
  end if;

  select * into v_c from coupons where upper(code) = upper(trim(p_code));
  if not found then
    return jsonb_build_object('valid', false, 'code', upper(trim(p_code)), 'discount', 0, 'message', 'That code is not valid.');
  end if;
  if not v_c.is_active then
    return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon is no longer active.');
  end if;
  if v_c.starts_at > now() then
    return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon is not active yet.');
  end if;
  if v_c.expires_at is not null and v_c.expires_at <= now() then
    return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon has expired.');
  end if;
  if v_c.usage_limit is not null then
    select count(*) into v_used from coupon_usage where coupon_id = v_c.id;
    if v_used >= v_c.usage_limit then
      return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon has been fully redeemed.');
    end if;
  end if;
  if p_user_id is not null then
    select count(*) into v_used from coupon_usage where coupon_id = v_c.id and user_id = p_user_id;
    if v_used >= v_c.per_user_limit then
      return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'You have already used this coupon.');
    end if;
    if v_c.first_order_only and exists (select 1 from orders o where o.user_id = p_user_id and o.status not in ('cancelled')) then
      return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon is valid on your first order only.');
    end if;
  end if;

  -- Eligible subtotal depends on scope.
  select coalesce(sum((l ->> 'line_total')::numeric), 0) into v_eligible
  from jsonb_array_elements(p_lines) l
  where (l ->> 'is_gift')::boolean = false
    and (v_c.scope = 'all'
      or (v_c.scope = 'products'   and (l ->> 'product_id')::uuid = any(v_c.product_ids))
      or (v_c.scope = 'categories' and (l ->> 'category_id')::uuid = any(v_c.category_ids)));

  if v_eligible <= 0 then
    return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon does not apply to the items in your bag.');
  end if;
  if p_subtotal < v_c.min_order_value then
    return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0,
      'message', 'Add ₹' || to_char(v_c.min_order_value - p_subtotal, 'FM999999990.00') || ' more to use this coupon.');
  end if;

  v_discount := case v_c.type
    when 'percentage' then round(v_eligible * v_c.value / 100, 2)
    else least(v_c.value, v_eligible) end;
  if v_c.max_discount is not null then
    v_discount := least(v_discount, v_c.max_discount);
  end if;

  return jsonb_build_object('valid', true, 'coupon_id', v_c.id, 'code', v_c.code, 'discount', v_discount,
    'message', 'Coupon applied — you save ₹' || to_char(v_discount, 'FM999999990.00') || '.', 'description', v_c.description);
end $$;

create or replace function _active_gift_rule(p_qualifying_qty int) returns jsonb
language sql stable security definer set search_path = public as $$
  with rules as (
    select g.*, v.product_id, p.name as product_name, coalesce(i.quantity, 0) as stock,
      (select url from product_images im where im.product_id = p.id order by im.is_primary desc, im.sort_order limit 1) as image
    from gift_rules g
    join product_variants v on v.id = g.gift_variant_id
    join products p on p.id = v.product_id
    left join inventory i on i.variant_id = v.id
    where g.is_active and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
  )
  select jsonb_build_object(
    'unlocked', (select coalesce(bool_or(p_qualifying_qty >= min_quantity and stock >= gift_quantity), false) from rules),
    'rule', (select jsonb_build_object('id', id, 'name', name, 'variant_id', gift_variant_id, 'product_id', product_id, 'product_name', product_name,
               'quantity', gift_quantity, 'min_quantity', min_quantity, 'image', image)
             from rules where p_qualifying_qty >= min_quantity and stock >= gift_quantity order by min_quantity desc limit 1),
    'next', (select jsonb_build_object('name', name, 'product_name', product_name, 'min_quantity', min_quantity, 'remaining', min_quantity - p_qualifying_qty, 'image', image)
             from rules where p_qualifying_qty < min_quantity order by min_quantity asc limit 1)
  );
$$;

create or replace function _quote(p_user_id uuid, p_items jsonb, p_coupon_code text, p_redeem_points int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_it        record;
  v_row       record;
  v_lines     jsonb := '[]'::jsonb;
  v_issues    jsonb := '[]'::jsonb;
  v_subtotal  numeric := 0;
  v_qty       int := 0;
  v_points_to_earn int := 0;
  v_max_line  int := coalesce((get_setting('store') ->> 'max_qty_per_line')::int, 10);
  v_loy       jsonb := get_setting('loyalty');
  v_ship      jsonb := get_setting('shipping');
  v_tax       jsonb := get_setting('tax');
  v_coupon    jsonb;
  v_gift      jsonb;
  v_gift_line jsonb := null;
  v_points    jsonb;
  v_balance   int := 0;
  v_redeem    int := 0;
  v_redeem_max int := 0;
  v_points_discount numeric := 0;
  v_points_msg text := null;
  v_after_discount numeric;
  v_shipping  numeric := 0;
  v_tax_total numeric := 0;
  v_total     numeric;
  v_ppr       numeric := coalesce((v_loy ->> 'points_per_rupee')::numeric, 0);
  v_pval      numeric := coalesce((v_loy ->> 'point_value_rupees')::numeric, 0);
begin
  for v_it in
    select (e ->> 'variant_id')::uuid as variant_id, sum(greatest((e ->> 'quantity')::int, 0)) as quantity
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where e ->> 'variant_id' is not null
    group by 1
  loop
    if v_it.quantity <= 0 then continue; end if;

    select v.id as variant_id, v.name as variant_name, v.product_id, p.name as product_name, p.slug, p.category_id,
           coalesce(v.price_override, p.price) as unit_price, p.compare_at_price, coalesce(i.quantity, 0) as stock,
           (v.is_active and p.is_published and not p.is_gift_only) as purchasable,
           s.name as shade_name, s.hex as shade_hex, p.loyalty_points,
           (select url from product_images im where im.product_id = p.id
              order by (im.shade_id = v.shade_id) desc nulls last, im.is_primary desc, im.sort_order limit 1) as image_url
    into v_row
    from product_variants v
    join products p on p.id = v.product_id
    left join inventory i on i.variant_id = v.id
    left join product_shades s on s.id = v.shade_id
    where v.id = v_it.variant_id;

    if not found or not v_row.purchasable then
      v_issues := v_issues || jsonb_build_object('variant_id', v_it.variant_id, 'code', 'unavailable', 'message', 'An item in your bag is no longer available.');
      v_lines := v_lines || jsonb_build_object('variant_id', v_it.variant_id, 'quantity', v_it.quantity, 'issue', 'unavailable', 'product_name', coalesce(v_row.product_name, 'Unavailable item'), 'unit_price', 0, 'line_total', 0, 'is_gift', false, 'available', 0);
      continue;
    end if;

    declare
      v_q     int := least(v_it.quantity, v_max_line);
      v_issue text := null;
    begin
      if v_row.stock <= 0 then
        v_issue := 'out_of_stock';
        v_issues := v_issues || jsonb_build_object('variant_id', v_row.variant_id, 'code', 'out_of_stock', 'message', v_row.product_name || ' is sold out.');
      elsif v_row.stock < v_q then
        v_issue := 'insufficient_stock';
        v_issues := v_issues || jsonb_build_object('variant_id', v_row.variant_id, 'code', 'insufficient_stock', 'available', v_row.stock,
          'message', 'Only ' || v_row.stock || ' of ' || v_row.product_name || ' left.');
      end if;

      v_lines := v_lines || jsonb_build_object(
        'variant_id', v_row.variant_id, 'product_id', v_row.product_id, 'category_id', v_row.category_id,
        'slug', v_row.slug, 'product_name', v_row.product_name, 'variant_name', v_row.variant_name,
        'shade_name', v_row.shade_name, 'shade_hex', v_row.shade_hex, 'image_url', v_row.image_url,
        'unit_price', v_row.unit_price, 'compare_at_price', v_row.compare_at_price,
        'quantity', v_q, 'line_total', round(v_row.unit_price * v_q, 2), 'is_gift', false,
        'available', v_row.stock, 'issue', v_issue,
        'points', case when v_row.loyalty_points is not null then v_row.loyalty_points * v_q else floor(v_row.unit_price * v_q * v_ppr)::int end);

      if v_issue is null then
        v_subtotal := v_subtotal + round(v_row.unit_price * v_q, 2);
        v_qty := v_qty + v_q;
        v_points_to_earn := v_points_to_earn + case when v_row.loyalty_points is not null then v_row.loyalty_points * v_q else floor(v_row.unit_price * v_q * v_ppr)::int end;
      end if;
    end;
  end loop;

  -- Coupon -----------------------------------------------------------------
  v_coupon := _validate_coupon(p_coupon_code, p_user_id, v_lines, v_subtotal);
  v_after_discount := v_subtotal - coalesce((v_coupon ->> 'discount')::numeric, 0);

  -- Free gift: qualifying quantity counts paid, in-stock, non-gift lines only.
  v_gift := _active_gift_rule(v_qty);
  if (v_gift ->> 'unlocked')::boolean then
    select jsonb_build_object(
      'variant_id', v.id, 'product_id', p.id, 'slug', p.slug, 'product_name', p.name, 'variant_name', v.name,
      'shade_name', s.name, 'shade_hex', s.hex, 'unit_price', 0, 'compare_at_price', coalesce(v.price_override, p.price),
      'quantity', (v_gift -> 'rule' ->> 'quantity')::int, 'line_total', 0, 'is_gift', true, 'available', coalesce(i.quantity, 0), 'issue', null,
      'points', 0, 'gift_rule_id', (v_gift -> 'rule' ->> 'id')::uuid,
      'image_url', (select url from product_images im where im.product_id = p.id order by im.is_primary desc, im.sort_order limit 1))
    into v_gift_line
    from product_variants v join products p on p.id = v.product_id
    left join product_shades s on s.id = v.shade_id left join inventory i on i.variant_id = v.id
    where v.id = (v_gift -> 'rule' ->> 'variant_id')::uuid;
    v_lines := v_lines || v_gift_line;
  end if;

  -- Loyalty redemption -------------------------------------------------------
  if p_user_id is not null then
    select available_points into v_balance from loyalty_accounts where user_id = p_user_id;
    v_balance := coalesce(v_balance, 0);
  end if;
  if coalesce((v_loy ->> 'redemption_enabled')::boolean, false) and v_pval > 0 then
    v_redeem_max := least(v_balance, floor(v_after_discount * coalesce((v_loy ->> 'max_redeem_percent')::numeric, 0) / 100 / v_pval)::int);
  end if;
  if coalesce(p_redeem_points, 0) > 0 then
    if p_user_id is null then
      v_points_msg := 'Sign in to use your Élaré points.';
    elsif not coalesce((v_loy ->> 'redemption_enabled')::boolean, false) then
      v_points_msg := 'Point redemption is currently paused.';
    elsif p_redeem_points > v_balance then
      v_points_msg := 'You only have ' || v_balance || ' points available.';
    elsif p_redeem_points < coalesce((v_loy ->> 'min_redeem_points')::int, 0) then
      v_points_msg := 'Redeem at least ' || (v_loy ->> 'min_redeem_points') || ' points.';
    else
      v_redeem := least(p_redeem_points, v_redeem_max);
      v_points_discount := round(v_redeem * v_pval, 2);
      if v_redeem < p_redeem_points then
        v_points_msg := 'Points cover up to ' || (v_loy ->> 'max_redeem_percent') || '% of this order — ' || v_redeem || ' points applied.';
      end if;
    end if;
  end if;
  v_points := jsonb_build_object('balance', v_balance, 'redeemable_max', v_redeem_max, 'requested', coalesce(p_redeem_points, 0),
    'applied', v_redeem, 'discount', v_points_discount, 'point_value', v_pval, 'min_redeem', (v_loy ->> 'min_redeem_points')::int,
    'message', v_points_msg, 'enabled', coalesce((v_loy ->> 'redemption_enabled')::boolean, false));

  -- Shipping & tax ----------------------------------------------------------
  v_after_discount := greatest(v_after_discount - v_points_discount, 0);
  if v_qty > 0 then
    v_shipping := case when v_after_discount >= coalesce((v_ship ->> 'free_above')::numeric, 0) then 0
                       else coalesce((v_ship ->> 'flat_rate')::numeric, 0) end;
  end if;
  if not coalesce((v_tax ->> 'inclusive')::boolean, true) then
    v_tax_total := round(v_after_discount * coalesce((v_tax ->> 'rate_percent')::numeric, 0) / 100, 2);
  end if;
  v_total := round(v_after_discount + v_shipping + v_tax_total, 2);

  return jsonb_build_object(
    'ok', jsonb_array_length(v_issues) = 0 and v_qty > 0,
    'lines', v_lines,
    'issues', v_issues,
    'item_count', v_qty,
    'subtotal', v_subtotal,
    'coupon', v_coupon,
    'gift', v_gift || jsonb_build_object('line', v_gift_line),
    'points', v_points,
    'discount_total', coalesce((v_coupon ->> 'discount')::numeric, 0) + v_points_discount,
    'shipping', v_shipping,
    'free_shipping_threshold', (v_ship ->> 'free_above')::numeric,
    'tax', v_tax_total,
    'tax_inclusive', coalesce((v_tax ->> 'inclusive')::boolean, true),
    'total', v_total,
    'points_to_earn', v_points_to_earn
  );
end $$;

create or replace function quote_cart(p_items jsonb, p_coupon_code text default null, p_redeem_points int default 0) returns jsonb
language sql stable security definer set search_path = public as $$
  select _quote(auth.uid(), p_items, p_coupon_code, p_redeem_points);
$$;

-- ---------------------------------------------------------------------------
-- Loyalty ledger (internal)
-- ---------------------------------------------------------------------------
create or replace function _loyalty_apply(p_user_id uuid, p_type loyalty_tx_type, p_points int, p_order_id uuid, p_description text, p_actor uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  if p_points = 0 then return null; end if;
  insert into loyalty_accounts (user_id) values (p_user_id) on conflict do nothing;
  update loyalty_accounts
     set available_points = available_points + p_points,
         lifetime_points  = lifetime_points + greatest(p_points, 0) * (case when p_type in ('earn', 'adjust') then 1 else 0 end),
         redeemed_points  = redeemed_points + (case when p_type = 'redeem' then -p_points when p_type = 'reversal' and p_points > 0 then -p_points else 0 end),
         updated_at = now()
   where user_id = p_user_id
   returning available_points into v_balance;
  insert into loyalty_transactions (user_id, type, points, balance_after, order_id, description, created_by)
  values (p_user_id, p_type, p_points, v_balance, p_order_id, p_description, p_actor);
  return v_balance;
end $$;

-- ---------------------------------------------------------------------------
-- Place an order. Recomputes everything server-side under row locks.
-- ---------------------------------------------------------------------------
create or replace function place_order(
  p_items          jsonb,
  p_address        jsonb,
  p_payment_method text,
  p_coupon_code    text default null,
  p_redeem_points  int default 0,
  p_note           text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := require_user();
  v_method  payment_method;
  v_q       jsonb;
  v_line    jsonb;
  v_order   orders;
  v_stock   int;
  v_addr    jsonb;
begin
  v_method := p_payment_method::payment_method;
  if v_method not in ('razorpay', 'cod') then
    raise exception 'unsupported payment method';
  end if;

  -- Validate the address shape (values are stored as a snapshot on the order).
  v_addr := jsonb_build_object(
    'full_name',   trim(coalesce(p_address ->> 'full_name', '')),
    'phone',       trim(coalesce(p_address ->> 'phone', '')),
    'email',       trim(coalesce(p_address ->> 'email', '')),
    'line1',       trim(coalesce(p_address ->> 'line1', '')),
    'line2',       trim(coalesce(p_address ->> 'line2', '')),
    'city',        trim(coalesce(p_address ->> 'city', '')),
    'state',       trim(coalesce(p_address ->> 'state', '')),
    'postal_code', trim(coalesce(p_address ->> 'postal_code', '')),
    'country',     coalesce(nullif(trim(p_address ->> 'country'), ''), 'IN'));
  if (v_addr ->> 'full_name') = '' or (v_addr ->> 'phone') = '' or (v_addr ->> 'line1') = ''
     or (v_addr ->> 'city') = '' or (v_addr ->> 'state') = '' or (v_addr ->> 'postal_code') = '' then
    raise exception 'Please complete your delivery address.';
  end if;

  -- Lock the inventory rows we are about to touch, in a stable order, then price under the lock.
  perform 1 from inventory i
   where i.variant_id in (select (e ->> 'variant_id')::uuid from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e)
   order by i.variant_id for update;
  perform 1 from inventory i where i.variant_id in (select gift_variant_id from gift_rules where is_active) order by i.variant_id for update;

  v_q := _quote(v_uid, p_items, p_coupon_code, p_redeem_points);
  if not (v_q ->> 'ok')::boolean then
    raise exception '%', coalesce(v_q -> 'issues' -> 0 ->> 'message', 'Your bag is empty.');
  end if;
  if p_coupon_code is not null and trim(p_coupon_code) <> '' and not (v_q -> 'coupon' ->> 'valid')::boolean then
    raise exception '%', v_q -> 'coupon' ->> 'message';
  end if;
  if coalesce(p_redeem_points, 0) > 0 and (v_q -> 'points' ->> 'applied')::int = 0 then
    raise exception '%', coalesce(v_q -> 'points' ->> 'message', 'Points could not be applied.');
  end if;

  insert into orders (user_id, status, payment_status, payment_method, subtotal, coupon_id, coupon_code, coupon_discount,
                      points_redeemed, points_discount, shipping_total, tax_total, grand_total, points_earned, shipping_address, customer_note)
  values (v_uid,
          (case when v_method = 'cod' then 'confirmed' else 'pending' end)::order_status,
          (case when v_method = 'cod' then 'cod' else 'pending' end)::payment_status,
          v_method,
          (v_q ->> 'subtotal')::numeric,
          (v_q -> 'coupon' ->> 'coupon_id')::uuid, v_q -> 'coupon' ->> 'code', coalesce((v_q -> 'coupon' ->> 'discount')::numeric, 0),
          (v_q -> 'points' ->> 'applied')::int, (v_q -> 'points' ->> 'discount')::numeric,
          (v_q ->> 'shipping')::numeric, (v_q ->> 'tax')::numeric, (v_q ->> 'total')::numeric,
          (v_q ->> 'points_to_earn')::int, v_addr, nullif(trim(coalesce(p_note, '')), ''))
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(v_q -> 'lines') loop
    insert into order_items (order_id, product_id, variant_id, product_name, variant_name, shade_name, shade_hex, image_url,
                             unit_price, quantity, line_total, is_gift, points_earned)
    values (v_order.id, (v_line ->> 'product_id')::uuid, (v_line ->> 'variant_id')::uuid, v_line ->> 'product_name', v_line ->> 'variant_name',
            v_line ->> 'shade_name', v_line ->> 'shade_hex', v_line ->> 'image_url',
            (v_line ->> 'unit_price')::numeric, (v_line ->> 'quantity')::int, (v_line ->> 'line_total')::numeric,
            (v_line ->> 'is_gift')::boolean, coalesce((v_line ->> 'points')::int, 0));

    update inventory set quantity = quantity - (v_line ->> 'quantity')::int
     where variant_id = (v_line ->> 'variant_id')::uuid
     returning quantity into v_stock;
    if v_stock is null or v_stock < 0 then
      raise exception 'Not enough stock for %', v_line ->> 'product_name';
    end if;
    insert into inventory_movements (variant_id, delta, reason, reference, created_by)
    values ((v_line ->> 'variant_id')::uuid, -((v_line ->> 'quantity')::int),
            (case when (v_line ->> 'is_gift')::boolean then 'gift' else 'sale' end)::inventory_reason, v_order.order_number, v_uid);

    if (v_line ->> 'is_gift')::boolean then
      insert into free_gifts (order_id, gift_rule_id, variant_id, quantity)
      values (v_order.id, (v_line ->> 'gift_rule_id')::uuid, (v_line ->> 'variant_id')::uuid, (v_line ->> 'quantity')::int);
    end if;
  end loop;

  if v_order.coupon_id is not null then
    insert into coupon_usage (coupon_id, user_id, order_id, discount_amount)
    values (v_order.coupon_id, v_uid, v_order.id, v_order.coupon_discount);
  end if;

  if v_order.points_redeemed > 0 then
    perform _loyalty_apply(v_uid, 'redeem', -v_order.points_redeemed, v_order.id, 'Redeemed on order ' || v_order.order_number, v_uid);
  end if;

  insert into payments (order_id, provider, amount, status)
  values (v_order.id, v_method, v_order.grand_total, (case when v_method = 'cod' then 'cod' else 'pending' end)::payment_status);

  -- The server-side cart is spent.
  delete from cart_items where cart_id = (select id from carts where user_id = v_uid);

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'grand_total', v_order.grand_total,
                            'payment_method', v_method, 'status', v_order.status);
end $$;

-- Called by the API Function (owner connection) after Razorpay signature verification.
create or replace function mark_order_paid(p_order_id uuid, p_provider_order_id text, p_provider_payment_id text, p_raw jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_o orders;
begin
  select * into v_o from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_o.payment_status = 'paid' then
    return jsonb_build_object('order_id', v_o.id, 'already', true);
  end if;
  update payments set status = 'paid', provider_order_id = coalesce(p_provider_order_id, provider_order_id),
         provider_payment_id = p_provider_payment_id, raw = coalesce(p_raw, raw)
   where order_id = v_o.id and provider = 'razorpay';
  update orders set payment_status = 'paid', status = case when status = 'pending' then 'confirmed' else status end
   where id = v_o.id;
  return jsonb_build_object('order_id', v_o.id, 'already', false);
end $$;

create or replace function mark_payment_failed(p_order_id uuid, p_raw jsonb default null) returns void
language sql security definer set search_path = public as $$
  update payments set status = 'failed', raw = coalesce(p_raw, raw) where order_id = p_order_id and provider = 'razorpay' and status = 'pending';
$$;

-- ---------------------------------------------------------------------------
-- Order lifecycle. One transition table, used by admin and customer paths.
-- ---------------------------------------------------------------------------
create or replace function _can_transition(p_from order_status, p_to order_status) returns boolean
language sql immutable as $$
  select case p_from
    when 'pending'           then p_to in ('confirmed', 'cancelled')
    when 'confirmed'         then p_to in ('processing', 'cancelled')
    when 'processing'        then p_to in ('packed', 'cancelled')
    when 'packed'            then p_to in ('shipped', 'cancelled')
    when 'shipped'           then p_to in ('out_for_delivery', 'delivered')
    when 'out_for_delivery'  then p_to in ('delivered')
    when 'delivered'         then p_to in ('refund_requested')
    when 'refund_requested'  then p_to in ('refund_initiated', 'delivered')
    when 'refund_initiated'  then p_to in ('refund_processing', 'refunded')
    when 'refund_processing' then p_to in ('refunded')
    else false end;
$$;

create or replace function _restock_order(p_order_id uuid, p_reason inventory_reason, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_i record; v_num text;
begin
  select order_number into v_num from orders where id = p_order_id;
  for v_i in select variant_id, quantity from order_items where order_id = p_order_id and variant_id is not null loop
    update inventory set quantity = quantity + v_i.quantity where variant_id = v_i.variant_id;
    insert into inventory_movements (variant_id, delta, reason, reference, created_by)
    values (v_i.variant_id, v_i.quantity, p_reason, v_num, p_actor);
  end loop;
end $$;

create or replace function _transition_order(p_order_id uuid, p_to order_status, p_note text, p_actor uuid) returns orders
language plpgsql security definer set search_path = public as $$
declare v_o orders;
begin
  select * into v_o from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not _can_transition(v_o.status, p_to) then
    raise exception 'Cannot move an order from % to %', v_o.status, p_to;
  end if;

  if p_to = 'cancelled' then
    perform _restock_order(v_o.id, 'cancel', p_actor);
    if v_o.points_redeemed > 0 then
      perform _loyalty_apply(v_o.user_id, 'reversal', v_o.points_redeemed, v_o.id, 'Points returned — order ' || v_o.order_number || ' cancelled', p_actor);
    end if;
    delete from coupon_usage where order_id = v_o.id;
    update orders set status = 'cancelled', cancel_reason = p_note,
           payment_status = case when payment_status = 'paid' then 'refunded' else payment_status end
     where id = v_o.id returning * into v_o;

  elsif p_to = 'delivered' then
    update orders set status = 'delivered', payment_status = case when payment_method = 'cod' then 'paid' else payment_status end
     where id = v_o.id returning * into v_o;
    if not v_o.points_awarded and v_o.points_earned > 0 then
      perform _loyalty_apply(v_o.user_id, 'earn', v_o.points_earned, v_o.id, 'Earned on order ' || v_o.order_number, p_actor);
      update orders set points_awarded = true where id = v_o.id returning * into v_o;
    end if;

  elsif p_to = 'refunded' then
    perform _restock_order(v_o.id, 'return', p_actor);
    if v_o.points_awarded and v_o.points_earned > 0 then
      perform _loyalty_apply(v_o.user_id, 'reversal', -least(v_o.points_earned, (select available_points from loyalty_accounts where user_id = v_o.user_id)),
                             v_o.id, 'Points reversed — order ' || v_o.order_number || ' refunded', p_actor);
    end if;
    if v_o.points_redeemed > 0 then
      perform _loyalty_apply(v_o.user_id, 'reversal', v_o.points_redeemed, v_o.id, 'Points returned — order ' || v_o.order_number || ' refunded', p_actor);
    end if;
    update orders set status = 'refunded', payment_status = 'refunded' where id = v_o.id returning * into v_o;
    update payments set status = 'refunded' where order_id = v_o.id;

  else
    update orders set status = p_to where id = v_o.id returning * into v_o;
  end if;

  if p_note is not null and p_note <> '' then
    update order_status_history set note = p_note
     where id = (select id from order_status_history where order_id = v_o.id order by created_at desc limit 1);
  end if;
  return v_o;
end $$;

create or replace function admin_update_order(
  p_order_id uuid, p_status text default null, p_note text default null,
  p_carrier text default null, p_tracking_number text default null, p_tracking_url text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_o orders;
begin
  perform require_admin();
  if p_status is not null then
    v_o := _transition_order(p_order_id, p_status::order_status, p_note, auth.uid());
  end if;
  if p_carrier is not null or p_tracking_number is not null or p_tracking_url is not null then
    update orders set carrier = coalesce(p_carrier, carrier), tracking_number = coalesce(p_tracking_number, tracking_number),
           tracking_url = coalesce(p_tracking_url, tracking_url)
     where id = p_order_id returning * into v_o;
  end if;
  return get_order(p_order_id);
end $$;

create or replace function cancel_my_order(p_order_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := require_user(); v_o orders;
begin
  select * into v_o from orders where id = p_order_id and user_id = v_uid;
  if not found then raise exception 'order not found'; end if;
  if v_o.status not in ('pending', 'confirmed', 'processing') then
    raise exception 'This order can no longer be cancelled.';
  end if;
  perform _transition_order(v_o.id, 'cancelled', coalesce(p_reason, 'Cancelled by customer'), v_uid);
  return get_order(v_o.id);
end $$;

create or replace function request_refund(p_order_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := require_user(); v_o orders;
begin
  select * into v_o from orders where id = p_order_id and user_id = v_uid;
  if not found then raise exception 'order not found'; end if;
  if v_o.status <> 'delivered' then raise exception 'Refunds can be requested on delivered orders.'; end if;
  if v_o.updated_at < now() - interval '30 days' then raise exception 'The 30-day return window has closed.'; end if;
  perform _transition_order(v_o.id, 'refund_requested', p_reason, v_uid);
  return get_order(v_o.id);
end $$;

create or replace function get_order(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'order_number', o.order_number, 'status', o.status, 'payment_status', o.payment_status, 'payment_method', o.payment_method,
    'currency', o.currency, 'subtotal', o.subtotal, 'coupon_code', o.coupon_code, 'coupon_discount', o.coupon_discount,
    'points_redeemed', o.points_redeemed, 'points_discount', o.points_discount, 'shipping_total', o.shipping_total, 'tax_total', o.tax_total,
    'grand_total', o.grand_total, 'points_earned', o.points_earned, 'points_awarded', o.points_awarded,
    'shipping_address', o.shipping_address, 'carrier', o.carrier, 'tracking_number', o.tracking_number, 'tracking_url', o.tracking_url,
    'customer_note', o.customer_note, 'cancel_reason', o.cancel_reason, 'placed_at', o.placed_at, 'updated_at', o.updated_at,
    'customer', jsonb_build_object('id', pr.id, 'name', pr.full_name, 'email', pr.email, 'phone', pr.phone),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'product_id', i.product_id, 'variant_id', i.variant_id,
        'product_name', i.product_name, 'variant_name', i.variant_name, 'shade_name', i.shade_name, 'shade_hex', i.shade_hex,
        'image_url', i.image_url, 'unit_price', i.unit_price, 'quantity', i.quantity, 'line_total', i.line_total, 'is_gift', i.is_gift,
        'points_earned', i.points_earned, 'slug', p.slug) order by i.is_gift, i.id), '[]'::jsonb)
      from order_items i left join products p on p.id = i.product_id where i.order_id = o.id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('status', h.status, 'note', h.note, 'at', h.created_at) order by h.created_at), '[]'::jsonb)
      from order_status_history h where h.order_id = o.id),
    'payment', (select jsonb_build_object('provider', p.provider, 'status', p.status, 'provider_order_id', p.provider_order_id, 'provider_payment_id', p.provider_payment_id, 'amount', p.amount)
      from payments p where p.order_id = o.id order by p.created_at desc limit 1)
  )
  from orders o join profiles pr on pr.id = o.user_id
  where o.id = p_order_id and (o.user_id = auth.uid() or is_admin());
$$;

create or replace function list_my_orders(p_page int default 1, p_page_size int default 10) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'payment_status', o.payment_status,
        'grand_total', o.grand_total, 'placed_at', o.placed_at, 'item_count', (select sum(quantity) from order_items i where i.order_id = o.id),
        'preview', (select coalesce(jsonb_agg(jsonb_build_object('image_url', i.image_url, 'product_name', i.product_name)), '[]'::jsonb)
                    from (select * from order_items where order_id = o.id order by is_gift, id limit 3) i)) order by o.placed_at desc)
      from (select * from orders where user_id = auth.uid() order by placed_at desc
            offset (greatest(coalesce(p_page, 1), 1) - 1) * coalesce(p_page_size, 10) limit coalesce(p_page_size, 10)) o), '[]'::jsonb),
    'total', (select count(*) from orders where user_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create or replace function submit_review(p_product_id uuid, p_rating int, p_title text, p_body text, p_images text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := require_user(); v_order uuid; v_r reviews;
begin
  if p_rating not between 1 and 5 then raise exception 'Rating must be between 1 and 5.'; end if;
  if length(trim(coalesce(p_body, ''))) < 10 then raise exception 'Please write at least a few words.'; end if;

  select o.id into v_order
  from orders o join order_items oi on oi.order_id = o.id
  where o.user_id = v_uid and o.status = 'delivered' and oi.is_gift = false
    and (oi.product_id = p_product_id or oi.product_id in (
      select b.bundle_product_id from product_bundle_items b join product_variants bv on bv.id = b.variant_id where bv.product_id = p_product_id))
  order by o.placed_at desc limit 1;
  if v_order is null then
    raise exception 'Reviews can be written once your order has been delivered.';
  end if;

  insert into reviews (product_id, user_id, order_id, rating, title, body, images, is_verified, status)
  values (p_product_id, v_uid, v_order, p_rating, nullif(trim(coalesce(p_title, '')), ''), trim(p_body), coalesce(p_images, '{}'), true, 'approved')
  on conflict (product_id, user_id) do update
    set rating = excluded.rating, title = excluded.title, body = excluded.body, images = excluded.images, status = 'approved', order_id = excluded.order_id
  returning * into v_r;
  return jsonb_build_object('id', v_r.id, 'status', v_r.status, 'is_verified', v_r.is_verified);
end $$;

create or replace function list_my_reviews() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'title', r.title, 'body', r.body, 'status', r.status,
    'created_at', r.created_at, 'product', jsonb_build_object('name', p.name, 'slug', p.slug,
      'image', (select url from product_images i where i.product_id = p.id order by i.is_primary desc, i.sort_order limit 1))) order by r.created_at desc), '[]'::jsonb)
  from reviews r join products p on p.id = r.product_id where r.user_id = auth.uid();
$$;

-- Products the customer has received but not yet reviewed.
create or replace function reviewable_products() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(product_card(p)), '[]'::jsonb)
  from products p
  where p.is_published and p.id in (
    select oi.product_id from orders o join order_items oi on oi.order_id = o.id
    where o.user_id = auth.uid() and o.status = 'delivered' and oi.is_gift = false and oi.product_id is not null)
    and not exists (select 1 from reviews r where r.product_id = p.id and r.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Wishlist
-- ---------------------------------------------------------------------------
create or replace function toggle_wishlist(p_product_id uuid, p_variant_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := require_user(); v_wl uuid; v_added boolean;
begin
  insert into wishlists (user_id) values (v_uid) on conflict (user_id) do nothing;
  select id into v_wl from wishlists where user_id = v_uid;
  if exists (select 1 from wishlist_items where wishlist_id = v_wl and product_id = p_product_id) then
    delete from wishlist_items where wishlist_id = v_wl and product_id = p_product_id;
    v_added := false;
  else
    insert into wishlist_items (wishlist_id, product_id, variant_id) values (v_wl, p_product_id, p_variant_id);
    v_added := true;
  end if;
  return jsonb_build_object('added', v_added, 'count', (select count(*) from wishlist_items where wishlist_id = v_wl));
end $$;

create or replace function get_wishlist() returns jsonb
language sql stable security definer set search_path = public as $$
  with loy as (select get_setting('loyalty') as s),
       acct as (select coalesce((select available_points from loyalty_accounts where user_id = auth.uid()), 0) as balance)
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(product_card(p) || jsonb_build_object(
        'wishlist_item_id', wi.id, 'variant_id', wi.variant_id, 'added_at', wi.created_at,
        'points_required', ceil(coalesce(v.price_override, p.price) / nullif((loy.s ->> 'point_value_rupees')::numeric, 0))::int,
        'redeemable', coalesce((loy.s ->> 'wishlist_redemption_enabled')::boolean, false)
          and coalesce((p.attributes ->> 'points_redeemable')::boolean, true)
          and coalesce(v.price_override, p.price) <= coalesce((loy.s ->> 'wishlist_redeem_max_price')::numeric, 0)
          and ceil(coalesce(v.price_override, p.price) / nullif((loy.s ->> 'point_value_rupees')::numeric, 0)) >= coalesce((loy.s ->> 'min_redeem_points')::int, 0)
      ) order by wi.created_at desc)
      from wishlist_items wi join wishlists w on w.id = wi.wishlist_id join products p on p.id = wi.product_id
      left join product_variants v on v.id = coalesce(wi.variant_id, (select id from product_variants where product_id = p.id and is_active order by sort_order limit 1)),
      loy
      where w.user_id = auth.uid() and p.is_published), '[]'::jsonb),
    'product_ids', coalesce((select jsonb_agg(wi.product_id) from wishlist_items wi join wishlists w on w.id = wi.wishlist_id where w.user_id = auth.uid()), '[]'::jsonb),
    'balance', (select balance from acct),
    'redemption_enabled', (select coalesce((s ->> 'wishlist_redemption_enabled')::boolean, false) from loy)
  );
$$;

-- Redeem points for a wishlisted product: creates a fully points-paid order.
create or replace function redeem_wishlist_item(p_product_id uuid, p_variant_id uuid, p_address_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := require_user();
  v_loy   jsonb := get_setting('loyalty');
  v_pval  numeric := coalesce((v_loy ->> 'point_value_rupees')::numeric, 0);
  v_row   record;
  v_need  int;
  v_bal   int;
  v_addr  addresses;
  v_order orders;
begin
  if not coalesce((v_loy ->> 'wishlist_redemption_enabled')::boolean, false) then
    raise exception 'Wishlist redemption is currently paused.';
  end if;
  if v_pval <= 0 then raise exception 'Redemption is not configured.'; end if;
  if not exists (select 1 from wishlist_items wi join wishlists w on w.id = wi.wishlist_id where w.user_id = v_uid and wi.product_id = p_product_id) then
    raise exception 'Add this product to your wishlist first.';
  end if;

  select * into v_addr from addresses where id = p_address_id and user_id = v_uid;
  if not found then raise exception 'Choose a delivery address.'; end if;

  perform 1 from inventory where variant_id = p_variant_id for update;
  select v.id as variant_id, v.name as variant_name, p.id as product_id, p.name as product_name, p.slug, p.attributes,
         coalesce(v.price_override, p.price) as price, coalesce(i.quantity, 0) as stock, s.name as shade_name, s.hex as shade_hex,
         (select url from product_images im where im.product_id = p.id order by (im.shade_id = v.shade_id) desc nulls last, im.is_primary desc, im.sort_order limit 1) as image_url,
         (v.is_active and p.is_published and not p.is_gift_only) as purchasable
  into v_row
  from product_variants v join products p on p.id = v.product_id
  left join inventory i on i.variant_id = v.id left join product_shades s on s.id = v.shade_id
  where v.id = p_variant_id and v.product_id = p_product_id;
  if not found or not v_row.purchasable then raise exception 'This product is not available.'; end if;
  if v_row.stock < 1 then raise exception 'This product is sold out.'; end if;
  if not coalesce((v_row.attributes ->> 'points_redeemable')::boolean, true)
     or v_row.price > coalesce((v_loy ->> 'wishlist_redeem_max_price')::numeric, 0) then
    raise exception 'This product is not eligible for point redemption.';
  end if;

  v_need := ceil(v_row.price / v_pval)::int;
  if v_need < coalesce((v_loy ->> 'min_redeem_points')::int, 0) then
    raise exception 'This product is below the minimum redemption value.';
  end if;
  select available_points into v_bal from loyalty_accounts where user_id = v_uid for update;
  if coalesce(v_bal, 0) < v_need then
    raise exception 'You need % points to redeem this — you have %.', v_need, coalesce(v_bal, 0);
  end if;

  insert into orders (user_id, status, payment_status, payment_method, subtotal, points_redeemed, points_discount, shipping_total, tax_total, grand_total, points_earned, shipping_address)
  values (v_uid, 'confirmed', 'paid', 'points', v_row.price, v_need, v_row.price, 0, 0, 0, 0,
          jsonb_build_object('full_name', v_addr.full_name, 'phone', v_addr.phone, 'line1', v_addr.line1, 'line2', v_addr.line2,
                             'city', v_addr.city, 'state', v_addr.state, 'postal_code', v_addr.postal_code, 'country', v_addr.country))
  returning * into v_order;

  insert into order_items (order_id, product_id, variant_id, product_name, variant_name, shade_name, shade_hex, image_url, unit_price, quantity, line_total, is_gift, points_earned)
  values (v_order.id, v_row.product_id, v_row.variant_id, v_row.product_name, v_row.variant_name, v_row.shade_name, v_row.shade_hex, v_row.image_url, v_row.price, 1, v_row.price, false, 0);

  update inventory set quantity = quantity - 1 where variant_id = v_row.variant_id;
  insert into inventory_movements (variant_id, delta, reason, reference, created_by) values (v_row.variant_id, -1, 'sale', v_order.order_number, v_uid);
  perform _loyalty_apply(v_uid, 'redeem', -v_need, v_order.id, 'Redeemed ' || v_row.product_name || ' from wishlist', v_uid);
  insert into payments (order_id, provider, amount, status) values (v_order.id, 'points', 0, 'paid');

  delete from wishlist_items where product_id = p_product_id and wishlist_id = (select id from wishlists where user_id = v_uid);

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'points_used', v_need);
end $$;

-- ---------------------------------------------------------------------------
-- Server-side cart persistence for signed-in customers.
-- ---------------------------------------------------------------------------
create or replace function sync_cart(p_items jsonb, p_replace boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := require_user(); v_cart uuid;
begin
  insert into carts (user_id) values (v_uid) on conflict (user_id) do update set updated_at = now() returning id into v_cart;
  if p_replace then
    delete from cart_items where cart_id = v_cart;
  end if;
  insert into cart_items (cart_id, variant_id, quantity)
  select v_cart, (e ->> 'variant_id')::uuid, least(greatest((e ->> 'quantity')::int, 1), 20)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
  where exists (select 1 from product_variants v where v.id = (e ->> 'variant_id')::uuid)
  on conflict (cart_id, variant_id) do update
    set quantity = case when p_replace then excluded.quantity else least(cart_items.quantity + excluded.quantity, 20) end;
  return (select coalesce(jsonb_agg(jsonb_build_object('variant_id', variant_id, 'quantity', quantity) order by created_at), '[]'::jsonb)
          from cart_items where cart_id = v_cart);
end $$;

-- ---------------------------------------------------------------------------
-- Customer account
-- ---------------------------------------------------------------------------
create or replace function get_my_dashboard() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select jsonb_build_object('id', id, 'full_name', full_name, 'email', email, 'phone', phone, 'created_at', created_at) from profiles where id = auth.uid()),
    'recent_order', (select jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'grand_total', o.grand_total, 'placed_at', o.placed_at,
        'item_count', (select sum(quantity) from order_items i where i.order_id = o.id))
      from orders o where o.user_id = auth.uid() order by o.placed_at desc limit 1),
    'order_count', (select count(*) from orders where user_id = auth.uid()),
    'loyalty', (select jsonb_build_object('available', available_points, 'lifetime', lifetime_points, 'redeemed', redeemed_points) from loyalty_accounts where user_id = auth.uid()),
    'wishlist_count', (select count(*) from wishlist_items wi join wishlists w on w.id = wi.wishlist_id where w.user_id = auth.uid()),
    'active_coupons', (select count(*) from coupons c where c.is_active and c.is_public and c.starts_at <= now() and (c.expires_at is null or c.expires_at > now())
        and (select count(*) from coupon_usage u where u.coupon_id = c.id and u.user_id = auth.uid()) < c.per_user_limit),
    'recommended', (select coalesce(jsonb_agg(product_card(p)), '[]'::jsonb) from (
        select p.* from products p join product_stats st on st.product_id = p.id
        where p.is_published and not p.is_gift_only
          and p.id not in (select oi.product_id from orders o join order_items oi on oi.order_id = o.id where o.user_id = auth.uid() and oi.product_id is not null)
        order by (p.category_id in (
            select p2.category_id from orders o join order_items oi on oi.order_id = o.id join products p2 on p2.id = oi.product_id where o.user_id = auth.uid()
            union select p3.category_id from wishlist_items wi join wishlists w on w.id = wi.wishlist_id join products p3 on p3.id = wi.product_id where w.user_id = auth.uid()
          )) desc, st.units_sold desc, p.is_best_seller desc, p.created_at desc
        limit 4) p)
  );
$$;

create or replace function get_my_loyalty() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'account', (select jsonb_build_object('available', available_points, 'lifetime', lifetime_points, 'redeemed', redeemed_points) from loyalty_accounts where user_id = auth.uid()),
    'settings', get_setting('loyalty') - 'wishlist_redeem_max_price',
    'transactions', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'type', t.type, 'points', t.points, 'balance_after', t.balance_after,
        'description', t.description, 'created_at', t.created_at, 'order_number', o.order_number) order by t.created_at desc), '[]'::jsonb)
      from (select * from loyalty_transactions where user_id = auth.uid() order by created_at desc limit 50) t left join orders o on o.id = t.order_id)
  );
$$;

create or replace function list_my_coupons() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'description', c.description, 'type', c.type, 'value', c.value,
    'min_order_value', c.min_order_value, 'max_discount', c.max_discount, 'expires_at', c.expires_at, 'first_order_only', c.first_order_only,
    'used', (select count(*) from coupon_usage u where u.coupon_id = c.id and u.user_id = auth.uid()) >= c.per_user_limit) order by c.expires_at nulls last), '[]'::jsonb)
  from coupons c where c.is_active and c.is_public and c.starts_at <= now() and (c.expires_at is null or c.expires_at > now());
$$;

create or replace function subscribe_newsletter(p_email text, p_source text default 'footer') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.';
  end if;
  if exists (select 1 from newsletter_subscribers where email = v_email) then
    return jsonb_build_object('status', 'already_subscribed');
  end if;
  insert into newsletter_subscribers (email, source) values (v_email, p_source);
  return jsonb_build_object('status', 'subscribed');
end $$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
create or replace function admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform require_admin();
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'revenue', (select coalesce(sum(grand_total), 0) from orders where status not in ('cancelled', 'refunded') and payment_status in ('paid', 'cod')),
      'revenue_30d', (select coalesce(sum(grand_total), 0) from orders where status not in ('cancelled', 'refunded') and payment_status in ('paid', 'cod') and placed_at > now() - interval '30 days'),
      'orders', (select count(*) from orders),
      'pending_orders', (select count(*) from orders where status in ('pending', 'confirmed', 'processing', 'packed')),
      'customers', (select count(*) from profiles where role = 'customer'),
      'products', (select count(*) from products),
      'published_products', (select count(*) from products where is_published),
      'low_stock', (select count(*) from inventory i join product_variants v on v.id = i.variant_id where v.is_active and i.quantity <= i.low_stock_threshold),
      'out_of_stock', (select count(*) from inventory i join product_variants v on v.id = i.variant_id where v.is_active and i.quantity = 0),
      'pending_reviews', (select count(*) from reviews where status = 'pending'),
      'coupon_uses', (select count(*) from coupon_usage),
      'coupon_discount', (select coalesce(sum(discount_amount), 0) from coupon_usage),
      'points_issued', (select coalesce(sum(points), 0) from loyalty_transactions where type = 'earn'),
      'points_redeemed', (select coalesce(-sum(points), 0) from loyalty_transactions where type = 'redeem'),
      'refund_requests', (select count(*) from orders where status = 'refund_requested')
    ),
    'revenue_series', (select coalesce(jsonb_agg(jsonb_build_object('date', d, 'revenue', coalesce(r.rev, 0), 'orders', coalesce(r.cnt, 0)) order by d), '[]'::jsonb)
      from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') d
      left join (select placed_at::date as dt, sum(grand_total) rev, count(*) cnt from orders where status not in ('cancelled', 'refunded') and placed_at > now() - interval '30 days' group by 1) r on r.dt = d::date),
    'customer_series', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon'), 'customers', coalesce(c.cnt, 0)) order by m), '[]'::jsonb)
      from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
      left join (select date_trunc('month', created_at) mo, count(*) cnt from profiles where role = 'customer' group by 1) c on c.mo = m),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'units', t.units, 'revenue', t.revenue,
        'image', (select url from product_images i where i.product_id = p.id order by i.is_primary desc, i.sort_order limit 1)) order by t.units desc), '[]'::jsonb)
      from (select oi.product_id, sum(oi.quantity) units, sum(oi.line_total) revenue from order_items oi join orders o on o.id = oi.order_id
            where o.status not in ('cancelled', 'refunded', 'pending') and oi.is_gift = false and oi.product_id is not null group by 1 order by units desc limit 6) t
      join products p on p.id = t.product_id),
    'category_performance', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'slug', c.slug, 'units', coalesce(t.units, 0), 'revenue', coalesce(t.revenue, 0)) order by c.sort_order), '[]'::jsonb)
      from categories c left join (
        select p.category_id, sum(oi.quantity) units, sum(oi.line_total) revenue from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
        where o.status not in ('cancelled', 'refunded', 'pending') and oi.is_gift = false group by 1) t on t.category_id = c.id),
    'status_breakdown', (select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) from (select status, count(*) cnt from orders group by 1) s),
    'recent_orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'payment_status', o.payment_status,
        'grand_total', o.grand_total, 'placed_at', o.placed_at, 'customer', pr.full_name, 'email', pr.email) order by o.placed_at desc), '[]'::jsonb)
      from (select * from orders order by placed_at desc limit 8) o join profiles pr on pr.id = o.user_id),
    'low_stock_items', (select coalesce(jsonb_agg(jsonb_build_object('variant_id', v.id, 'product', p.name, 'variant', v.name, 'quantity', i.quantity, 'threshold', i.low_stock_threshold) order by i.quantity), '[]'::jsonb)
      from inventory i join product_variants v on v.id = i.variant_id join products p on p.id = v.product_id
      where v.is_active and i.quantity <= i.low_stock_threshold limit 8)
  ) into v_out;
  return v_out;
end $$;

create or replace function admin_list_orders(p_status text default null, p_query text default null, p_page int default 1, p_page_size int default 20) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb; v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform require_admin();
  with f as (
    select o.*, pr.full_name, pr.email
    from orders o join profiles pr on pr.id = o.user_id
    where (p_status is null or p_status = '' or o.status = p_status::order_status)
      and (v_q is null or o.order_number ilike '%' || v_q || '%' or pr.email ilike '%' || v_q || '%' or pr.full_name ilike '%' || v_q || '%')
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'order_number', f.order_number, 'status', f.status, 'payment_status', f.payment_status,
        'payment_method', f.payment_method, 'grand_total', f.grand_total, 'placed_at', f.placed_at, 'customer', f.full_name, 'email', f.email,
        'item_count', (select sum(quantity) from order_items i where i.order_id = f.id)) order by f.placed_at desc)
      from (select * from f order by placed_at desc offset (greatest(p_page, 1) - 1) * p_page_size limit p_page_size) f), '[]'::jsonb),
    'total', (select count(*) from f)
  ) into v_out;
  return v_out;
end $$;

create or replace function admin_list_customers(p_query text default null, p_page int default 1, p_page_size int default 20) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb; v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform require_admin();
  with f as (
    select pr.*,
      (select count(*) from orders o where o.user_id = pr.id) as order_count,
      (select coalesce(sum(grand_total), 0) from orders o where o.user_id = pr.id and o.status not in ('cancelled', 'refunded') and o.payment_status in ('paid', 'cod')) as lifetime_spend,
      coalesce((select available_points from loyalty_accounts l where l.user_id = pr.id), 0) as points
    from profiles pr
    where (v_q is null or pr.email ilike '%' || v_q || '%' or pr.full_name ilike '%' || v_q || '%' or pr.phone ilike '%' || v_q || '%')
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'full_name', f.full_name, 'email', f.email, 'phone', f.phone, 'role', f.role, 'status', f.status,
        'created_at', f.created_at, 'order_count', f.order_count, 'lifetime_spend', f.lifetime_spend, 'points', f.points) order by f.created_at desc)
      from (select * from f order by created_at desc offset (greatest(p_page, 1) - 1) * p_page_size limit p_page_size) f), '[]'::jsonb),
    'total', (select count(*) from f)
  ) into v_out;
  return v_out;
end $$;

create or replace function admin_customer_detail(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform require_admin();
  select jsonb_build_object(
    'profile', (select jsonb_build_object('id', id, 'full_name', full_name, 'email', email, 'phone', phone, 'role', role, 'status', status, 'created_at', created_at) from profiles where id = p_user_id),
    'lifetime_spend', (select coalesce(sum(grand_total), 0) from orders where user_id = p_user_id and status not in ('cancelled', 'refunded') and payment_status in ('paid', 'cod')),
    'loyalty', (select jsonb_build_object('available', available_points, 'lifetime', lifetime_points, 'redeemed', redeemed_points) from loyalty_accounts where user_id = p_user_id),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'order_number', order_number, 'status', status, 'payment_status', payment_status, 'grand_total', grand_total, 'placed_at', placed_at) order by placed_at desc), '[]'::jsonb)
      from orders where user_id = p_user_id),
    'wishlist', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug)), '[]'::jsonb)
      from wishlist_items wi join wishlists w on w.id = wi.wishlist_id join products p on p.id = wi.product_id where w.user_id = p_user_id),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'title', r.title, 'body', r.body, 'status', r.status, 'product', p.name, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
      from reviews r join products p on p.id = r.product_id where r.user_id = p_user_id),
    'addresses', (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'state', state, 'postal_code', postal_code)), '[]'::jsonb) from addresses where user_id = p_user_id),
    'points_history', (select coalesce(jsonb_agg(jsonb_build_object('type', type, 'points', points, 'description', description, 'created_at', created_at) order by created_at desc), '[]'::jsonb)
      from (select * from loyalty_transactions where user_id = p_user_id order by created_at desc limit 20) t)
  ) into v_out;
  return v_out;
end $$;

create or replace function admin_set_customer_status(p_user_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if p_user_id = auth.uid() then raise exception 'You cannot change your own status.'; end if;
  update profiles set status = p_status::account_status where id = p_user_id;
end $$;

create or replace function admin_adjust_points(p_user_id uuid, p_points int, p_description text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_bal int;
begin
  perform require_admin();
  if p_points = 0 then raise exception 'Enter a non-zero amount.'; end if;
  if p_points < 0 and coalesce((select available_points from loyalty_accounts where user_id = p_user_id), 0) < -p_points then
    raise exception 'Customer does not have that many points.';
  end if;
  v_bal := _loyalty_apply(p_user_id, 'adjust', p_points, null, coalesce(nullif(p_description, ''), 'Manual adjustment'), auth.uid());
  return jsonb_build_object('balance', v_bal);
end $$;

create or replace function admin_adjust_inventory(p_variant_id uuid, p_delta int, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_qty int;
begin
  perform require_admin();
  insert into inventory (variant_id, quantity) values (p_variant_id, 0) on conflict do nothing;
  select quantity into v_qty from inventory where variant_id = p_variant_id for update;
  if v_qty + p_delta < 0 then raise exception 'Stock cannot go negative (% in stock).', v_qty; end if;
  update inventory set quantity = quantity + p_delta where variant_id = p_variant_id returning quantity into v_qty;
  insert into inventory_movements (variant_id, delta, reason, reference, created_by)
  values (p_variant_id, p_delta, p_reason::inventory_reason, p_note, auth.uid());
  return jsonb_build_object('quantity', v_qty);
end $$;

create or replace function admin_inventory(p_query text default null, p_low_only boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb; v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('variant_id', v.id, 'sku', v.sku, 'product_id', p.id, 'product', p.name, 'variant', v.name, 'shade_hex', s.hex,
      'quantity', coalesce(i.quantity, 0), 'threshold', coalesce(i.low_stock_threshold, 5), 'is_active', v.is_active, 'updated_at', i.updated_at,
      'image', (select url from product_images im where im.product_id = p.id order by im.is_primary desc, im.sort_order limit 1))
    order by (coalesce(i.quantity, 0) <= coalesce(i.low_stock_threshold, 5)) desc, p.name, v.sort_order), '[]'::jsonb)
  into v_out
  from product_variants v join products p on p.id = v.product_id left join inventory i on i.variant_id = v.id left join product_shades s on s.id = v.shade_id
  where (v_q is null or p.name ilike '%' || v_q || '%' or v.name ilike '%' || v_q || '%' or v.sku ilike '%' || v_q || '%')
    and (not p_low_only or coalesce(i.quantity, 0) <= coalesce(i.low_stock_threshold, 5));
  return v_out;
end $$;

create or replace function admin_inventory_history(p_variant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'delta', m.delta, 'reason', m.reason, 'reference', m.reference, 'created_at', m.created_at, 'by', pr.full_name) order by m.created_at desc), '[]'::jsonb)
  into v_out from (select * from inventory_movements where variant_id = p_variant_id order by created_at desc limit 50) m left join profiles pr on pr.id = m.created_by;
  return v_out;
end $$;

-- Full product editor payload and save (product + shades + variants + images + stock in one transaction).
create or replace function admin_get_product(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform require_admin();
  select jsonb_build_object(
    'product', to_jsonb(p) - 'search_vector',
    'shades', (select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order), '[]'::jsonb) from product_shades s where s.product_id = p.id),
    'variants', (select coalesce(jsonb_agg((to_jsonb(v) || jsonb_build_object('quantity', coalesce(i.quantity, 0), 'low_stock_threshold', coalesce(i.low_stock_threshold, 5))) order by v.sort_order), '[]'::jsonb)
      from product_variants v left join inventory i on i.variant_id = v.id where v.product_id = p.id),
    'images', (select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order), '[]'::jsonb) from product_images i where i.product_id = p.id),
    'bundle_items', (select coalesce(jsonb_agg(jsonb_build_object('variant_id', b.variant_id, 'quantity', b.quantity, 'label', bp.name || ' · ' || bv.name) order by b.sort_order), '[]'::jsonb)
      from product_bundle_items b join product_variants bv on bv.id = b.variant_id join products bp on bp.id = bv.product_id where b.bundle_product_id = p.id),
    'recommendations', (select coalesce(jsonb_agg(jsonb_build_object('product_id', r.recommended_product_id, 'kind', r.kind, 'name', rp.name) order by r.kind, r.sort_order), '[]'::jsonb)
      from product_recommendations r join products rp on rp.id = r.recommended_product_id where r.product_id = p.id)
  ) into v_out from products p where p.id = p_id;
  return v_out;
end $$;

create or replace function admin_save_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid := nullif(p ->> 'id', '')::uuid;
  v_prod jsonb := p -> 'product';
  v_s    jsonb; v_v jsonb; v_i jsonb;
  v_sid  uuid; v_vid uuid;
  v_keep uuid[] := '{}';
  v_shade_map jsonb := '{}'::jsonb;   -- client temp id -> real id
  v_n    int := 0;
begin
  perform require_admin();
  if v_prod is null then raise exception 'product payload missing'; end if;

  if v_id is null then
    insert into products (slug, name, short_description, description, benefits, how_to_use, ingredients, size_label, finish, coverage, suitability,
                          category_id, subcategory_id, price, compare_at_price, loyalty_points, attributes, video_url, is_published, is_best_seller, is_new, is_gift_only)
    values (v_prod ->> 'slug', v_prod ->> 'name', v_prod ->> 'short_description', v_prod ->> 'description',
            array(select jsonb_array_elements_text(coalesce(v_prod -> 'benefits', '[]'::jsonb))),
            v_prod ->> 'how_to_use', v_prod ->> 'ingredients', v_prod ->> 'size_label', v_prod ->> 'finish', v_prod ->> 'coverage', v_prod ->> 'suitability',
            (v_prod ->> 'category_id')::uuid, nullif(v_prod ->> 'subcategory_id', '')::uuid, (v_prod ->> 'price')::numeric, nullif(v_prod ->> 'compare_at_price', '')::numeric,
            nullif(v_prod ->> 'loyalty_points', '')::int, coalesce(v_prod -> 'attributes', '{}'::jsonb), nullif(v_prod ->> 'video_url', ''),
            coalesce((v_prod ->> 'is_published')::boolean, false), coalesce((v_prod ->> 'is_best_seller')::boolean, false),
            coalesce((v_prod ->> 'is_new')::boolean, false), coalesce((v_prod ->> 'is_gift_only')::boolean, false))
    returning id into v_id;
  else
    update products set
      slug = v_prod ->> 'slug', name = v_prod ->> 'name', short_description = v_prod ->> 'short_description', description = v_prod ->> 'description',
      benefits = array(select jsonb_array_elements_text(coalesce(v_prod -> 'benefits', '[]'::jsonb))),
      how_to_use = v_prod ->> 'how_to_use', ingredients = v_prod ->> 'ingredients', size_label = v_prod ->> 'size_label', finish = v_prod ->> 'finish',
      coverage = v_prod ->> 'coverage', suitability = v_prod ->> 'suitability',
      category_id = (v_prod ->> 'category_id')::uuid, subcategory_id = nullif(v_prod ->> 'subcategory_id', '')::uuid,
      price = (v_prod ->> 'price')::numeric, compare_at_price = nullif(v_prod ->> 'compare_at_price', '')::numeric,
      loyalty_points = nullif(v_prod ->> 'loyalty_points', '')::int, attributes = coalesce(v_prod -> 'attributes', '{}'::jsonb), video_url = nullif(v_prod ->> 'video_url', ''),
      is_published = coalesce((v_prod ->> 'is_published')::boolean, false), is_best_seller = coalesce((v_prod ->> 'is_best_seller')::boolean, false),
      is_new = coalesce((v_prod ->> 'is_new')::boolean, false), is_gift_only = coalesce((v_prod ->> 'is_gift_only')::boolean, false)
    where id = v_id;
  end if;

  -- Shades ------------------------------------------------------------------
  v_keep := '{}'; v_n := 0;
  for v_s in select * from jsonb_array_elements(coalesce(p -> 'shades', '[]'::jsonb)) loop
    v_n := v_n + 1;
    if (v_s ->> 'id') ~ '^[0-9a-f]{8}-' then
      update product_shades set name = v_s ->> 'name', hex = v_s ->> 'hex', undertone = nullif(v_s ->> 'undertone', ''), description = v_s ->> 'description',
             sort_order = v_n, is_active = coalesce((v_s ->> 'is_active')::boolean, true)
       where id = (v_s ->> 'id')::uuid and product_id = v_id returning id into v_sid;
    else
      v_sid := null;
    end if;
    if v_sid is null then
      insert into product_shades (product_id, name, hex, undertone, description, sort_order, is_active)
      values (v_id, v_s ->> 'name', v_s ->> 'hex', nullif(v_s ->> 'undertone', ''), v_s ->> 'description', v_n, coalesce((v_s ->> 'is_active')::boolean, true))
      returning id into v_sid;
    end if;
    v_shade_map := v_shade_map || jsonb_build_object(coalesce(v_s ->> 'id', ''), v_sid);
    v_keep := v_keep || v_sid;
  end loop;
  delete from product_shades where product_id = v_id and not (id = any(v_keep));

  -- Variants + inventory ----------------------------------------------------
  v_keep := '{}'; v_n := 0;
  for v_v in select * from jsonb_array_elements(coalesce(p -> 'variants', '[]'::jsonb)) loop
    v_n := v_n + 1;
    v_sid := nullif(coalesce(v_shade_map ->> coalesce(v_v ->> 'shade_id', ''), v_v ->> 'shade_id'), '')::uuid;
    v_vid := null;
    if (v_v ->> 'id') ~ '^[0-9a-f]{8}-' then
      update product_variants set shade_id = v_sid, sku = v_v ->> 'sku', name = v_v ->> 'name', options = coalesce(v_v -> 'options', '{}'::jsonb),
             price_override = nullif(v_v ->> 'price_override', '')::numeric, sort_order = v_n, is_active = coalesce((v_v ->> 'is_active')::boolean, true)
       where id = (v_v ->> 'id')::uuid and product_id = v_id returning id into v_vid;
    end if;
    if v_vid is null then
      insert into product_variants (product_id, shade_id, sku, name, options, price_override, sort_order, is_active)
      values (v_id, v_sid, v_v ->> 'sku', v_v ->> 'name', coalesce(v_v -> 'options', '{}'::jsonb), nullif(v_v ->> 'price_override', '')::numeric, v_n, coalesce((v_v ->> 'is_active')::boolean, true))
      returning id into v_vid;
      insert into inventory (variant_id, quantity, low_stock_threshold)
      values (v_vid, greatest(coalesce((v_v ->> 'quantity')::int, 0), 0), coalesce((v_v ->> 'low_stock_threshold')::int, 5));
      if coalesce((v_v ->> 'quantity')::int, 0) > 0 then
        insert into inventory_movements (variant_id, delta, reason, reference, created_by) values (v_vid, (v_v ->> 'quantity')::int, 'initial', 'Product editor', auth.uid());
      end if;
    else
      update inventory set low_stock_threshold = coalesce((v_v ->> 'low_stock_threshold')::int, low_stock_threshold) where variant_id = v_vid;
      -- Stock changes from the editor go through the movement log so history stays honest.
      if v_v ? 'quantity' and (v_v ->> 'quantity')::int <> coalesce((select quantity from inventory where variant_id = v_vid), 0) then
        insert into inventory (variant_id, quantity) values (v_vid, 0) on conflict do nothing;
        insert into inventory_movements (variant_id, delta, reason, reference, created_by)
        values (v_vid, (v_v ->> 'quantity')::int - (select quantity from inventory where variant_id = v_vid), 'adjustment', 'Product editor', auth.uid());
        update inventory set quantity = (v_v ->> 'quantity')::int where variant_id = v_vid;
      end if;
    end if;
    v_keep := v_keep || v_vid;
  end loop;
  -- Variants referenced by orders are deactivated, not deleted.
  update product_variants set is_active = false where product_id = v_id and not (id = any(v_keep))
    and (exists (select 1 from order_items where variant_id = product_variants.id) or exists (select 1 from gift_rules where gift_variant_id = product_variants.id));
  delete from product_variants where product_id = v_id and not (id = any(v_keep))
    and not exists (select 1 from order_items where variant_id = product_variants.id)
    and not exists (select 1 from gift_rules where gift_variant_id = product_variants.id);

  -- Images ------------------------------------------------------------------
  delete from product_images where product_id = v_id;
  v_n := 0;
  for v_i in select * from jsonb_array_elements(coalesce(p -> 'images', '[]'::jsonb)) loop
    v_n := v_n + 1;
    insert into product_images (product_id, shade_id, url, alt, sort_order, is_primary)
    values (v_id, nullif(coalesce(v_shade_map ->> coalesce(v_i ->> 'shade_id', ''), v_i ->> 'shade_id'), '')::uuid, v_i ->> 'url', coalesce(v_i ->> 'alt', ''), v_n, v_n = 1);
  end loop;

  -- Bundle composition & recommendations -----------------------------------
  if p ? 'bundle_items' then
    delete from product_bundle_items where bundle_product_id = v_id;
    insert into product_bundle_items (bundle_product_id, variant_id, quantity, sort_order)
    select v_id, (e ->> 'variant_id')::uuid, coalesce((e ->> 'quantity')::int, 1), ord
    from jsonb_array_elements(p -> 'bundle_items') with ordinality as t(e, ord)
    where (e ->> 'variant_id') is not null;
  end if;
  if p ? 'recommendations' then
    delete from product_recommendations where product_id = v_id;
    insert into product_recommendations (product_id, recommended_product_id, kind, sort_order)
    select v_id, (e ->> 'product_id')::uuid, (e ->> 'kind')::recommendation_kind, ord
    from jsonb_array_elements(p -> 'recommendations') with ordinality as t(e, ord)
    where (e ->> 'product_id')::uuid <> v_id
    on conflict do nothing;
  end if;

  return admin_get_product(v_id);
end $$;

create or replace function admin_list_products(p_query text default null, p_category uuid default null, p_status text default null, p_page int default 1, p_page_size int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb; v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform require_admin();
  with f as (
    select p.*, c.name as category_name, sc.name as subcategory_name, st.total_stock, st.units_sold, st.avg_rating, st.review_count,
      (select count(*) from product_variants v where v.product_id = p.id) as variant_count,
      (select url from product_images i where i.product_id = p.id order by i.is_primary desc, i.sort_order limit 1) as image
    from products p join categories c on c.id = p.category_id left join subcategories sc on sc.id = p.subcategory_id
    join product_stats st on st.product_id = p.id
    where (v_q is null or p.name ilike '%' || v_q || '%' or p.slug ilike '%' || v_q || '%')
      and (p_category is null or p.category_id = p_category)
      and (p_status is null or p_status = '' or (p_status = 'published' and p.is_published) or (p_status = 'draft' and not p.is_published)
           or (p_status = 'low_stock' and st.total_stock <= st.low_threshold))
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'slug', f.slug, 'price', f.price, 'compare_at_price', f.compare_at_price,
        'is_published', f.is_published, 'is_best_seller', f.is_best_seller, 'is_new', f.is_new, 'category', f.category_name, 'subcategory', f.subcategory_name,
        'stock', f.total_stock, 'units_sold', f.units_sold, 'rating', f.avg_rating, 'review_count', f.review_count, 'variant_count', f.variant_count,
        'image', f.image, 'updated_at', f.updated_at) order by f.updated_at desc)
      from (select * from f order by updated_at desc offset (greatest(p_page, 1) - 1) * p_page_size limit p_page_size) f), '[]'::jsonb),
    'total', (select count(*) from f)
  ) into v_out;
  return v_out;
end $$;

create or replace function admin_delete_product(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if exists (select 1 from order_items where product_id = p_id) then
    -- keep order history intact: unpublish instead of hard delete
    update products set is_published = false where id = p_id;
  else
    delete from products where id = p_id;
  end if;
end $$;

create or replace function admin_delete_category(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  if exists (select 1 from products where category_id = p_id) then
    raise exception 'This category still has products. Move or delete them first.';
  end if;
  delete from categories where id = p_id;
end $$;

create or replace function admin_delete_subcategory(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  update products set subcategory_id = null where subcategory_id = p_id;
  delete from subcategories where id = p_id;
end $$;

create or replace function admin_reviews(p_status text default null, p_verified_only boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'title', r.title, 'body', r.body, 'images', to_jsonb(r.images), 'is_verified', r.is_verified,
      'status', r.status, 'created_at', r.created_at, 'product', jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug),
      'customer', jsonb_build_object('id', pr.id, 'name', pr.full_name, 'email', pr.email)) order by r.created_at desc), '[]'::jsonb)
  into v_out
  from reviews r join products p on p.id = r.product_id join profiles pr on pr.id = r.user_id
  where (p_status is null or p_status = '' or r.status = p_status::review_status) and (not p_verified_only or r.is_verified);
  return v_out;
end $$;

create or replace function admin_coupon_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'description', c.description, 'type', c.type, 'value', c.value, 'min_order_value', c.min_order_value,
      'max_discount', c.max_discount, 'scope', c.scope, 'product_ids', to_jsonb(c.product_ids), 'category_ids', to_jsonb(c.category_ids), 'first_order_only', c.first_order_only,
      'starts_at', c.starts_at, 'expires_at', c.expires_at, 'usage_limit', c.usage_limit, 'per_user_limit', c.per_user_limit, 'is_active', c.is_active, 'is_public', c.is_public,
      'times_used', coalesce(u.times, 0), 'discount_given', coalesce(u.discount, 0), 'revenue', coalesce(u.revenue, 0)) order by c.created_at desc), '[]'::jsonb)
  into v_out
  from coupons c left join (
    select cu.coupon_id, count(*) times, sum(cu.discount_amount) discount, sum(o.grand_total) revenue
    from coupon_usage cu join orders o on o.id = cu.order_id where o.status not in ('cancelled', 'refunded') group by 1) u on u.coupon_id = c.id;
  return v_out;
end $$;

create or replace function admin_gift_rules() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'min_quantity', g.min_quantity, 'gift_variant_id', g.gift_variant_id, 'gift_quantity', g.gift_quantity,
      'starts_at', g.starts_at, 'ends_at', g.ends_at, 'is_active', g.is_active, 'product_name', p.name, 'variant_name', v.name, 'stock', coalesce(i.quantity, 0),
      'issued', (select count(*) from free_gifts f where f.gift_rule_id = g.id)) order by g.created_at desc), '[]'::jsonb)
  into v_out
  from gift_rules g join product_variants v on v.id = g.gift_variant_id join products p on p.id = v.product_id left join inventory i on i.variant_id = v.id;
  return v_out;
end $$;

create or replace function admin_variant_options() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform require_admin();
  select coalesce(jsonb_agg(jsonb_build_object('variant_id', v.id, 'product_id', p.id, 'label', p.name || ' · ' || v.name, 'price', coalesce(v.price_override, p.price)) order by p.name, v.sort_order), '[]'::jsonb)
  into v_out from product_variants v join products p on p.id = v.product_id where v.is_active;
  return v_out;
end $$;

create or replace function admin_update_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin();
  insert into settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return p_value;
end $$;

create or replace function admin_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  perform require_admin();
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_out from settings;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Internal helpers (prefixed _) are not callable from the API.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anonymous, authenticated;

grant execute on function is_admin(), get_store_config(), list_products(text, text, text, jsonb, text, int, int), search_suggest(text, int),
  get_product(text), get_home(), get_product_cards(uuid[]), quote_cart(jsonb, text, int), subscribe_newsletter(text, text)
  to anonymous, authenticated;

grant execute on function ensure_profile(text, text), place_order(jsonb, jsonb, text, text, int, text), cancel_my_order(uuid, text), request_refund(uuid, text), get_order(uuid),
  list_my_orders(int, int), submit_review(uuid, int, text, text, text[]), list_my_reviews(), reviewable_products(), toggle_wishlist(uuid, uuid), get_wishlist(),
  redeem_wishlist_item(uuid, uuid, uuid), sync_cart(jsonb, boolean), get_my_dashboard(), get_my_loyalty(), list_my_coupons(),
  admin_dashboard(), admin_list_orders(text, text, int, int), admin_update_order(uuid, text, text, text, text, text), admin_list_customers(text, int, int),
  admin_customer_detail(uuid), admin_set_customer_status(uuid, text), admin_adjust_points(uuid, int, text), admin_adjust_inventory(uuid, int, text, text),
  admin_inventory(text, boolean), admin_inventory_history(uuid), admin_get_product(uuid), admin_save_product(jsonb), admin_list_products(text, uuid, text, int, int),
  admin_delete_product(uuid), admin_delete_category(uuid), admin_delete_subcategory(uuid), admin_reviews(text, boolean), admin_coupon_stats(), admin_gift_rules(),
  admin_variant_options(), admin_update_setting(text, jsonb), admin_settings()
  to authenticated;

-- Payments are settled only by the API Function, which connects as the database owner.
revoke execute on function mark_order_paid(uuid, text, text, jsonb), mark_payment_failed(uuid, jsonb) from anonymous, authenticated;
