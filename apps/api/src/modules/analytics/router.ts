import { Hono } from 'hono';
import { call } from '../../lib/db';
import { requireAdmin, type Env } from '../../middleware';

/** Admin dashboard: revenue, orders, customers, top products, low stock — all from real orders. */
export const adminAnalyticsRouter = new Hono<Env>()
  .use('*', requireAdmin)
  .get('/dashboard', async (c) => c.json(await call(c.get('caller'), 'admin_dashboard')));
