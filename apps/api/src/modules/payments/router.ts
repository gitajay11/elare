import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { orders, payments } from '@elare/db';
import { razorpayVerifySchema, z } from '@elare/validation';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, need } from '../../lib/env';
import { body, HttpError } from '../../lib/http';
import { asOwner, rpc } from '../../lib/db';
import { requireAuth, userOf, type Env } from '../../middleware';
import { sendOrderConfirmation } from '../../emails';

const orderRefSchema = z.object({ order_id: z.string().uuid() });
const razorpayAuth = () => 'Basic ' + Buffer.from(`${need('RAZORPAY_KEY_ID')}:${need('RAZORPAY_KEY_SECRET')}`).toString('base64');
const hmac = (secret: string, message: string) => createHmac('sha256', secret).update(message).digest('hex');
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** Razorpay bills in the currency's minor unit (paise) and refuses anything under ₹1. */
const toPaise = (amount: string | number) => Math.round(Number(amount) * 100);
const MIN_PAISE = 100;
/** Checkout prefill wants E.164; addresses store bare 10-digit Indian mobiles. */
const e164 = (phone?: string) => (phone && /^[6-9]\d{9}$/.test(phone) ? `+91${phone}` : phone);

const storeUrl = () => (env('STORE_URL') || 'https://www.elarebeauty.store').replace(/\/$/, '');
const apiUrl = (c: { req: { url: string } }) => new URL(c.req.url).origin;

/**
 * Asks Razorpay whether an order has a captured payment and settles it if so.
 * This is what makes mobile/UPI flows self-healing: the app switch to a UPI
 * app often kills the checkout page before its success handler can run.
 */
