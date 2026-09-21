import { Hono } from 'hono';
import { listingQuerySchema, productSaveSchema, z } from '@elare/validation';
import { body, parse, query } from '../../lib/http';
import { call } from '../../lib/db';
import { requireAdmin, type Env } from '../../middleware';

const suggestSchema = z.object({ q: z.string().trim().min(1).max(80), limit: z.coerce.number().int().min(1).max(10).optional() });
const cardsSchema = z.object({ ids: z.array(z.string().uuid()).max(50) });
const adminListSchema = z.object({
  q: z.string().optional(),
  category: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional(),
});
const uuid = z.string().uuid();

/** Public catalogue. Prices, stock and ratings are computed by the database. */
export const productsRouter = new Hono<Env>()
  .get('/', async (c) => {
    const p = query(c, listingQuerySchema);
    return c.json(await call(c.get('caller'), 'list_products', {
      p_category: p.category ?? null,
      p_subcategory: p.subcategory ?? null,
      p_query: p.q ?? null,
      p_filters: p.filters ?? {},
      p_sort: p.sort ?? 'featured',
      p_page: p.page ?? 1,
      p_page_size: p.page_size ?? 24,
    }));
  })
  .get('/suggest', async (c) => {
    const { q, limit } = query(c, suggestSchema);
    return c.json(await call(c.get('caller'), 'search_suggest', { p_query: q, p_limit: limit ?? 6 }));
  })
  .post('/cards', async (c) => {
    const { ids } = await body(c, cardsSchema);
    return c.json(ids.length ? await call(c.get('caller'), 'get_product_cards', { p_ids: ids }) : []);
  })
  .get('/:slug', async (c) => {
    const product = await call(c.get('caller'), 'get_product', { p_slug: c.req.param('slug') });
    return product ? c.json(product) : c.json({ error: 'Product not found', code: 'not_found' }, 404);
  });

/** Admin catalogue management (products, shades, variants, images, bundles, recommendations). */
export const adminProductsRouter = new Hono<Env>()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const p = query(c, adminListSchema);
    return c.json(await call(c.get('caller'), 'admin_list_products', {
      p_query: p.q ?? null, p_category: p.category ?? null, p_status: p.status ?? null, p_page: p.page ?? 1, p_page_size: p.page_size ?? 30,
    }));
  })
  .get('/variant-options', async (c) => c.json(await call(c.get('caller'), 'admin_variant_options')))
  .get('/:id', async (c) => c.json(await call(c.get('caller'), 'admin_get_product', { p_id: parse(uuid, c.req.param('id')) })))
  .put('/', async (c) => c.json(await call(c.get('caller'), 'admin_save_product', { p: await body(c, productSaveSchema) })))
  .delete('/:id', async (c) => {
    await call(c.get('caller'), 'admin_delete_product', { p_id: parse(uuid, c.req.param('id')) });
    return c.json({ ok: true });
  });
