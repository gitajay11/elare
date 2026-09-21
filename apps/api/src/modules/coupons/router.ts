import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { coupons } from '@elare/db';
import { couponSchema, z } from '@elare/validation';
import { body, parse } from '../../lib/http';
import { asCaller, call } from '../../lib/db';
import { requireAdmin, requireAuth, userOf, type Env } from '../../middleware';

const uuid = z.string().uuid();

/** Coupons available to the signed-in customer (public + first-order rules applied in SQL). */
export const couponsRouter = new Hono<Env>()
  .get('/mine', requireAuth, async (c) => c.json(await call(userOf(c), 'list_my_coupons')));

/** Admin coupon management with usage statistics. */
export const adminCouponsRouter = new Hono<Env>()
  .use('*', requireAdmin)
  .get('/', async (c) => c.json(await call(c.get('caller'), 'admin_coupon_stats')))
  .put('/', async (c) => {
    const v = await body(c, couponSchema);
    const values = {
      code: v.code,
      description: v.description ?? null,
      type: v.type,
      value: String(v.value),
      minOrderValue: String(v.min_order_value),
      maxDiscount: v.max_discount == null ? null : String(v.max_discount),
      scope: v.scope,
      productIds: v.product_ids,
      categoryIds: v.category_ids,
      firstOrderOnly: v.first_order_only,
      startsAt: v.starts_at ? new Date(v.starts_at) : new Date(),
      expiresAt: v.expires_at ? new Date(v.expires_at) : null,
      usageLimit: v.usage_limit ?? null,
      perUserLimit: v.per_user_limit,
      isActive: v.is_active,
      isPublic: v.is_public,
      updatedAt: new Date(),
    };
    const row = await asCaller(c.get('caller'), async (tx) => {
      if (v.id) return (await tx.update(coupons).set(values).where(eq(coupons.id, v.id)).returning())[0];
      return (await tx.insert(coupons).values(values).returning())[0];
    });
    return c.json(row);
  })
  .delete('/:id', async (c) => {
    await asCaller(c.get('caller'), (tx) => tx.delete(coupons).where(eq(coupons.id, parse(uuid, c.req.param('id')))));
    return c.json({ ok: true });
  });
