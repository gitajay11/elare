-- ============================================================================
-- ÉLARÉ BEAUTY — core schema (Neon / Lakebase Postgres)
-- Normalised catalogue, commerce, loyalty and moderation tables.
-- All money is stored as numeric(12,2) in INR. All ids are uuid.
-- Identity comes from Neon Managed Better Auth (schema neon_auth); the Data API
-- exposes auth.uid() (uuid) and auth.jwt() from the request JWT.
-- ============================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type user_role as enum ('customer', 'admin');
create type account_status as enum ('active', 'suspended');

create type order_status as enum (
  'pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery',
  'delivered', 'cancelled', 'refund_requested', 'refund_initiated',
  'refund_processing', 'refunded'
);
create type payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'cod');
create type payment_method as enum ('razorpay', 'cod', 'points');

create type coupon_type as enum ('percentage', 'fixed');
create type coupon_scope as enum ('all', 'products', 'categories');
create type review_status as enum ('pending', 'approved', 'hidden');
create type loyalty_tx_type as enum ('earn', 'redeem', 'adjust', 'reversal', 'expire');
create type recommendation_kind as enum ('also_like', 'complete_look', 'bundle');
create type inventory_reason as enum ('initial', 'restock', 'sale', 'cancel', 'adjustment', 'gift', 'return');

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with neon_auth."user", same uuid). Rows are created lazily by
-- ensure_profile() / require_user(); Neon owns the auth schema so we add no FK or
-- trigger there. Role lives here; RLS reads it via is_admin().
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key,
  email       text not null,
  full_name   text,
  phone       text,
  avatar_url  text,
  role        user_role not null default 'customer',
  status      account_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on profiles(role);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  image_url   text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  slug        text not null,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (category_id, slug)
);
create index subcategories_category_idx on subcategories(category_id);

create table products (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  short_description text,
  description       text,
  benefits          text[],
  how_to_use        text,
  ingredients       text,
  size_label        text,            -- "3.5 g", "30 ml"
  finish            text,            -- Matte / Satin / Dewy / Natural ...
  coverage          text,            -- Light / Medium / Full
  suitability       text,            -- "All lip tones", "Oily to combination skin"
  category_id       uuid not null references categories(id) on delete restrict,
  subcategory_id    uuid references subcategories(id) on delete set null,
  price             numeric(12,2) not null check (price >= 0),
  compare_at_price  numeric(12,2) check (compare_at_price is null or compare_at_price >= price),
  loyalty_points    int check (loyalty_points is null or loyalty_points >= 0), -- null = use global rate
  attributes        jsonb not null default '{}'::jsonb,  -- {waterproof:true, product_type:'combo', ...}
  video_url         text,
  is_published      boolean not null default false,
  is_best_seller    boolean not null default false,
  is_new            boolean not null default false,
  is_gift_only      boolean not null default false,  -- not purchasable, only issued as a reward
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  search_vector     tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored
);
create index products_category_idx on products(category_id, subcategory_id);
create index products_published_idx on products(is_published) where is_published;
create index products_search_idx on products using gin(search_vector);
create index products_name_trgm_idx on products using gin(name gin_trgm_ops);
create index products_created_idx on products(created_at desc);

-- Named colours per product. Admin can add/remove freely; variants reference them.
create table product_shades (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  name        text not null,
  hex         text not null check (hex ~ '^#[0-9a-fA-F]{6}$'),
  undertone   text,                      -- warm / cool / neutral
  description text,
  sort_order  int not null default 0,
  is_active   boolean not null default true
);
create index product_shades_product_idx on product_shades(product_id);

-- The sellable unit. A variant may point at a shade and/or carry option values.
create table product_variants (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  shade_id        uuid references product_shades(id) on delete set null,
  sku             text not null unique,
  name            text not null,        -- "Rose Nude", "Waterproof · Onyx", "Set of 12"
  options         jsonb not null default '{}'::jsonb,  -- {finish:'Matte', coverage:'Full', waterproof:true, size:'30 ml'}
  price_override  numeric(12,2) check (price_override is null or price_override >= 0),
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index product_variants_product_idx on product_variants(product_id);
create index product_variants_shade_idx on product_variants(shade_id);

create table product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  shade_id    uuid references product_shades(id) on delete set null,
  url         text not null,
  alt         text not null default '',
  sort_order  int not null default 0,
  is_primary  boolean not null default false
);
create index product_images_product_idx on product_images(product_id, sort_order);

