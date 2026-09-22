-- Free-shipping coupons: no amount off, the shipping line becomes ₹0 instead.
-- `value` is meaningless for them, so it may be 0.
alter table coupons drop constraint if exists coupons_value_check;
alter table coupons add constraint coupons_value_check check (value > 0 or type = 'free_shipping');

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

  if v_c.type = 'free_shipping' then
    return jsonb_build_object('valid', true, 'coupon_id', v_c.id, 'code', v_c.code, 'discount', 0, 'free_shipping', true,
      'message', 'Coupon applied — delivery is on us.', 'description', v_c.description);
  end if;

  v_discount := case v_c.type
    when 'percentage' then round(v_eligible * v_c.value / 100, 2)
    else least(v_c.value, v_eligible) end;
  if v_c.max_discount is not null then
    v_discount := least(v_discount, v_c.max_discount);
  end if;

  return jsonb_build_object('valid', true, 'coupon_id', v_c.id, 'code', v_c.code, 'discount', v_discount, 'free_shipping', false,
    'message', 'Coupon applied — you save ₹' || to_char(v_discount, 'FM999999990.00') || '.', 'description', v_c.description);
end $$;

-- _quote: a valid free-shipping coupon zeroes the shipping line.
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
    v_shipping := case when coalesce((v_coupon ->> 'free_shipping')::boolean, false) then 0
                       when v_after_discount >= coalesce((v_ship ->> 'free_above')::numeric, 0) then 0
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
