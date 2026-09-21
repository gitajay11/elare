// Creates a Razorpay order for an existing, unpaid Élaré order.
// The amount is read from the database — never from the client.
import { corsHeaders, json, requireUser, serviceClient, razorpayAuthHeader } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { order_id } = await req.json().catch(() => ({}));
  if (!order_id) return json({ error: "order_id required" }, 400);

  const db = serviceClient();
  const { data: order, error } = await db
    .from("orders")
    .select("id, order_number, user_id, grand_total, currency, payment_method, payment_status, shipping_address")
    .eq("id", order_id)
    .single();
  if (error || !order) return json({ error: "order not found" }, 404);
  if (order.user_id !== user.id) return json({ error: "forbidden" }, 403);
  if (order.payment_method !== "razorpay") return json({ error: "order is not an online payment" }, 400);
  if (order.payment_status === "paid") return json({ error: "order already paid" }, 409);

  const { data: payment } = await db
    .from("payments")
    .select("id, provider_order_id")
    .eq("order_id", order.id)
    .eq("provider", "razorpay")
    .maybeSingle();

  let providerOrderId = payment?.provider_order_id ?? null;
  if (!providerOrderId) {
    let auth: string;
    try {
      auth = razorpayAuthHeader();
    } catch (e) {
      return json({ error: (e as Error).message }, 503);
    }
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(Number(order.grand_total) * 100),
        currency: order.currency || "INR",
        receipt: order.order_number,
        notes: { elare_order_id: order.id, order_number: order.order_number },
      }),
    });
    const body = await res.json();
    if (!res.ok) return json({ error: body?.error?.description ?? "Razorpay order creation failed" }, 502);
    providerOrderId = body.id as string;
    await db.from("payments").update({ provider_order_id: providerOrderId, raw: body }).eq("order_id", order.id).eq("provider", "razorpay");
  }

  const addr = order.shipping_address as Record<string, string>;
  return json({
    key_id: Deno.env.get("RAZORPAY_KEY_ID"),
    razorpay_order_id: providerOrderId,
    amount: Math.round(Number(order.grand_total) * 100),
    currency: order.currency || "INR",
    order_number: order.order_number,
    prefill: { name: addr?.full_name, email: addr?.email || user.email, contact: addr?.phone },
  });
});
