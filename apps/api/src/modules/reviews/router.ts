import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { reviews } from '@elare/db';
import { reviewSchema, reviewStatusSchema, z } from '@elare/validation';
import { body, parse, query } from '../../lib/http';
import { asCaller, call } from '../../lib/db';
import { requireAdmin, requireAuth, userOf, type Env } from '../../middleware';

const uuid = z.string().uuid();
const adminListSchema = z.object({ status: z.string().optional(), verified_only: z.boolean().optional() });

/**
 * Customer reviews. `submit_review` marks a review verified only when the
 * customer has a delivered order containing the product; reviews go live
 * after moderation. Nothing here can create reviews on a customer's behalf.
 */
export const reviewsRouter = new Hono<Env>()
  .use('*', requireAuth)
  .post('/', async (c) => {
    const r = await body(c, reviewSchema);
    return c.json(await call(userOf(c), 'submit_review', { p_product_id: r.product_id, p_rating: r.rating, p_title: r.title ?? null, p_body: r.body, p_images: r.images ?? [] }), 201);
  })
  .get('/mine', async (c) => c.json(await call(userOf(c), 'list_my_reviews')))
  .get('/reviewable', async (c) => c.json(await call(userOf(c), 'reviewable_products')))
  .delete('/:id', async (c) => {
    const user = userOf(c);
    await asCaller(user, (tx) => tx.delete(reviews).where(and(eq(reviews.id, parse(uuid, c.req.param('id'))), eq(reviews.userId, user.id))));
    return c.json({ ok: true });
  });

/** Admin moderation. */
export const adminReviewsRouter = new Hono<Env>()
  .use('*', requireAdmin)
  .get('/', async (c) => {
    const { status, verified_only } = query(c, adminListSchema);
    return c.json(await call(c.get('caller'), 'admin_reviews', { p_status: status ?? null, p_verified_only: verified_only ?? false }));
  })
  .patch('/:id', async (c) => {
    const { status } = await body(c, reviewStatusSchema);
    await asCaller(c.get('caller'), (tx) => tx.update(reviews).set({ status, updatedAt: new Date() }).where(eq(reviews.id, parse(uuid, c.req.param('id')))));
    return c.json({ ok: true });
  })
  .delete('/:id', async (c) => {
    await asCaller(c.get('caller'), (tx) => tx.delete(reviews).where(eq(reviews.id, parse(uuid, c.req.param('id')))));
    return c.json({ ok: true });
  });
