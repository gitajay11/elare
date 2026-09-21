# Élaré Beauty

Production-ready full-stack e-commerce for a premium makeup brand.

- **Storefront** — React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · Framer Motion · TanStack Query · Zustand
- **Backend** — Supabase (Postgres + Auth + Storage + Edge Functions). All business rules live in SQL functions with Row Level Security.
- **Payments** — Razorpay via Edge Functions (secrets never reach the browser). Cash on delivery works with no gateway configured.

## Quick start (no Supabase project needed)

```bash
npm install
npm run dev:local
```

`dev:local` boots Postgres-in-WASM (PGlite), applies the real migrations from `supabase/migrations`, exposes a Supabase-compatible API on `http://localhost:54321`, and starts Vite. **The first account you create becomes the admin.** Data resets on restart. Online payments are unavailable in this mode — use Cash on delivery.

`npm run db:test` runs the migrations and 139 end-to-end assertions (pricing, coupons, gifts, stock locking, order lifecycle, loyalty, reviews, wishlist redemption, admin operations, RLS) against PGlite.

## Running against Supabase

1. Create a project at supabase.com, then copy `.env.example` → `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Apply the migrations, in order, either with the CLI (`supabase link` → `supabase db push`) or by pasting each file from `supabase/migrations/` into the SQL editor:
   `0001_schema.sql` → `0002_functions.sql` → `0003_rls.sql` → `0004_storage.sql` → `0005_seed.sql` (seed is optional; it only creates the catalogue — no orders, reviews or customers).
3. Sign up in the app, then promote yourself in the SQL editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
4. In Authentication → URL configuration add your site URL and `https://<your-site>/auth/callback` as a redirect URL.
5. `npm run dev` / `npm run build`.

### Razorpay (online payments)

Deploy the Edge Functions and set their secrets:

```bash
supabase functions deploy razorpay-order razorpay-verify razorpay-webhook
supabase secrets set RAZORPAY_KEY_ID=rzp_... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=... SITE_URL=https://your-site
```

Set `VITE_RAZORPAY_KEY_ID` in `.env` (the public key id) — the "Pay online" option appears automatically. Point a Razorpay webhook at `https://<project>.functions.supabase.co/razorpay-webhook` for `payment.captured` and `payment.failed`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions by Supabase.

## Architecture

```
src/
  lib/api.ts          every backend call (RPC + RLS tables); the only place the UI talks to the DB
  lib/types.ts        payload shapes returned by the SQL functions
  store/              auth (context), cart, wishlist, recently viewed, ui (drawer/toasts) — zustand
  hooks/useStore.ts   store config, server-priced cart quote, cart sync, add-to-bag
  components/         ui primitives · product (card, image, variant picker, quick view) · cart · layout · home (hero + 3D ring)
  pages/              storefront · account/* · admin/*  (route-level code splitting; admin never ships to shoppers)
supabase/
  migrations/0001     normalised schema: categories, products, shades, variants, inventory (+ movement log), orders, payments, coupons, gifts, reviews, loyalty…
  migrations/0002     business logic: list/search/facets, product page payload, quote_cart, place_order, order lifecycle, reviews, wishlist redemption, admin RPCs
  migrations/0003     RLS policies + role-escalation guard
  migrations/0004     storage buckets and policies
  migrations/0005     catalogue seed (Signature Lip Edit, lips/eyes/face/tools, coupons, free-gift rule)
  functions/          Razorpay order / verify / webhook (Deno)
scripts/
  db-test.mjs         backend test-suite on PGlite
  dev-local.mjs       local Supabase-compatible API on PGlite
```

### Trust boundaries

Prices, discounts, stock, loyalty balances and admin rights are never trusted from the client:

- `quote_cart` prices the bag server-side; `place_order` re-prices it under row locks, decrements stock, applies the coupon, redeems points and issues the free gift in one transaction.
- Order status has one source of truth (`orders.status`); every change is journaled by trigger and validated against a transition table. Cancel/refund restock and reverse points automatically.
- Points are credited only when an order is marked **delivered**, reversed on refund.
- Reviews can only be written by the account that received the product (delivered order). Social-proof counts are computed from confirmed orders and hidden below an admin-configured minimum.
- `mark_order_paid` is callable only by the service role (Edge Functions after signature verification).
- Customers cannot change their own `role`/`status` (trigger) or read other customers' rows (RLS).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite against the Supabase project in `.env` |
| `npm run dev:local` | Full stack locally on PGlite (first sign-up = admin) |
| `npm run api:local` | Only the local API (port 54321) |
| `npm run db:test` | Backend test-suite |
| `npm run typecheck` | `tsc -b` |
| `npm run build` | Production build to `dist/` |

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `.env` | Supabase project (public) |
| `VITE_SITE_URL` | `.env` | Canonical URLs / Open Graph |
| `VITE_RAZORPAY_KEY_ID` | `.env` | Public key id; enables "Pay online" |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SITE_URL` | Edge Function secrets | Never in the frontend |
