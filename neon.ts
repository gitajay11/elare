import { defineConfig } from "@neon/config/v1";

// Élaré Beauty on Neon: Lakebase Postgres + Managed Better Auth + Data API
// (kept enabled only for its `authenticated` / `anonymous` roles and auth.uid(),
// which the API impersonates — no client calls it directly),
// a public_read bucket for product/review media, and the API Function
// (apps/api) that the storefront and admin sites call.
//
// Deploy with `neon deploy --env .env.local` (the file must contain every key
// listed under functions.api.env). `pnpm db:migrate` applies packages/db.
export default defineConfig({
  auth: true,
  dataApi: true,
  buckets: {
    media: { access: "public_read" },
  },
  functions: {
    api: {
      name: "Élaré API",
      source: "apps/api/src/server.ts",
      env: {
        MEDIA_BUCKET: "media",
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ?? "*",
        // Razorpay is optional until the gateway is configured; keys are uploaded
        // only when present so an unset key never overwrites a live value with "".
        ...(process.env.RAZORPAY_KEY_ID ? { RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID } : {}),
        ...(process.env.RAZORPAY_KEY_SECRET ? { RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET } : {}),
        ...(process.env.RAZORPAY_WEBHOOK_SECRET ? { RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET } : {}),
      },
    },
  },
  branch: (branch) => {
    if (branch.exists || branch.isDefault) return {};
    // Preview / dev branches clean themselves up.
    return { ttl: "7d" };
  },
});
