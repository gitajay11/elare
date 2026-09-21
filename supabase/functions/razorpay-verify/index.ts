// Verifies the Razorpay checkout signature returned to the browser and
// settles the order. The webhook (razorpay-webhook) is the durable backstop.
import { corsHeaders, json, requireUser, serviceClient, hmacSha256Hex, timingSafeEqual } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json().catch(() => ({}));
  if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return json({ error: "missing fields" }, 400);

  const secret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!secret) return json({ error: "Razorpay is not configured" }, 503);

  const expected = await hmacSha256Hex(secret, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (!timingSafeEqual(expected, String(razorpay_signature))) return json({ error: "invalid signature" }, 400);

  const db = serviceClient();
  const { data: payment } = await db
    .from("payments")
    .select("order_id, provider_order_id, orders!inner(user_id)")
    .eq("order_id", order_id)
    .eq("provider", "razorpay")
    .maybeSingle();
  if (!payment || payment.provider_order_id !== razorpay_order_id) return json({ error: "payment mismatch" }, 400);
  // deno-lint-ignore no-explicit-any
  if ((payment as any).orders?.user_id !== user.id) return json({ error: "forbidden" }, 403);

  const { data, error } = await db.rpc("mark_order_paid", {
    p_order_id: order_id,
    p_provider_order_id: razorpay_order_id,
    p_provider_payment_id: razorpay_payment_id,
    p_raw: { source: "checkout-verify", razorpay_payment_id },
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, ...data });
});
