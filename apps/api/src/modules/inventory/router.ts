import { Hono } from 'hono';
import { inventoryAdjustSchema, z } from '@elare/validation';
import { body, parse, query } from '../../lib/http';
import { call } from '../../lib/db';
import { requireAdmin, type Env } from '../../middleware';

const uuid = z.string().uuid();
const listSchema = z.object({ q: z.string().optional(), low_only: z.boolean().optional() });

/** Admin stock control. Every change is an audited inventory movement. */
export const adminInventoryRouter = new Hono<Env>()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const { q, low_only } = query(c, listSchema);
    return c.json(await call(c.get('caller'), 'admin_inventory', { p_query: q ?? null, p_low_only: low_only ?? false }));
  })
  .get('/:variantId/history', async (c) =>
    c.json(await call(c.get('caller'), 'admin_inventory_history', { p_variant_id: parse(uuid, c.req.param('variantId')) })))
  .post('/:variantId/adjust', async (c) => {
    const { delta, reason, note } = await body(c, inventoryAdjustSchema);
    return c.json(await call(c.get('caller'), 'admin_adjust_inventory', {
      p_variant_id: parse(uuid, c.req.param('variantId')), p_delta: delta, p_reason: reason, p_note: note ?? null,
    }));
  });
