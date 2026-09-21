import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { categories, subcategories } from '@elare/db';
import { categorySchema, subcategorySchema, z } from '@elare/validation';
import { body, parse } from '../../lib/http';
import { asCaller, call } from '../../lib/db';
import { requireAdmin, type Env } from '../../middleware';

const uuid = z.string().uuid();

/** Admin: categories and subcategories, including inactive ones. */
export const adminCategoriesRouter = new Hono<Env>()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const [cats, subs] = await asCaller(c.get('caller'), (tx) => Promise.all([
      tx.select().from(categories).orderBy(asc(categories.sortOrder)),
      tx.select().from(subcategories).orderBy(asc(subcategories.sortOrder)),
    ]));
    return c.json({
      categories: cats.map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description, image_url: r.imageUrl, sort_order: r.sortOrder, is_active: r.isActive })),
      subcategories: subs.map((r) => ({ id: r.id, category_id: r.categoryId, slug: r.slug, name: r.name, description: r.description, sort_order: r.sortOrder, is_active: r.isActive })),
    });
  })
  .put('/', async (c) => {
    const v = await body(c, categorySchema);
    const values = { slug: v.slug, name: v.name, description: v.description ?? null, imageUrl: v.image_url ?? null, sortOrder: v.sort_order ?? 0, isActive: v.is_active ?? true };
    const row = await asCaller(c.get('caller'), async (tx) => {
      if (v.id) return (await tx.update(categories).set(values).where(eq(categories.id, v.id)).returning())[0];
      return (await tx.insert(categories).values(values).returning())[0];
    });
    return c.json(row);
  })
  .delete('/:id', async (c) => {
    await call(c.get('caller'), 'admin_delete_category', { p_id: parse(uuid, c.req.param('id')) });
    return c.json({ ok: true });
  })
  .put('/subcategories', async (c) => {
    const v = await body(c, subcategorySchema);
    const values = { categoryId: v.category_id, slug: v.slug, name: v.name, description: v.description ?? null, sortOrder: v.sort_order ?? 0, isActive: v.is_active ?? true };
    const row = await asCaller(c.get('caller'), async (tx) => {
      if (v.id) return (await tx.update(subcategories).set(values).where(eq(subcategories.id, v.id)).returning())[0];
      return (await tx.insert(subcategories).values(values).returning())[0];
    });
    return c.json(row);
  })
  .delete('/subcategories/:id', async (c) => {
    await call(c.get('caller'), 'admin_delete_subcategory', { p_id: parse(uuid, c.req.param('id')) });
    return c.json({ ok: true });
  });
