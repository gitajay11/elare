# Database

Neon Postgres (project `old-glitter-35912907`, branch `production`). Everything
that decides money, stock, points or permissions lives here, not in the apps.

* `packages/db/migrations/0001_schema.sql` — 29 tables, enums, indexes, triggers.
* `packages/db/migrations/0002_functions.sql` — 61 SQL/plpgsql functions (the
  business logic and the admin RPCs), all `security definer` with a fixed
  `search_path`.
* `packages/db/migrations/0003_rls.sql` — grants for the Data API roles
  (`anonymous`, `authenticated`) and 70 row-level-security statements.
* `packages/db/seed/0004_seed.sql` — categories, 40 products with shades /
  variants / stock, coupons, gift rule, settings. Tracked like a migration so it
  runs once.
* `packages/db/schema/*.ts` — Drizzle definitions mirroring the SQL, used by the
  API for the handful of direct table operations (addresses, coupons, gift
  rules, categories, review moderation, newsletter). The SQL files remain the
  source of truth; the Drizzle schema is for typed queries, not for generating
  migrations.

Apply with `pnpm db:migrate` (records each file in `schema_migrations`); verify
with `pnpm db:test`, which loads the migrations into PGlite and runs 140
end-to-end assertions with no network.

## Identity

`neon_auth."user"` is owned by Neon Managed Auth. `profiles` is 1:1 with it
(same uuid) and is created lazily by `ensure_profile()` on the first
authenticated API call. `profiles.role` (`customer` | `admin`) and `status`
(`active` | `suspended`) drive every permission check via `is_admin()` /
`require_admin()`.

Every request from the API runs as the Data API role with
`request.jwt.claims` set, so `auth.uid()` returns the caller and RLS applies.

## Tables

| Area | Tables |
|---|---|
| Identity | `profiles`, `addresses`, `newsletter_subscribers` |
| Catalogue | `categories`, `subcategories`, `products`, `product_shades`, `product_variants`, `product_images`, `product_bundle_items`, `product_recommendations` |
| Stock | `inventory` (per variant), `inventory_movements` (audit: initial / restock / sale / cancel / adjustment / gift / return) |
| Shopping | `carts`, `cart_items`, `wishlists`, `wishlist_items` |
| Promotions | `coupons`, `coupon_usage`, `gift_rules` |
| Orders | `orders`, `order_items`, `order_status_history`, `payments`, `free_gifts` |
| Engagement | `reviews`, `loyalty_accounts`, `loyalty_transactions` |
| Config | `settings` (`loyalty`, `shipping`, `tax`, `social_proof`, `store`) |

`orders.status` is the single source of truth for an order; `payment_status`
tracks the gateway. `order_status_history` is appended by `_transition_order`,
which enforces the allowed transitions (`_can_transition`) — the same table the
`ORDER_TRANSITIONS` constant in `@elare/config` mirrors for the admin UI.

## Key functions

| Function | Purpose |
|---|---|
| `get_store_config()`, `get_home()`, `list_products(...)`, `get_product(slug)`, `search_suggest(q)` | public catalogue, computed prices / ratings / stock |
| `quote_cart(items, coupon, redeem_points)` | the only pricing engine: lines, coupon validation (`_validate_coupon`), free gift (`_active_gift_rule`), points, shipping, tax |
| `place_order(...)` | re-quotes, locks inventory rows, writes order + items + payment + gift + coupon usage, reserves points; COD confirms immediately |
| `mark_order_paid(...)`, `mark_payment_failed(...)` | Razorpay settlement — owner only |
| `admin_update_order(...)`, `cancel_my_order(...)`, `request_refund(...)` | status transitions, restocking, point reversal, point award on delivery |
| `submit_review(...)` | verified purchase check, pending until moderated |
| `toggle_wishlist`, `get_wishlist`, `redeem_wishlist_item` | wishlist and points-only redemption |
| `ensure_profile`, `get_my_dashboard`, `get_my_loyalty`, `list_my_coupons`, `list_my_orders`, `sync_cart` | account |
| `admin_dashboard`, `admin_list_*`, `admin_save_product`, `admin_adjust_inventory`, `admin_adjust_points`, `admin_settings`, … | back-office RPCs, all guarded by `require_admin()` |

## Row-level security (summary)

* `anonymous`: read published catalogue, `product_stats`, active public coupons
  and settings needed by the store; nothing else.
* `authenticated`: own profile / addresses / cart / wishlist (read + write);
  own orders, payments, reviews, loyalty rows (read); reviews (delete own).
  Prices, stock and roles cannot be changed — updates to those tables are
  policy-filtered to admins.
* Admins (`is_admin()`): full access to catalogue, inventory, coupons, gift
  rules, orders, reviews, settings, customers.
* No client role may call `mark_order_paid` / `mark_payment_failed`.
