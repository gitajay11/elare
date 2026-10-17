import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { orders, payments } from '@elare/db';
import { z } from '@elare/validation';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, need } from '../../lib/env';
import { body, HttpError } from '../../lib/http';
import { asOwner, rpc } from '../../lib/db';
import { requireAuth, userOf, type Env } from '../../middleware';
import { sendOrderConfirmation } from '../../emails';

/**
 * YouPI — a self-hosted UPI gateway (github.com/gxurav1710/YouPI-PG). The
 * customer pays the store's own UPI ID by QR; the gateway confirms the
 * payment from the bank's credit alert and tells us by signed webhook.
 *
 *   YOUPI_API_URL         the gateway's public base URL (its checkout portal
 *                         proxies /api/*), e.g. https://pay.elarebeauty.store
 *   YOUPI_WEBHOOK_SECRET  the merchant webhook secret set in YouPI's admin
 *   YOUPI_MERCHANT_ID     optional; YouPI uses its default merchant otherwise
 *
 * Trust model: the payment session is created here, server-side, with the
 * order's real total — YouPI accepts any amount from whoever calls it, so the
 * browser never gets to choose one. An order is settled only when YouPI says
 * SUCCESS (signed webhook, or our own server-side status query) and the
 * amount and order match what we asked for.
 */
const orderRefSchema = z.object({ order_id: z.string().uuid() });
const ACTIVE = new Set(['INITIATED', 'ACTIVE', 'QUEUED', 'PROCESSING']);

interface YoupiSession {
  paymentId: string;
  orderId: string;
  amountPaise: string | number;
  status: string;
  checkoutUrl?: string;
  utr?: string;
  metadata?: { elare_order_id?: string } & Record<string, unknown>;
}

export const youpiEnabled = () => Boolean(env('YOUPI_API_URL'));
const base = () => need('YOUPI_API_URL').replace(/\/$/, '');
const storeUrl = () => (env('STORE_URL') || 'https://www.elarebeauty.store').replace(/\/$/, '');
const toPaise = (amount: string | number) => Math.round(Number(amount) * 100);
const hmac = (secret: string, message: string) => createHmac('sha256', secret).update(message, 'utf8').digest('hex');
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function youpi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const merchant = env('YOUPI_MERCHANT_ID');
  if (merchant) headers['X-Merchant-Id'] = merchant;
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new HttpError(502, 'The UPI payment service is not reachable right now. Please try again or choose another method.', 'gateway_unreachable');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, data?.message || data?.error || 'The UPI payment service refused the request.', 'gateway_error');
  return data;
}

/** The checkout page must be the gateway's own — never send customers anywhere else. */
function trustedCheckoutUrl(url: string | undefined): string {
  if (!url) throw new HttpError(502, 'The UPI payment service did not return a checkout page.', 'gateway_error');
  const allowed = [env('YOUPI_API_URL'), env('YOUPI_CHECKOUT_URL')].filter(Boolean).map((u) => new URL(u!).origin);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new HttpError(502, 'The UPI payment service returned an invalid checkout page.', 'gateway_error'); }
  if (!allowed.includes(parsed.origin)) throw new HttpError(502, 'The UPI payment service returned an unexpected checkout address.', 'gateway_error');
  return parsed.toString();
}

/**
 * Settles the order if — and only if — the gateway reports this session as
 * paid, for this order, for the full amount. Returns whether it is now paid.
 */
async function settle(orderId: string, grandTotal: string, s: YoupiSession, source: string): Promise<boolean> {
  if (s.status !== 'SUCCESS') return false;
  if (Number(s.amountPaise) !== toPaise(grandTotal)) {
    console.error(`[youpi] amount mismatch for order ${orderId}: gateway ${s.amountPaise} paise, order ${toPaise(grandTotal)} paise — not settled`);
    return false;
  }
  if (s.metadata?.elare_order_id && s.metadata.elare_order_id !== orderId) {
    console.error(`[youpi] session ${s.paymentId} belongs to order ${s.metadata.elare_order_id}, not ${orderId} — not settled`);
    return false;
  }
  const r = await asOwner((tx) => rpc<{ already: boolean }>(tx, 'mark_order_paid', {
    p_order_id: orderId, p_provider_order_id: s.paymentId, p_provider_payment_id: s.utr || s.paymentId,
    p_raw: { source, gateway: 'youpi', paymentId: s.paymentId, gatewayOrderId: s.orderId, amountPaise: Number(s.amountPaise), utr: s.utr ?? null },
  }));
  if (!r.already) await sendOrderConfirmation(orderId);
  return true;
}

