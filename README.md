# Élaré Beauty

Production-ready full-stack e-commerce for a premium makeup brand — **two separate websites** (customer storefront and admin back-office) built from one codebase, sharing components, the API layer and the database.

- **Storefront / Admin** — React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · Framer Motion · TanStack Query · Zustand
- **Backend — Neon** — Lakebase Postgres (all business rules in SQL functions + RLS) · Managed Better Auth · Data API (PostgREST-compatible) · Object Storage (`media` bucket) · a Neon Function for payments and uploads
- **Payments** — Razorpay through the Neon Function (secrets never reach the browser). Cash on delivery works with no gateway configured.

## Architecture

```
Browser (storefront / admin, Vercel)
  │  @neondatabase/neon-js
  ├─► Neon Auth (Managed Better Auth)   sign-up / sign-in / sessions / JWTs
  ├─► Neon Data API (PostgREST)         rpc('quote_cart'…), from('addresses')…  → RLS as `authenticated` / `anonymous`
  └─► Neon Function `api` (Hono)         POST /payments/razorpay/*, POST /uploads → Object Storage `media`
                                         connects to Postgres as the owner (only principal allowed to settle payments)
```

```
src/
  lib/neon.ts         the Neon client (Supabase-shaped auth adapter + Data API) and apiFetch() for the Function
  lib/api.ts          every backend call; the UI never computes prices, stock, points or permissions
  apps/StoreApp.tsx   customer routes         apps/AdminApp.tsx   back-office routes (own login at /login)
  store/, hooks/, components/, pages/
db/migrations/        0001 schema · 0002 business logic (≈45 RPCs) · 0003 RLS + grants · 0004 catalogue seed
functions/api/        the Neon Function (Node 24, Hono, pg, jose, @aws-sdk/client-s3)
neon.ts               infrastructure declaration: auth, dataApi, buckets.media, functions.api
scripts/              db-migrate · db-test (PGlite) · build-function · dev-function
```

## Setup

### 1. Neon project

```bash
npm install
npm i -g neon && neon login          # or set NEON_API_KEY
neon link --project-id <project-id> --branch production -y   # writes .neon and pulls DATABASE_URL etc. into .env.local
neon deploy --env .env.local          # provisions Auth, Data API, the media bucket and deploys the api Function
npm run db:migrate                    # applies db/migrations to the linked branch (tracked in schema_migrations)
```

The project must be in an AWS region that supports Functions and Object Storage (`aws-us-east-2`, `aws-us-east-1`, `aws-eu-central-1`, `aws-ap-southeast-1`).

If you prefer the console/MCP path instead of the CLI: enable **Managed Better Auth** and the **Data API** (with default grants) on the branch, create a `public_read` bucket named `media`, run `npm run db:migrate` with `DATABASE_URL` set, and deploy `functions/api` (see below).

### 2. Frontend env

Copy `.env.example` → `.env` (or let `neon link` write `.env.local`) and set:

| Variable | Purpose |
|---|---|
| `VITE_NEON_URL` | `https://<endpoint-host>/<database>` from the connection string, no credentials. The SDK derives the Auth and Data API URLs. |
| `VITE_API_URL` | Public URL of the `api` Function (`neon functions get api` → `invocation_url`). Locally: `http://localhost:8790` from `npm run functions:dev`. |
| `VITE_SITE_URL`, `VITE_STORE_URL`, `VITE_ADMIN_URL` | Canonical URLs and cross-links between the two sites |
| `VITE_RAZORPAY_KEY_ID` | Public key id; enables "Pay online" |
| `VITE_APP` | `admin` on the admin Vercel project (default `store`) |

### 3. First admin

Sign up in the storefront, then promote the account:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

(Profiles are created lazily by `ensure_profile()` on first sign-in; run the update after the first visit.)

### 4. Trusted origins

Localhost is pre-approved. Add production origins for Auth: `neon neon-auth domain add https://shop.example.com` (and the admin origin), and list them in `ALLOWED_ORIGINS` for the Function.

## Run locally

```bash
npm run dev           # storefront on :5173, against the Neon branch in .env.local
npm run dev:admin     # admin on :5174
npm run functions:dev # the api Function on :8790 (uploads, payments) — set VITE_API_URL=http://localhost:8790
npm run db:test       # 140 backend assertions on PGlite (no network)
```

Neon sessions live on the auth origin, so a sign-in on the storefront is also visible to the admin site; non-admins are refused there.

## Two sites, one repo

| | Storefront | Admin |
|---|---|---|
| Entry | `src/apps/StoreApp.tsx` | `src/apps/AdminApp.tsx` |
| Build | `npm run build:store` | `npm run build:admin` (or `VITE_APP=admin npm run build`) |
| Routes | `/`, `/shop`, `/product/:slug`, `/checkout`, `/account/*` | `/login`, `/`, `/products`, `/orders`, `/customers`, … |

Each bundle contains only its own pages. Deploy as **two Vercel projects from this repository**; both use `npm run build`, the admin project sets `VITE_APP=admin`.

## Payments

Set the Function env (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) in `.env.local` and `neon deploy --env .env.local`; point the Razorpay webhook at `<api url>/payments/razorpay/webhook` for `payment.captured` / `payment.failed`. Until then the checkout offers Cash on delivery only.

## Trust boundaries

- `quote_cart` prices the bag server-side; `place_order` re-prices it under row locks, decrements stock, applies the coupon, redeems points and issues the free gift in one transaction.
- `orders.status` is the single source of truth; every change is journaled by trigger and validated against a transition table. Cancel/refund restock and reverse points.
- Points are credited only on **delivered**; reviews only from accounts whose order was delivered; social proof only from confirmed orders.
- `mark_order_paid` / `mark_payment_failed` are revoked from API roles — only the Function (owner connection) settles payments after signature verification.
- Customers cannot change their own `role`/`status` (trigger) or read other customers' rows (RLS). The Function verifies every JWT against Neon Auth's JWKS.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run dev:admin` | Storefront / admin |
| `npm run build:store` / `npm run build:admin` | Production builds to `dist/` |
| `npm run db:migrate` | Apply `db/migrations` to `DATABASE_URL` |
| `npm run db:test` | Backend test-suite on PGlite |
| `npm run functions:dev` | Run the api Function locally |
| `npm run functions:build` | Bundle the Function to `dist-functions/api.zip` (API/CI deploys) |
| `npm run typecheck` | `tsc -b` (app, node, functions) |
