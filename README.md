# Élaré Beauty

Production-ready full-stack e-commerce for a premium makeup brand: a **customer
storefront** (main domain), an **admin back-office** (subdomain) and one
**API**, in a pnpm + Turborepo monorepo that shares typed packages between them.

- **Sites** — React 19 · TypeScript · Vite 7 · Tailwind CSS 4 · Framer Motion · TanStack Query · Zustand
- **API** — Hono on Neon Functions (Node 24); verifies Neon Auth JWTs and runs every request as the caller inside Postgres (RLS applies)
- **Data** — Neon Postgres with all business rules in SQL functions + RLS · Managed Better Auth · Object Storage (`media` bucket) · Drizzle for typed table access
- **Payments** — Razorpay through the API (secrets never reach the browser); Cash on delivery works with no gateway configured

```
elare-beauty/
├── apps/
│   ├── storefront/      customer website          @elare/storefront
│   ├── admin/           admin website             @elare/admin
│   └── api/             Élaré API (Neon Function) @elare/api   src/modules/{auth,products,cart,checkout,orders,payments,…}
├── packages/
│   ├── db/              schema (Drizzle) · migrations · seed · client   @elare/db
│   ├── types/           shared types                                      @elare/types
│   ├── validation/      Zod schemas (API + forms)                          @elare/validation
│   ├── ui/              design system, AuthProvider, SEO, motion           @elare/ui
│   ├── config/          brand, order lifecycle, defaults                   @elare/config
│   └── utils/           formatting, cn(), typed HTTP client               @elare/utils
├── docs/                architecture.md · database.md · api.md
├── neon.ts              infrastructure: auth, dataApi, buckets.media, functions.api
├── pnpm-workspace.yaml · turbo.json · .env.example
```

Read [docs/architecture.md](docs/architecture.md) first, then
[docs/database.md](docs/database.md) and [docs/api.md](docs/api.md).

## Setup

```bash
pnpm install
cp .env.example .env.local
```

### 1. Neon

```bash
npm i -g neon && neon login                       # or set NEON_API_KEY
neon link --project-id <project-id> --branch production -y   # pulls DATABASE_URL, NEON_AUTH_* into .env.local
neon deploy --env .env.local                      # Auth, media bucket, and the api Function (apps/api)
pnpm db:migrate                                   # packages/db/migrations + seed, tracked in schema_migrations
```

The project must be in a region with Functions and Object Storage
(`aws-us-east-1`, `aws-us-east-2`, `aws-eu-central-1`, `aws-ap-southeast-1`).
Create a storage credential for the bucket and put it in `.env.local`
(`AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`).

### 2. Environment

One `.env.local` at the repo root serves every workspace.

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_NEON_URL` | both sites | `https://<endpoint-host>/<database>`; the SDK derives the Auth URL |
| `VITE_API_URL` | both sites | the API: `http://localhost:8790` locally, the Function URL in production |
| `VITE_SITE_URL` / `VITE_STORE_URL` / `VITE_ADMIN_URL` | both sites | canonical URLs and cross-links (domain ↔ subdomain) |
| `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL` | api, db | database and JWT verification |
| `ALLOWED_ORIGINS` | api | comma-separated site origins; `http://localhost:*` locally |
| `AWS_*`, `MEDIA_BUCKET` | api | uploads |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | api | optional; enables "Pay online" |

### 3. First admin

Sign up in the storefront, then promote the account:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

### 4. Trusted origins

Add both production origins to Neon Auth (`neon neon-auth domain add https://…`)
and to `ALLOWED_ORIGINS` for the API.

## Run locally

```bash
pnpm api:dev          # http://localhost:8790
pnpm storefront:dev   # http://localhost:5173
pnpm admin:dev        # http://localhost:5174
pnpm db:test          # 140 backend assertions in PGlite (no network)
pnpm typecheck        # every package
pnpm build            # both sites → dist/, API → apps/api/dist-functions/api.zip
```

Neon sessions live on the auth origin, so a sign-in on the storefront is also
visible to the admin site; non-admins are refused there (and by the API).

## Deploy

| Target | How |
|---|---|
| Database, Auth, Storage, API | `neon deploy --env .env.local` |
| Storefront (`elare.example.com`) | Vercel project from this repo, root `apps/storefront` (`vercel.json` runs `pnpm --filter @elare/storefront build`) |
| Admin (`admin.elare.example.com`) | second Vercel project, root `apps/admin` |

Set the `VITE_*` variables on each Vercel project; each bundle contains only its own pages.

## Trust boundaries

- `quote_cart` prices the bag; `place_order` re-prices it under row locks, decrements stock, applies the coupon, redeems points and issues the free gift in one transaction. The UI never computes a price.
- `orders.status` is the single source of truth; every change is journaled and validated against a transition table. Cancel / refund restock and reverse points; points are credited only on **delivered**.
- Reviews come only from real accounts, are verified only with a delivered order, and go live after moderation. Social proof counts only confirmed orders.
- The API runs each request as the caller (`set local role` + JWT claims), so RLS and `require_admin()` apply to it as well. Only Razorpay settlement runs as the owner, after the signature and the order's owner are verified.
- Customers cannot change their own `role` / `status` or read other customers' rows.