-- Inventory is tracked per variant, with an append-only movement log.
create table inventory (
  variant_id          uuid primary key references product_variants(id) on delete cascade,
  quantity            int not null default 0 check (quantity >= 0),
  low_stock_threshold int not null default 5,
  updated_at          timestamptz not null default now()
);

create table inventory_movements (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid not null references product_variants(id) on delete cascade,
  delta       int not null,
  reason      inventory_reason not null,
  reference   text,             -- order number, note
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index inventory_movements_variant_idx on inventory_movements(variant_id, created_at desc);

-- Bundles (e.g. the Signature Lip Edit): a combo product is composed of variants.
create table product_bundle_items (
  bundle_product_id uuid not null references products(id) on delete cascade,
  variant_id        uuid not null references product_variants(id) on delete cascade,
  quantity          int not null default 1 check (quantity > 0),
  sort_order        int not null default 0,
  primary key (bundle_product_id, variant_id)
);

create table product_recommendations (
  product_id             uuid not null references products(id) on delete cascade,
  recommended_product_id uuid not null references products(id) on delete cascade,
  kind                   recommendation_kind not null default 'also_like',
  sort_order             int not null default 0,
  primary key (product_id, recommended_product_id, kind),
  check (product_id <> recommended_product_id)
);

-- ---------------------------------------------------------------------------
-- Customer state
-- ---------------------------------------------------------------------------
create table addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  label       text,
  full_name   text not null,
  phone       text not null,
  line1       text not null,
  line2       text,
  city        text not null,
  state       text not null,
  postal_code text not null,
  country     text not null default 'IN',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index addresses_user_idx on addresses(user_id);

create table carts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references profiles(id) on delete cascade,
  coupon_code text,
  updated_at  timestamptz not null default now()
);

