import { defineConfig } from "@neon/config/v1";

// Élaré Beauty on Neon: Lakebase Postgres + Managed Better Auth + Data API
// (PostgREST-compatible, used by the storefront and admin through neon-js),
// a public_read bucket for product/review media, and the API Function that
// handles Razorpay payments and uploads next to the database.
//
// Deploy with `neon deploy --env .env.local` (the file must contain every key
// listed under functions.api.env). `npm run db:migrate` applies db/migrations.
export default defineConfig({
  auth: true,
  dataApi: true,
  buckets: {
    media: { access: "public_read" },
  },
  functions: {
    api: {
      name: "Élaré API (payments + uploads)",
      source: "functions/api/index.ts",
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
