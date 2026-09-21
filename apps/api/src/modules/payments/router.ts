import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { orders, payments } from '@elare/db';
import { razorpayVerifySchema, z } from '@elare/validation';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, need } from '../../lib/env';
import { body, HttpError } from '../../lib/http';
import { asOwner, rpc } from '../../lib/db';
import { requireAuth, userOf, type Env } from '../../middleware';

const orderRefSchema = z.object({ order_id: z.string().uuid() });
const razorpayAuth = () => 'Basic ' + Buffer.from(`${need('RAZORPAY_KEY_ID')}:${need('RAZORPAY_KEY_SECRET')}`).toString('base64');
const hmac = (secret: string, message: string) => createHmac('sha256', secret).update(message).digest('hex');
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Razorpay. Settlement (`mark_order_paid` / `mark_payment_failed`) may only be
 * executed by the database owner, so this module is the one place that runs
 * outside the caller's RLS context — after checking the order belongs to them.
 */
export const paymentsRouter = new Hono<Env>()
  .post('/razorpay/order', requireAuth, async (c) => {
    const { order_id } = await body(c, orderRefSchema);
    const user = userOf(c);
    const order = await asOwner(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, order_id));
      if (!o) throw new HttpError(404, 'Order not found', 'not_found');
      if (o.userId !== user.id) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
      if (o.paymentMethod !== 'razorpay') throw new HttpError(400, 'This order is not an online payment.');
      if (o.paymentStatus === 'paid') throw new HttpError(409, 'This order is already paid.');
      const [p] = await tx.select().from(payments).where(and(eq(payments.orderId, o.id), eq(payments.provider, 'razorpay')));
      return { ...o, providerOrderId: p?.providerOrderId ?? null };
    });

    let providerOrderId = order.providerOrderId;
    if (!providerOrderId) {
      if (!env('RAZORPAY_KEY_ID') || !env('RAZORPAY_KEY_SECRET')) throw new HttpError(503, 'Online payments are not configured yet — please choose Cash on delivery.', 'not_configured');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(Number(order.grandTotal) * 100),
          currency: order.currency || 'INR',
          receipt: order.orderNumber,
          notes: { elare_order_id: order.id, order_number: order.orderNumber },
        }),
      });
      const data = (await res.json()) as { id?: string; error?: { description?: string } };
      if (!res.ok || !data.id) throw new HttpError(502, data?.error?.description ?? 'Razorpay order creation failed');
      providerOrderId = data.id;
      await asOwner((tx) => tx.update(payments).set({ providerOrderId, raw: data, updatedAt: new Date() }).where(and(eq(payments.orderId, order.id), eq(payments.provider, 'razorpay'))));
    }
    const addr = (order.shippingAddress ?? {}) as Record<string, string>;
    return c.json({
      key_id: env('RAZORPAY_KEY_ID'),
      razorpay_order_id: providerOrderId,
      amount: Math.round(Number(order.grandTotal) * 100),
      currency: order.currency || 'INR',
      order_number: order.orderNumber,
      prefill: { name: addr.full_name, email: addr.email, contact: addr.phone },
    });
  })

  .post('/razorpay/verify', requireAuth, async (c) => {
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await body(c, razorpayVerifySchema);
    const user = userOf(c);
    const expected = hmac(need('RAZORPAY_KEY_SECRET'), `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!safeEqual(expected, razorpay_signature)) throw new HttpError(400, 'Invalid payment signature.');
    const result = await asOwner(async (tx) => {
      const [row] = await tx.select({ providerOrderId: payments.providerOrderId, userId: orders.userId })
        .from(payments).innerJoin(orders, eq(orders.id, payments.orderId))
        .where(and(eq(payments.orderId, order_id), eq(payments.provider, 'razorpay')));
      if (!row || row.providerOrderId !== razorpay_order_id) throw new HttpError(400, 'Payment does not match this order.');
      if (row.userId !== user.id) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
      return rpc<Record<string, unknown>>(tx, 'mark_order_paid', {
        p_order_id: order_id, p_provider_order_id: razorpay_order_id, p_provider_payment_id: razorpay_payment_id,
        p_raw: { source: 'checkout-verify', razorpay_payment_id },
      });
    });
    return c.json({ ok: true, ...result });
  })

  // Backstop for payments captured after the customer closed the tab.
  .post('/razorpay/webhook', async (c) => {
    const secret = env('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) throw new HttpError(503, 'Webhook secret not configured', 'not_configured');
    const raw = await c.req.text();
    if (!safeEqual(hmac(secret, raw), c.req.header('x-razorpay-signature') ?? '')) throw new HttpError(400, 'Invalid signature');
    const event = JSON.parse(raw) as { event: string; payload?: { payment?: { entity?: { id: string; order_id?: string } } } };
    const payment = event?.payload?.payment?.entity;
    if (!payment?.order_id) return c.json({ ok: true, ignored: true });
    const handled = await asOwner(async (tx) => {
      const [p] = await tx.select({ orderId: payments.orderId }).from(payments).where(and(eq(payments.providerOrderId, payment.order_id!), eq(payments.provider, 'razorpay')));
      if (!p) return 'unknown order';
      if (event.event === 'payment.captured') {
        await rpc(tx, 'mark_order_paid', { p_order_id: p.orderId, p_provider_order_id: payment.order_id, p_provider_payment_id: payment.id, p_raw: event });
      } else if (event.event === 'payment.failed') {
        await rpc(tx, 'mark_payment_failed', { p_order_id: p.orderId, p_raw: event });
      }
      return true;
    });
    return c.json({ ok: true, ...(handled === true ? {} : { ignored: handled }) });
  });
