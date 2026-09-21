import { Hono } from 'hono';
import { wishlistRedeemSchema, wishlistToggleSchema } from '@elare/validation';
import { body } from '../../lib/http';
import { call } from '../../lib/db';
import { requireAuth, userOf, type Env } from '../../middleware';

/** Wishlist, including redeeming an item entirely with loyalty points. */
export const wishlistRouter = new Hono<Env>()
  .use('*', requireAuth)
  .get('/', async (c) => c.json(await call(userOf(c), 'get_wishlist')))
  .post('/toggle', async (c) => {
    const { product_id, variant_id } = await body(c, wishlistToggleSchema);
    return c.json(await call(userOf(c), 'toggle_wishlist', { p_product_id: product_id, p_variant_id: variant_id ?? null }));
  })
  .post('/redeem', async (c) => {
    const { product_id, variant_id, address_id } = await body(c, wishlistRedeemSchema);
    return c.json(await call(userOf(c), 'redeem_wishlist_item', { p_product_id: product_id, p_variant_id: variant_id, p_address_id: address_id }));
  });