/** The caller's YouPI order and its current gateway session id, after an ownership check. */
async function ownOrder(orderId: string, userId: string) {
  return asOwner(async (tx) => {
    const [r] = await tx.select({
      id: orders.id, userId: orders.userId, orderNumber: orders.orderNumber, grandTotal: orders.grandTotal, currency: orders.currency,
      paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus, status: orders.status, address: orders.shippingAddress,
      sessionId: payments.providerOrderId, raw: payments.raw,
    }).from(orders).leftJoin(payments, and(eq(payments.orderId, orders.id), eq(payments.provider, 'youpi'))).where(eq(orders.id, orderId));
    if (!r) throw new HttpError(404, 'Order not found', 'not_found');
    if (r.userId !== userId) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
    if (r.paymentMethod !== 'youpi') throw new HttpError(400, 'This order is not a UPI QR payment.');
    return r;
  });
}

export const youpiRouter = new Hono<Env>()
  /**
   * Starts (or resumes) the UPI payment for a placed order and returns the
   * gateway's checkout page. A session that is still running is reused; one
   * that has ended (expired, cancelled, failed) is replaced by a fresh one.
   */
  .post('/session', requireAuth, async (c) => {
    if (!youpiEnabled()) throw new HttpError(503, 'UPI QR payments are not available yet — please choose another method.', 'not_configured');
    const { order_id } = await body(c, orderRefSchema);
    const order = await ownOrder(order_id, userOf(c).id);
    if (order.paymentStatus === 'paid') throw new HttpError(409, 'This order is already paid.', 'already_paid');
    if (order.status === 'cancelled') throw new HttpError(409, 'This order was cancelled.', 'cancelled');
    const amountPaise = toPaise(order.grandTotal);
    if (!Number.isFinite(amountPaise) || amountPaise < 100) throw new HttpError(400, 'UPI payment needs an order total of at least ₹1.');

    if (order.sessionId) {
      const current = await youpi<YoupiSession>(`/api/v1/payments/${encodeURIComponent(order.sessionId)}`).catch(() => null);
      if (current && (await settle(order.id, order.grandTotal, current, 'session-check'))) {
        throw new HttpError(409, 'This order is already paid.', 'already_paid');
      }
      const saved = (order.raw as { checkout_url?: string } | null)?.checkout_url;
      if (current && ACTIVE.has(current.status) && saved) return c.json({ checkout_url: trustedCheckoutUrl(saved), payment_id: current.paymentId });
    }

    const addr = (order.address ?? {}) as Record<string, string>;
    const created = await youpi<YoupiSession>('/api/v1/payments', {
      method: 'POST',
      body: JSON.stringify({
        orderId: order.orderNumber,
        amount: (amountPaise / 100).toFixed(2),
        currency: order.currency || 'INR',
        description: `Élaré Beauty order ${order.orderNumber}`,
        customer: { name: addr.full_name, email: addr.email, phoneNumber: addr.phone },
        returnUrl: `${storeUrl()}/order/${order.id}/confirmation`,
        metadata: { elare_order_id: order.id, order_number: order.orderNumber },
      }),
    });
    if (Number(created.amountPaise) !== amountPaise) {
      console.error(`[youpi] gateway created ${created.paymentId} for ${created.amountPaise} paise; order ${order.id} is ${amountPaise}`);
      throw new HttpError(502, 'The UPI payment service returned the wrong amount. Please choose another method.', 'gateway_error');
    }
    if (await settle(order.id, order.grandTotal, { ...created, metadata: { elare_order_id: order.id } }, 'session-create')) {
      throw new HttpError(409, 'This order is already paid.', 'already_paid');
    }
    const checkoutUrl = trustedCheckoutUrl(created.checkoutUrl);
    await asOwner((tx) => tx.update(payments)
      .set({ providerOrderId: created.paymentId, status: 'pending', raw: { checkout_url: checkoutUrl, gateway_order_id: created.orderId, created_at: new Date().toISOString() }, updatedAt: new Date() })
      .where(and(eq(payments.orderId, order.id), eq(payments.provider, 'youpi'))));
    return c.json({ checkout_url: checkoutUrl, payment_id: created.paymentId });
  })

  /** Customer-side check for an order still shown as pending: asks the gateway directly. */
  .post('/reconcile', requireAuth, async (c) => {
    const { order_id } = await body(c, orderRefSchema);
    const order = await ownOrder(order_id, userOf(c).id);
    if (order.paymentStatus === 'paid') return c.json({ paid: true, already: true });
    if (!order.sessionId || !youpiEnabled()) return c.json({ paid: false });
    const s = await youpi<YoupiSession>(`/api/v1/payments/${encodeURIComponent(order.sessionId)}`).catch(() => null);
    return c.json({ paid: s ? await settle(order.id, order.grandTotal, s, 'reconcile') : false, status: s?.status ?? null });
  })

  /**
   * The gateway's server-to-server result (X-Gateway-Signature: sha256=<hex>,
   * an HMAC of the raw body with the shared webhook secret). Retried by the
   * gateway until it gets a 2xx, so every branch is idempotent.
   */
  .post('/webhook', async (c) => {
    const secret = env('YOUPI_WEBHOOK_SECRET');
    if (!secret) throw new HttpError(503, 'Webhook secret not configured', 'not_configured');
    const raw = await c.req.text();
    const sig = c.req.header('x-gateway-signature') ?? '';
    if (!safeEqual(`sha256=${hmac(secret, raw)}`, sig)) throw new HttpError(401, 'Invalid signature', 'bad_signature');

    let event: { event?: string; paymentId?: string; orderId?: string; amountPaise?: number; utr?: string; metadata?: { elare_order_id?: string } };
    try { event = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON'); }
    if (!event.paymentId) return c.json({ ok: true, ignored: 'no payment id' });

    // Find our order: by the session we created, else by the order id we put in its metadata.
    const row = await asOwner(async (tx) => {
      const sel = { orderId: orders.id, grandTotal: orders.grandTotal, sessionId: payments.providerOrderId };
      const [bySession] = await tx.select(sel).from(payments).innerJoin(orders, eq(orders.id, payments.orderId))
        .where(and(eq(payments.provider, 'youpi'), eq(payments.providerOrderId, event.paymentId!)));
      if (bySession) return bySession;
      const meta = event.metadata?.elare_order_id;
      if (!meta || !/^[0-9a-f-]{36}$/i.test(meta)) return null;
      const [byMeta] = await tx.select(sel).from(payments).innerJoin(orders, eq(orders.id, payments.orderId))
        .where(and(eq(payments.provider, 'youpi'), eq(orders.id, meta)));
      return byMeta ?? null;
    });
    if (!row) return c.json({ ok: true, ignored: 'unknown order' });

    if (event.event === 'SUCCESS') {
      const settled = await settle(row.orderId, row.grandTotal, {
        paymentId: event.paymentId, orderId: event.orderId ?? '', amountPaise: event.amountPaise ?? 0, status: 'SUCCESS', utr: event.utr,
        metadata: { elare_order_id: event.metadata?.elare_order_id ?? row.orderId },
      }, 'webhook');
      return c.json({ ok: true, settled });
    }
    // An ended session only fails the payment if it is the order's current one
    // (a stale session expiring must not undo a newer attempt).
    if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(event.event ?? '') && row.sessionId === event.paymentId) {
      await asOwner((tx) => rpc(tx, 'mark_payment_failed', { p_order_id: row.orderId, p_raw: { source: 'webhook', gateway: 'youpi', event: event.event, paymentId: event.paymentId } }));
    }
    return c.json({ ok: true });
  });
