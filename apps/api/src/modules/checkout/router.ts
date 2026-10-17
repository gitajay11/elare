import { Hono } from 'hono';
import { placeOrderSchema } from '@elare/validation';
import { body, HttpError } from '../../lib/http';
import { call, jsonArg } from '../../lib/db';
import { requireAuth, userOf, type Env } from '../../middleware';
import { sendOrderConfirmation } from '../../emails';
import { youpiEnabled } from '../payments/youpi';

/**
 * Places an order. `place_order` re-quotes the cart server-side, locks the
 * inventory rows, records the coupon use, reserves redeemed points and adds
 * the free gift — atomically. Online orders stay `pending` until their
 * gateway (Razorpay or YouPI) settles them (see the payments module); COD orders are confirmed at once
 * and emailed straight away.
 */
export const checkoutRouter = new Hono<Env>()
  .use('*', requireAuth)
  .post('/orders', async (c) => {
    const p = await body(c, placeOrderSchema);
    // Don't reserve stock for a UPI QR order nobody could pay.
    if (p.payment_method === 'youpi' && !youpiEnabled()) throw new HttpError(400, 'UPI QR payments are not available yet — please choose another method.', 'not_configured');
    const order = await call<{ order_id: string; status: string }>(userOf(c), 'place_order', {
      p_items: jsonArg(p.items),
      p_address: p.address,
      p_payment_method: p.payment_method,
      p_coupon_code: p.coupon ?? null,
      p_redeem_points: p.redeem_points ?? 0,
      p_note: p.note ?? null,
    });
    // Awaited: a pending promise would be lost if the function suspends after responding.
    if (p.payment_method === 'cod') await sendOrderConfirmation(order.order_id);
    return c.json(order, 201);
  });
