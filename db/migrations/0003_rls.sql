-- ============================================================================
-- ÉLARÉ BEAUTY — Row Level Security (Neon Data API)
-- The Data API switches to the "anonymous" role for guest tokens and
-- "authenticated" for signed-in users. Customers see the published catalogue +
-- their own data. Admins (profiles.role) manage everything. Money/stock/points
-- tables have NO direct write policies: they change only through the
-- SECURITY DEFINER functions in 0002, which run as the database owner.
-- ============================================================================

alter table profiles                enable row level security;
alter table categories              enable row level security;
alter table subcategories           enable row level security;
alter table products                enable row level security;
alter table product_shades          enable row level security;
alter table product_variants        enable row level security;
alter table product_images          enable row level security;
alter table inventory               enable row level security;
alter table inventory_movements     enable row level security;
alter table product_bundle_items    enable row level security;
alter table product_recommendations enable row level security;
alter table addresses               enable row level security;
alter table carts                   enable row level security;
alter table cart_items              enable row level security;
alter table wishlists               enable row level security;
alter table wishlist_items          enable row level security;
alter table coupons                 enable row level security;
alter table coupon_usage            enable row level security;
alter table gift_rules              enable row level security;
alter table orders                  enable row level security;
alter table order_items             enable row level security;
alter table order_status_history    enable row level security;
alter table payments                enable row level security;
alter table free_gifts              enable row level security;
alter table reviews                 enable row level security;
alter table loyalty_accounts        enable row level security;
alter table loyalty_transactions    enable row level security;
alter table settings                enable row level security;
alter table newsletter_subscribers  enable row level security;

-- Enabling the Data API grants the authenticated role blanket access to public
-- tables; replace that with the narrow grants below (RLS still applies on top).
revoke all on all tables in schema public from authenticated, anonymous;
revoke all on all sequences in schema public from authenticated, anonymous;
alter default privileges in schema public revoke all on tables from authenticated, anonymous;

grant usage on schema public to anonymous, authenticated;
grant select on product_stats to anonymous, authenticated;
grant select on categories, subcategories, products, product_shades, product_variants, product_images,
  product_bundle_items, product_recommendations, coupons to anonymous, authenticated;
grant select, insert, update, delete on profiles, addresses, carts, cart_items, wishlists, wishlist_items to authenticated;
grant select on coupon_usage, orders, order_items, order_status_history, payments, free_gifts, reviews,
  loyalty_accounts, loyalty_transactions to authenticated;
grant delete on reviews to authenticated;
grant all on categories, subcategories, products, product_shades, product_variants, product_images, inventory, inventory_movements,
  product_bundle_items, product_recommendations, coupons, gift_rules, reviews, settings, newsletter_subscribers, orders, payments to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy "profiles: read own or admin" on profiles for select
  using (id = auth.uid() or is_admin());
create policy "profiles: update own or admin" on profiles for update
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

-- Customers may edit their name/phone/avatar but never their role, status or email.
-- (No JWT context = SQL editor / service role, which is how the first admin is promoted.)
create or replace function protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status or new.email is distinct from old.email then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on profiles for each row execute function protect_profile();

-- ---------------------------------------------------------------------------
-- Catalogue: public read of published/active rows, admin full control.
-- ---------------------------------------------------------------------------
create policy "categories: public read" on categories for select using (is_active or is_admin());
create policy "categories: admin write" on categories for all using (is_admin()) with check (is_admin());

create policy "subcategories: public read" on subcategories for select using (is_active or is_admin());
create policy "subcategories: admin write" on subcategories for all using (is_admin()) with check (is_admin());

create policy "products: public read" on products for select using (is_published or is_admin());
create policy "products: admin write" on products for all using (is_admin()) with check (is_admin());

create policy "shades: public read" on product_shades for select
  using (is_admin() or exists (select 1 from products p where p.id = product_id and p.is_published));
create policy "shades: admin write" on product_shades for all using (is_admin()) with check (is_admin());

create policy "variants: public read" on product_variants for select
  using (is_admin() or exists (select 1 from products p where p.id = product_id and p.is_published));
create policy "variants: admin write" on product_variants for all using (is_admin()) with check (is_admin());

create policy "images: public read" on product_images for select
  using (is_admin() or exists (select 1 from products p where p.id = product_id and p.is_published));
create policy "images: admin write" on product_images for all using (is_admin()) with check (is_admin());

create policy "bundle items: public read" on product_bundle_items for select
  using (is_admin() or exists (select 1 from products p where p.id = bundle_product_id and p.is_published));
create policy "bundle items: admin write" on product_bundle_items for all using (is_admin()) with check (is_admin());

create policy "recommendations: public read" on product_recommendations for select using (true);
create policy "recommendations: admin write" on product_recommendations for all using (is_admin()) with check (is_admin());

-- Exact stock counts are admin-only; the storefront gets in_stock / low_stock flags from RPCs.
create policy "inventory: admin" on inventory for all using (is_admin()) with check (is_admin());
create policy "inventory movements: admin read" on inventory_movements for select using (is_admin());

-- ---------------------------------------------------------------------------
-- Customer-owned rows
-- ---------------------------------------------------------------------------
create policy "addresses: own" on addresses for all
  using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid());

create policy "carts: own" on carts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cart items: own" on cart_items for all
  using (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()));

create policy "wishlists: own" on wishlists for all using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid());
create policy "wishlist items: own" on wishlist_items for all
  using (is_admin() or exists (select 1 from wishlists w where w.id = wishlist_id and w.user_id = auth.uid()))
  with check (exists (select 1 from wishlists w where w.id = wishlist_id and w.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------
create policy "coupons: public read of public coupons" on coupons for select
  using (is_admin() or (is_public and is_active and starts_at <= now() and (expires_at is null or expires_at > now())));
create policy "coupons: admin write" on coupons for all using (is_admin()) with check (is_admin());

create policy "coupon usage: own or admin" on coupon_usage for select using (user_id = auth.uid() or is_admin());

create policy "gift rules: admin" on gift_rules for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Orders — read-only from the client; all writes happen in functions.
-- ---------------------------------------------------------------------------
create policy "orders: own or admin read" on orders for select using (user_id = auth.uid() or is_admin());
create policy "order items: own or admin read" on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin())));
create policy "order history: own or admin read" on order_status_history for select
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin())));
create policy "payments: own or admin read" on payments for select
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin())));
create policy "free gifts: own or admin read" on free_gifts for select
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin())));

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create policy "reviews: read approved, own, or admin" on reviews for select
  using (status = 'approved' or user_id = auth.uid() or is_admin());
create policy "reviews: delete own" on reviews for delete using (user_id = auth.uid() or is_admin());
create policy "reviews: admin moderate" on reviews for update using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Loyalty — read-only for customers, mutations only via functions.
-- ---------------------------------------------------------------------------
create policy "loyalty accounts: own or admin read" on loyalty_accounts for select using (user_id = auth.uid() or is_admin());
create policy "loyalty transactions: own or admin read" on loyalty_transactions for select using (user_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------
-- Settings & newsletter
-- ---------------------------------------------------------------------------
create policy "settings: admin" on settings for all using (is_admin()) with check (is_admin());
create policy "newsletter: admin read" on newsletter_subscribers for select using (is_admin());
