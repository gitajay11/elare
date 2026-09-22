import { Hono } from 'hono';
import { orderUpdateSchema, reasonSchema, z } from '@elare/validation';
import { body, parse, query } from '../../lib/http';
import { call } from '../../lib/db';
import { requireAdmin, requireAuth, userOf, type Env } from '../../middleware';
import { sendOrderStatusUpdate } from '../../emails';

const uuid = z.string().uuid();
const pageSchema = z.object({ page: z.coerce.number().int().min(1).optional(), page_size: z.coerce.number().int().min(1).max(50).optional() });
const adminListSchema = pageSchema.extend({ status: z.string().optional(), q: z.string().optional() });
const refundSchema = z.object({ reason: z.string().trim().min(3, 'Tell us why you would like a refund').max(300) });

/** The customer's own orders. */
export const ordersRouter = new Hono<Env>()
  .use('*', requireAuth)
  .get('/', async (c) => {
    const { page, page_size } = query(c, pageSchema);
    return c.json(await call(userOf(c), 'list_my_orders', { p_page: page ?? 1, p_page_size: page_size ?? 10 }));
  })
  .get('/:id', async (c) => {
    const order = await call(userOf(c), 'get_order', { p_order_id: parse(uuid, c.req.param('id')) });
    return order ? c.json(order) : c.json({ error: 'Order not found', code: 'not_found' }, 404);
  })
  .post('/:id/cancel', async (c) => {
    const { reason } = await body(c, reasonSchema);
    const id = parse(uuid, c.req.param('id'));
    const order = await call<{ status: string }>(userOf(c), 'cancel_my_order', { p_order_id: id, p_reason: reason ?? null });
    await sendOrderStatusUpdate(id, order.status);
    return c.json(order);
  })
  .post('/:id/refund-request', async (c) => {
    const { reason } = await body(c, refundSchema);
    const id = parse(uuid, c.req.param('id'));
    const order = await call<{ status: string }>(userOf(c), 'request_refund', { p_order_id: id, p_reason: reason });
    await sendOrderStatusUpdate(id, order.status);
    return c.json(order);
  });

/** Admin order management; status changes go through `_transition_order` in the database. */
export const adminOrdersRouter = new Hono<Env>()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const p = query(c, adminListSchema);
    return c.json(await call(c.get('caller'), 'admin_list_orders', { p_status: p.status ?? null, p_query: p.q ?? null, p_page: p.page ?? 1, p_page_size: p.page_size ?? 20 }));
  })
  .get('/:id', async (c) => {
    const order = await call(c.get('caller'), 'get_order', { p_order_id: parse(uuid, c.req.param('id')) });
    return order ? c.json(order) : c.json({ error: 'Order not found', code: 'not_found' }, 404);
  })
  .patch('/:id', async (c) => {
    const p = await body(c, orderUpdateSchema);
    const id = parse(uuid, c.req.param('id'));
    const order = await call<{ status: string }>(c.get('caller'), 'admin_update_order', {
      p_order_id: id,
      p_status: p.status ?? null,
      p_note: p.note ?? null,
      p_carrier: p.carrier ?? null,
      p_tracking_number: p.tracking_number ?? null,
      p_tracking_url: p.tracking_url ?? null,
    });
    // _transition_order only succeeds on a real change, so a status in the body means the customer should hear about it.
    if (p.status) await sendOrderStatusUpdate(id, order.status, p.note);
    return c.json(order);
  });
