import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { newsletterSubscribers } from '@elare/db';
import { customerStatusSchema, pointsAdjustSchema, z } from '@elare/validation';
import { body, parse, query } from '../../lib/http';
import { asCaller, call } from '../../lib/db';
import { requireAdmin, type Env } from '../../middleware';

const uuid = z.string().uuid();
const listSchema = z.object({ q: z.string().optional(), page: z.coerce.number().int().min(1).optional(), page_size: z.coerce.number().int().min(1).max(100).optional() });

/** Admin: customers, account status, manual point adjustments, newsletter list. */
export const adminCustomersRouter = new Hono<Env>()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const p = query(c, listSchema);
    return c.json(await call(c.get('caller'), 'admin_list_customers', { p_query: p.q ?? null, p_page: p.page ?? 1, p_page_size: p.page_size ?? 20 }));
  })
  .get('/newsletter', async (c) => {
    const rows = await asCaller(c.get('caller'), (tx) => tx.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.createdAt)).limit(200));
    return c.json(rows.map((r) => ({ id: r.id, email: r.email, source: r.source, created_at: r.createdAt })));
  })
  .get('/:id', async (c) => c.json(await call(c.get('caller'), 'admin_customer_detail', { p_user_id: parse(uuid, c.req.param('id')) })))
  .patch('/:id/status', async (c) => {
    const { status } = await body(c, customerStatusSchema);
    await call(c.get('caller'), 'admin_set_customer_status', { p_user_id: parse(uuid, c.req.param('id')), p_status: status });
    return c.json({ ok: true });
  })
  .post('/:id/points', async (c) => {
    const { points, description } = await body(c, pointsAdjustSchema);
    return c.json(await call(c.get('caller'), 'admin_adjust_points', { p_user_id: parse(uuid, c.req.param('id')), p_points: points, p_description: description ?? 'Manual adjustment' }));
  });
