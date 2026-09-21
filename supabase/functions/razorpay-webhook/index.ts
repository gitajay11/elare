// Razorpay webhook receiver. Verifies X-Razorpay-Signature against the raw
// body with RAZORPAY_WEBHOOK_SECRET, then settles / fails the payment.
// Configure the webhook in Razorpay for `payment.captured` and `payment.failed`.
import { json, serviceClient, hmacSha256Hex, timingSafeEqual } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return json({ error: "webhook secret not configured" }, 503);

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const expected = await hmacSha256Hex(secret, raw);
  if (!timingSafeEqual(expected, signature)) return json({ error: "invalid signature" }, 400);

  const event = JSON.parse(raw);
  const payment = event?.payload?.payment?.entity;
  if (!payment?.order_id) return json({ ok: true, ignored: true });

  const db = serviceClient();
  const { data: row } = await db
    .from("payments")
    .select("order_id")
    .eq("provider_order_id", payment.order_id)
    .eq("provider", "razorpay")
    .maybeSingle();
  if (!row) return json({ ok: true, ignored: "unknown order" });

  if (event.event === "payment.captured") {
    const { error } = await db.rpc("mark_order_paid", {
      p_order_id: row.order_id,
      p_provider_order_id: payment.order_id,
      p_provider_payment_id: payment.id,
      p_raw: event,
    });
    if (error) return json({ error: error.message }, 500);
  } else if (event.event === "payment.failed") {
    await db.rpc("mark_payment_failed", { p_order_id: row.order_id, p_raw: event });
  }
  return json({ ok: true });
});
