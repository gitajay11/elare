import { Hono } from 'hono';
import { placeOrderSchema } from '@elare/validation';
import { body } from '../../lib/http';
import { call, jsonArg } from '../../lib/db';
import { requireAuth, userOf, type Env } from '../../middleware';

/**
 * Places an order. `place_order` re-quotes the cart server-side, locks the
 * inventory rows, records the coupon use, reserves redeemed points and adds
 * the free gift — atomically. Online orders stay `pending` until Razorpay
 * settles them (see the payments module); COD orders are confirmed at once.
 */
export const checkoutRouter = new Hono<Env>()
  .use('*', requireAuth)
  .post('/orders', async (c) => {
    const p = await body(c, placeOrderSchema);
    return c.json(await call(userOf(c), 'place_order', {
      p_items: jsonArg(p.items),
      p_address: p.address,
      p_payment_method: p.payment_method,
      p_coupon_code: p.coupon ?? null,
      p_redeem_points: p.redeem_points ?? 0,
      p_note: p.note ?? null,
    }), 201);
  });
