# Élaré API

Base URL: `VITE_API_URL` (local `http://localhost:8790`, production the Neon
Function URL). JSON in, JSON out. Send `Authorization: Bearer <Neon Auth JWT>`
for anything beyond the public routes.

Errors are `{ "error": "<human sentence>", "code": "<machine code>" }` with the
HTTP status: `400` validation / business rule (message from the database, e.g.
"Coupon has expired"), `401` unauthenticated, `403` forbidden, `404`, `409`
conflict, `503` not configured.

Query-string values are parsed as JSON when they start with `{`/`[`, and
`true`/`false` become booleans.

## Public

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/health` | | `{ ok, branch }` |
| GET | `/store/config` | | store settings + category tree |
| GET | `/store/home` | | hero/sections payload |
| POST | `/store/newsletter` | `{ email, source? }` | `{ status }` |
| GET | `/products` | `category, subcategory, q, filters{}, sort, page, page_size` | listing + facets |
| GET | `/products/suggest` | `q, limit` | `{ products, categories }` |
| POST | `/products/cards` | `{ ids[] }` | product cards |
| GET | `/products/:slug` | | product detail (404 if unpublished) |
| POST | `/cart/quote` | `{ items[], coupon?, redeem_points? }` | priced quote (guest OK) |

## Customer (JWT required)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/profile` | `{ full_name?, phone? }` | ensures + returns the profile (idempotent) |
| GET | `/auth/profile` | | |
| PATCH | `/auth/profile` | `{ full_name?, phone? }` | |
| GET | `/auth/dashboard` | | account overview |
| GET/PUT | `/auth/addresses` | address (PUT upserts by `id`) | |
| DELETE | `/auth/addresses/:id` | | |
| PUT | `/cart` | `{ items[], replace? }` | persist the cart |
| GET | `/wishlist` | | |
| POST | `/wishlist/toggle` | `{ product_id, variant_id? }` | |
| POST | `/wishlist/redeem` | `{ product_id, variant_id, address_id }` | points-only order |
| POST | `/checkout/orders` | `{ items[], address, payment_method, coupon?, redeem_points?, note? }` | `201 { order_id, order_number, grand_total, … }` |
| GET | `/orders` | `page, page_size` | |
| GET | `/orders/:id` | | |
| POST | `/orders/:id/cancel` | `{ reason? }` | only while cancellable |
| POST | `/orders/:id/refund-request` | `{ reason }` | delivered orders |
| POST | `/payments/razorpay/order` | `{ order_id }` | Razorpay order for the checkout widget |
| POST | `/payments/razorpay/verify` | `{ order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }` | settles the order |
| POST | `/payments/razorpay/webhook` | Razorpay event (HMAC header) | no JWT; backstop |
| GET | `/coupons/mine` | | coupons the customer may use |
| GET | `/loyalty` | | balance + transactions |
| POST | `/reviews` | `{ product_id, rating, title?, body, images? }` | verified only with a delivered order |
| GET | `/reviews/mine`, `/reviews/reviewable` | | |
| DELETE | `/reviews/:id` | | own reviews |
| POST | `/media/uploads` | multipart `file`, `scope=review\|product` | `product` needs admin |

## Admin (JWT + active `admin` profile)

| Method | Path | Body / query |
|---|---|---|
| GET | `/admin/dashboard` | |
| GET | `/admin/products` | `q, category, status, page, page_size` |
| GET | `/admin/products/variant-options` | |
| GET | `/admin/products/:id` | |
| PUT | `/admin/products` | full product payload (`productSaveSchema`) |
| DELETE | `/admin/products/:id` | |
| GET | `/admin/categories` | categories + subcategories |
| PUT | `/admin/categories` | category (upsert by `id`) |
| DELETE | `/admin/categories/:id` | |
| PUT | `/admin/categories/subcategories` | subcategory |
| DELETE | `/admin/categories/subcategories/:id` | |
| GET | `/admin/inventory` | `q, low_only` |
| GET | `/admin/inventory/:variantId/history` | |
| POST | `/admin/inventory/:variantId/adjust` | `{ delta, reason, note? }` |
| GET | `/admin/orders` | `status, q, page, page_size` |
| GET | `/admin/orders/:id` | |
| PATCH | `/admin/orders/:id` | `{ status?, note?, carrier?, tracking_number?, tracking_url? }` |
| GET | `/admin/customers` | `q, page, page_size` |
| GET | `/admin/customers/newsletter` | |
| GET | `/admin/customers/:id` | |
| PATCH | `/admin/customers/:id/status` | `{ status }` |
| POST | `/admin/customers/:id/points` | `{ points, description? }` |
| GET/PUT | `/admin/coupons` | coupon (upsert by `id`) |
| DELETE | `/admin/coupons/:id` | |
| GET/PUT | `/admin/gift-rules` | gift rule |
| DELETE | `/admin/gift-rules/:id` | |
| GET | `/admin/reviews` | `status, verified_only` |
| PATCH | `/admin/reviews/:id` | `{ status }` |
| DELETE | `/admin/reviews/:id` | |
| GET | `/admin/settings` | |
| PUT | `/admin/settings` | `{ key, value }` |

Every admin route is additionally enforced in the database: the request runs as
the caller, and the SQL functions call `require_admin()` / the tables are
protected by RLS, so a forged admin request still fails at the database.
