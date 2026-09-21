import { Hono } from 'hono';
import { cartItemsSchema, quoteSchema, z } from '@elare/validation';
import { body } from '../../lib/http';
import { call, jsonArg } from '../../lib/db';
import { requireAuth, userOf, type Env } from '../../middleware';

const syncSchema = z.object({ items: cartItemsSchema, replace: z.boolean().optional() });

/**
 * Cart pricing and persistence. A quote is the only source of line prices,
 * discounts, shipping, tax, points and the free gift — the storefront never
 * computes any of them. Guests may quote; syncing needs an account.
 */
export const cartRouter = new Hono<Env>()
  .post('/quote', async (c) => {
    const { items, coupon, redeem_points } = await body(c, quoteSchema);
    return c.json(await call(c.get('caller'), 'quote_cart', { p_items: jsonArg(items), p_coupon_code: coupon ?? null, p_redeem_points: redeem_points ?? 0 }));
  })
  .put('/', requireAuth, async (c) => {
    const { items, replace } = await body(c, syncSchema);
    return c.json(await call(userOf(c), 'sync_cart', { p_items: jsonArg(items), p_replace: replace ?? false }));
  });
