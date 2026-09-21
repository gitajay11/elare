import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { giftRules } from '@elare/db';
import { giftRuleSchema, z } from '@elare/validation';
import { body, parse } from '../../lib/http';
import { asCaller, call } from '../../lib/db';
import { requireAdmin, type Env } from '../../middleware';

const uuid = z.string().uuid();

/**
 * Free-gift rules ("buy N items, get X"). The active rule is applied by
 * `_active_gift_rule` during quoting and ordering; customers never choose it.
 */
export const adminGiftRulesRouter = new Hono<Env>()
  .use('*', requireAdmin)
  .get('/', async (c) => c.json(await call(c.get('caller'), 'admin_gift_rules')))
  .put('/', async (c) => {
    const v = await body(c, giftRuleSchema);
    const values = {
      name: v.name,
      minQuantity: v.min_quantity,
      giftVariantId: v.gift_variant_id,
      giftQuantity: v.gift_quantity,
      startsAt: v.starts_at ? new Date(v.starts_at) : new Date(),
      endsAt: v.ends_at ? new Date(v.ends_at) : null,
      isActive: v.is_active,
    };
    const row = await asCaller(c.get('caller'), async (tx) => {
      if (v.id) return (await tx.update(giftRules).set(values).where(eq(giftRules.id, v.id)).returning())[0];
      return (await tx.insert(giftRules).values(values).returning())[0];
    });
    return c.json(row);
  })
  .delete('/:id', async (c) => {
    await asCaller(c.get('caller'), (tx) => tx.delete(giftRules).where(eq(giftRules.id, parse(uuid, c.req.param('id')))));
    return c.json({ ok: true });
  });
