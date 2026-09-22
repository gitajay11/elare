# Architecture

Élaré Beauty is a pnpm + Turborepo monorepo with two independently deployed
websites and one API, all sharing typed packages.

```
elare-beauty/
├── apps/
│   ├── storefront/   customer site  → main domain        (Vite + React)
│   ├── admin/        back-office    → admin subdomain    (Vite + React)
│   └── api/          Élaré API      → Neon Function      (Hono, Node 24)
└── packages/
    ├── db/           Postgres schema (Drizzle), SQL migrations, seed, client
    ├── types/        shared TypeScript types (API payloads)
    ├── validation/   Zod schemas shared by the API and both apps
    ├── ui/           design tokens, components, AuthProvider, SEO, motion
    ├── config/       brand, order lifecycle, defaults, upload limits
    └── utils/        formatting, class names, typed HTTP client
```

## Request flow

```
 browser (storefront | admin)
   │  Neon Auth SDK  ──► Neon Managed Auth (sessions, JWT)
   │
   │  fetch + Authorization: Bearer <JWT>
   ▼
 apps/api  (Hono on Neon Functions)
   │  verify JWT (JWKS) → caller | anonymous
   │  BEGIN; set local role authenticated|anonymous;
   │         set_config('request.jwt.claims', {sub,...})
   ▼
 Postgres (Neon)   business logic in SQL functions + RLS
```

* The browser never talks to the database. Both sites use `@elare/utils`'
  `createApiClient` with the session token from the Neon Auth SDK.
* The API impersonates the caller inside a transaction (`withCaller` in
  `packages/db/client.ts`). `auth.uid()`, every SQL business function and every
  RLS policy therefore behave exactly as for a direct Data API call — the API
  cannot accidentally bypass them. Only Razorpay settlement and webhooks run as
  the database owner (`asOwner`), after verifying the order belongs to the caller.
* All money, discount, stock, gift and loyalty decisions are made in SQL
  (`quote_cart`, `place_order`, `_transition_order`, …). The UI only renders
  what the API returns.

## Sites

| | Storefront | Admin |
|---|---|---|
| Package | `@elare/storefront` | `@elare/admin` |
| Host | `elare.example.com` | `admin.elare.example.com` |
| Auth | sign up / sign in / reset | sign in only; needs `profiles.role = 'admin'` |
| Bundle | no admin code | no storefront code |
| Env | `VITE_NEON_URL`, `VITE_API_URL`, `VITE_ADMIN_URL` | `VITE_NEON_URL`, `VITE_API_URL`, `VITE_STORE_URL` |

Sessions live on the Neon Auth origin, so a user signed in on the storefront is
recognised on the admin subdomain; a non-admin sees an access-denied screen
and every `/admin/*` API route rejects them with 403.

## API modules (`apps/api/src/modules`)

`store`, `auth` (profile, dashboard, addresses), `products`, `categories`,
`inventory`, `cart`, `wishlist`, `checkout`, `orders`, `payments`, `coupons`,
`loyalty`, `reviews`, `free-gifts`, `customers`, `analytics`, `settings`,
`media`. Each exports a Hono router; `server.ts` mounts them (admin routers
under `/admin/*` with `requireAdmin`). See [api.md](api.md).

`src/emails` holds transactional mail: `order-confirmation.ts` is a pure
template (payload → HTML + text), `index.ts` loads the order as the owner
and sends it through `lib/mail.ts` (nodemailer, SMTP_* env). `checkout`
triggers it for COD orders, `payments` after Razorpay settlement (verify or
webhook, whichever lands first — `mark_order_paid` reports `already`).

## Packages

* **`@elare/db`** — `schema/` (Drizzle tables mirroring the SQL), `migrations/`
  (the source of truth: tables, functions, RLS), `seed/`, `client.ts`
  (`getDb`, `withCaller`, `asSystem`, `rpc`). `pnpm db:migrate` applies
  migrations then the seed; `pnpm db:test` runs the whole thing in PGlite with
  140 assertions. See [database.md](database.md).
* **`@elare/validation`** — one Zod schema per request body/query; the API
  validates with them and the apps reuse them for forms.
* **`@elare/ui`** — Tailwind v4 tokens (`styles.css`), Button/Field/Overlay/…
  components, `AuthProvider` (generic over the auth client + profile loader),
  `Seo`, motion presets, `OrderTimeline`.

## Local development

```bash
pnpm install
cp .env.example .env.local      # fill in the Neon values (neon env pull)
pnpm db:migrate
pnpm api:dev                    # http://localhost:8790
pnpm storefront:dev             # http://localhost:5173
pnpm admin:dev                  # http://localhost:5174
```

`pnpm typecheck`, `pnpm build` and `pnpm db:test` run across the workspace via
Turborepo.

## Deployment

* **Database / Auth / Storage / API**: `neon deploy --env .env.local` (from
  `neon.ts`). The API Function bundles `apps/api/src/server.ts`.
* **Storefront** / **Admin**: two Vercel projects from this repo with
  `ELARE_APP=storefront` / `ELARE_APP=admin` (root `vercel.json` →
  `scripts/vercel-build.mjs`), or Root Directory `apps/<site>` to use the
  per-app `vercel.json`.
* Set `ALLOWED_ORIGINS` on the Function to both site origins and register both
  as trusted origins in Neon Auth.