create table cart_items (
  id          uuid primary key default gen_random_uuid(),
  cart_id     uuid not null references carts(id) on delete cascade,
  variant_id  uuid not null references product_variants(id) on delete cascade,
  quantity    int not null check (quantity > 0 and quantity <= 20),
  created_at  timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create table wishlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references wishlists(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  variant_id  uuid references product_variants(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (wishlist_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------------
create table coupons (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  description      text,
  type             coupon_type not null,
  value            numeric(12,2) not null check (value > 0),
  min_order_value  numeric(12,2) not null default 0,
  max_discount     numeric(12,2),
  scope            coupon_scope not null default 'all',
  product_ids      uuid[] not null default '{}',
  category_ids     uuid[] not null default '{}',
  first_order_only boolean not null default false,
  starts_at        timestamptz not null default now(),
  expires_at       timestamptz,
  usage_limit      int,
  per_user_limit   int not null default 1,
  is_active        boolean not null default true,
  is_public        boolean not null default false,   -- shown in the customer "Coupons" page
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index coupons_code_idx on coupons(upper(code));

create table coupon_usage (
  id              uuid primary key default gen_random_uuid(),
  coupon_id       uuid not null references coupons(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  order_id        uuid not null,
  discount_amount numeric(12,2) not null,
  created_at      timestamptz not null default now()
);
create index coupon_usage_coupon_idx on coupon_usage(coupon_id);
create index coupon_usage_user_idx on coupon_usage(user_id, coupon_id);

-- Automatic free-gift rules: "buy N qualifying items, receive gift".
create table gift_rules (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  min_quantity    int not null check (min_quantity > 0),
  gift_variant_id uuid not null references product_variants(id) on delete restrict,
  gift_quantity   int not null default 1 check (gift_quantity > 0),
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Orders — orders.status is the single source of truth; history is an audit log.
-- ---------------------------------------------------------------------------
create sequence order_number_seq start 10001;

create table orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique default ('EB-' || nextval('order_number_seq')::text),
  user_id          uuid not null references profiles(id) on delete restrict,
  status           order_status not null default 'pending',
  payment_status   payment_status not null default 'pending',
  payment_method   payment_method not null,
  currency         text not null default 'INR',
  subtotal         numeric(12,2) not null,
  coupon_id        uuid references coupons(id) on delete set null,
  coupon_code      text,
  coupon_discount  numeric(12,2) not null default 0,
  points_redeemed  int not null default 0,
  points_discount  numeric(12,2) not null default 0,
  shipping_total   numeric(12,2) not null default 0,
  tax_total        numeric(12,2) not null default 0,
  grand_total      numeric(12,2) not null,
  points_earned    int not null default 0,
  points_awarded   boolean not null default false,
  shipping_address jsonb not null,
  carrier          text,
  tracking_number  text,
  tracking_url     text,
  customer_note    text,
  cancel_reason    text,
  placed_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index orders_user_idx on orders(user_id, placed_at desc);
create index orders_status_idx on orders(status);
create index orders_placed_idx on orders(placed_at desc);

alter table coupon_usage add constraint coupon_usage_order_fk
  foreign key (order_id) references orders(id) on delete cascade;

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  variant_id    uuid references product_variants(id) on delete set null,
  product_name  text not null,
  variant_name  text,
  shade_name    text,
  shade_hex     text,
  image_url     text,
  unit_price    numeric(12,2) not null,
  quantity      int not null check (quantity > 0),
  line_total    numeric(12,2) not null,
  is_gift       boolean not null default false,
  points_earned int not null default 0
);
create index order_items_order_idx on order_items(order_id);
create index order_items_product_idx on order_items(product_id);

create table order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  status      order_status not null,
  note        text,
  changed_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index order_status_history_order_idx on order_status_history(order_id, created_at);

create table payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders(id) on delete cascade,
  provider            payment_method not null,
  provider_order_id   text,
  provider_payment_id text,
  amount              numeric(12,2) not null,
  currency            text not null default 'INR',
  status              payment_status not null default 'pending',
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index payments_order_idx on payments(order_id);
create index payments_provider_order_idx on payments(provider_order_id);

-- Gifts actually issued (one row per order/rule) — used to stop duplicate rewards.
create table free_gifts (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  gift_rule_id  uuid references gift_rules(id) on delete set null,
  variant_id    uuid references product_variants(id) on delete set null,
  quantity      int not null,
  created_at    timestamptz not null default now(),
  unique (order_id, gift_rule_id)
);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
create table reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  rating      smallint not null check (rating between 1 and 5),
  title       text,
  body        text not null,
  images      text[] not null default '{}',
  is_verified boolean not null default false,
  status      review_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, user_id)
);
create index reviews_product_idx on reviews(product_id, status);

-- ---------------------------------------------------------------------------
-- Loyalty
-- ---------------------------------------------------------------------------
create table loyalty_accounts (
  user_id          uuid primary key references profiles(id) on delete cascade,
  available_points int not null default 0 check (available_points >= 0),
  lifetime_points  int not null default 0,
  redeemed_points  int not null default 0,
  updated_at       timestamptz not null default now()
);

create table loyalty_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  type          loyalty_tx_type not null,
  points        int not null,           -- signed
  balance_after int not null,
  order_id      uuid references orders(id) on delete set null,
  description   text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index loyalty_tx_user_idx on loyalty_transactions(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Settings (key/value) and newsletter
-- ---------------------------------------------------------------------------
create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('loyalty', '{
    "points_per_rupee": 0.1,
    "point_value_rupees": 0.25,
    "min_redeem_points": 200,
    "max_redeem_percent": 30,
    "redemption_enabled": true,
    "wishlist_redemption_enabled": true,
    "wishlist_redeem_max_price": 2500
  }'::jsonb),
  ('shipping', '{"flat_rate": 79, "free_above": 999}'::jsonb),
  ('tax', '{"rate_percent": 0, "inclusive": true}'::jsonb),
  ('social_proof', '{"enabled": true, "window_days": 30, "min_count": 5}'::jsonb),
  ('store', '{"currency": "INR", "low_stock_threshold": 5, "max_qty_per_line": 10}'::jsonb);

create table newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated  before update on profiles  for each row execute function set_updated_at();
create trigger products_updated  before update on products  for each row execute function set_updated_at();
create trigger coupons_updated   before update on coupons   for each row execute function set_updated_at();
create trigger orders_updated    before update on orders    for each row execute function set_updated_at();
create trigger reviews_updated   before update on reviews   for each row execute function set_updated_at();
create trigger payments_updated  before update on payments  for each row execute function set_updated_at();
create trigger inventory_updated before update on inventory for each row execute function set_updated_at();

-- Every order status change is journaled automatically (single source of truth stays orders.status).
create or replace function log_order_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into order_status_history (order_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end $$;

create trigger orders_status_log
  after insert or update of status on orders
  for each row execute function log_order_status();
