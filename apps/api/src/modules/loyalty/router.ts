import { Hono } from 'hono';
import { call } from '../../lib/db';
import { requireAuth, userOf, type Env } from '../../middleware';

/**
 * Loyalty points for the signed-in customer. Points are earned when an order
 * is delivered and redeemed at checkout or on the wishlist — all in SQL;
 * admin adjustments live in the customers module.
 */
export const loyaltyRouter = new Hono<Env>()
  .use('*', requireAuth)
  .get('/', async (c) => c.json(await call(userOf(c), 'get_my_loyalty')));