async function reconcile(orderId: string, providerOrderId: string): Promise<{ paid: boolean; already?: boolean }> {
  const res = await fetch(`https://api.razorpay.com/v1/orders/${providerOrderId}/payments`, { headers: { Authorization: razorpayAuth() } });
  if (!res.ok) return { paid: false };
  const data = (await res.json()) as { items?: { id: string; status: string }[] };
  const captured = data.items?.find((p) => p.status === 'captured');
  if (!captured) return { paid: false };
  const r = await asOwner((tx) => rpc<{ already: boolean }>(tx, 'mark_order_paid', {
    p_order_id: orderId, p_provider_order_id: providerOrderId, p_provider_payment_id: captured.id, p_raw: { source: 'reconcile', payment: captured },
  }));
  if (!r.already) await sendOrderConfirmation(orderId);
  return { paid: true, already: r.already };
}

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

    // A payment may already have gone through (mobile app switch, closed tab).
    if (order.providerOrderId && (await reconcile(order.id, order.providerOrderId)).paid) {
      throw new HttpError(409, 'This order is already paid.', 'already_paid');
    }

    const amount = toPaise(order.grandTotal);
    if (!Number.isFinite(amount) || amount < MIN_PAISE) throw new HttpError(400, 'Online payment needs an order total of at least ₹1.');

    let providerOrderId = order.providerOrderId;
    if (!providerOrderId) {
      if (!env('RAZORPAY_KEY_ID') || !env('RAZORPAY_KEY_SECRET')) throw new HttpError(503, 'Online payments are not configured yet — please choose Cash on delivery.', 'not_configured');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
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
      amount,
      currency: order.currency || 'INR',
      order_number: order.orderNumber,
      prefill: { name: addr.full_name, email: addr.email, contact: e164(addr.phone) },
      // Razorpay POSTs the result here when checkout runs in redirect mode (mobile).
      callback_url: `${apiUrl(c)}/payments/razorpay/callback`,
    });
  })

  /** Customer-side check for orders still shown as pending: settles from Razorpay's records. */
  .post('/razorpay/reconcile', requireAuth, async (c) => {
    const { order_id } = await body(c, orderRefSchema);
    const user = userOf(c);
    const row = await asOwner(async (tx) => {
      const [r] = await tx.select({ userId: orders.userId, paymentStatus: orders.paymentStatus, providerOrderId: payments.providerOrderId })
        .from(orders).leftJoin(payments, and(eq(payments.orderId, orders.id), eq(payments.provider, 'razorpay'))).where(eq(orders.id, order_id));
      if (!r) throw new HttpError(404, 'Order not found', 'not_found');
      if (r.userId !== user.id) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
      return r;
    });
    if (row.paymentStatus === 'paid') return c.json({ paid: true, already: true });
    if (!row.providerOrderId) return c.json({ paid: false });
    return c.json(await reconcile(order_id, row.providerOrderId));
  })

  /**
   * Redirect-mode return from Razorpay Checkout (a top-level form POST, so no
   * JWT). The signature proves the result; the browser is then sent to the
   * confirmation page, or back to the order with ?payment=failed.
   */
  .post('/razorpay/callback', async (c) => {
    const form = await c.req.parseBody();
    const str = (k: string) => (typeof form[k] === 'string' ? (form[k] as string) : '');
    const orderIdFor = async (providerOrderId: string) => {
      const [p] = await asOwner((tx) => tx.select({ orderId: payments.orderId }).from(payments).where(and(eq(payments.providerOrderId, providerOrderId), eq(payments.provider, 'razorpay'))));
      return p?.orderId ?? null;
    };
    const razorpayOrderId = str('razorpay_order_id');
    const paymentId = str('razorpay_payment_id');
    const signature = str('razorpay_signature');
    if (razorpayOrderId && paymentId && signature && safeEqual(hmac(need('RAZORPAY_KEY_SECRET'), `${razorpayOrderId}|${paymentId}`), signature)) {
      const orderId = await orderIdFor(razorpayOrderId);
      if (orderId) {
        const r = await asOwner((tx) => rpc<{ already: boolean }>(tx, 'mark_order_paid', {
          p_order_id: orderId, p_provider_order_id: razorpayOrderId, p_provider_payment_id: paymentId, p_raw: { source: 'checkout-callback', razorpay_payment_id: paymentId },
        }));
        if (!r.already) await sendOrderConfirmation(orderId);
        return c.redirect(`${storeUrl()}/order/${orderId}/confirmation`, 303);
      }
    }
    // Failure: Razorpay sends error[...] fields with the order id in error[metadata] (JSON).
    let failedOrderId: string | null = null;
    try {
      const meta = JSON.parse(str('error[metadata]') || '{}') as { order_id?: string };
      if (meta.order_id) failedOrderId = await orderIdFor(meta.order_id);
    } catch { /* no metadata */ }
    if (!failedOrderId && razorpayOrderId) failedOrderId = await orderIdFor(razorpayOrderId);
    return c.redirect(failedOrderId ? `${storeUrl()}/account/orders/${failedOrderId}?payment=failed` : `${storeUrl()}/account/orders?payment=failed`, 303);
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
      return rpc<{ already: boolean }>(tx, 'mark_order_paid', {
        p_order_id: order_id, p_provider_order_id: razorpay_order_id, p_provider_payment_id: razorpay_payment_id,
        p_raw: { source: 'checkout-verify', razorpay_payment_id },
      });
    });
    if (!result.already) await sendOrderConfirmation(order_id);
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
    let confirmedOrderId: string | null = null;
    const handled = await asOwner(async (tx) => {
      const [p] = await tx.select({ orderId: payments.orderId }).from(payments).where(and(eq(payments.providerOrderId, payment.order_id!), eq(payments.provider, 'razorpay')));
      if (!p) return 'unknown order';
      if (event.event === 'payment.captured') {
        const r = await rpc<{ already: boolean }>(tx, 'mark_order_paid', { p_order_id: p.orderId, p_provider_order_id: payment.order_id, p_provider_payment_id: payment.id, p_raw: event });
        if (!r.already) confirmedOrderId = p.orderId;
      } else if (event.event === 'payment.failed') {
        await rpc(tx, 'mark_payment_failed', { p_order_id: p.orderId, p_raw: event });
      }
      return true;
    });
    // Emailed after the settlement has committed.
    if (confirmedOrderId) await sendOrderConfirmation(confirmedOrderId);
    return c.json({ ok: true, ...(handled === true ? {} : { ignored: handled }) });
  });
