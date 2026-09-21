import { Hono } from 'hono';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { addresses, profiles } from '@elare/db';
import { addressSchema, profileUpdateSchema, z } from '@elare/validation';
import { body, HttpError } from '../../lib/http';
import { asCaller, call } from '../../lib/db';
import { requireAuth, userOf, type Env } from '../../middleware';

const ensureSchema = z.object({ full_name: z.string().trim().max(80).optional(), phone: z.string().trim().max(20).optional() });
const NIL = '00000000-0000-0000-0000-000000000000';

/**
 * Account: the caller's profile (created lazily from the Neon Auth user on
 * first call), their dashboard and saved addresses. Passwords and sessions are
 * handled by Neon Auth directly from the browser, never through this API.
 */
export const authRouter = new Hono<Env>()
  .use('*', requireAuth)
  // Idempotent: returns the profile, creating it on the first authenticated call after sign-up.
  .post('/profile', async (c) => {
    const p = await body(c, ensureSchema);
    return c.json(await call(userOf(c), 'ensure_profile', { p_full_name: p.full_name ?? null, p_phone: p.phone ?? null }));
  })
  .get('/profile', async (c) => c.json(await call(userOf(c), 'ensure_profile')))
  .patch('/profile', async (c) => {
    const patch = await body(c, profileUpdateSchema);
    const user = userOf(c);
    const row = await asCaller(user, async (tx) => {
      const [r] = await tx.update(profiles).set({ fullName: patch.full_name, phone: patch.phone, updatedAt: new Date() }).where(eq(profiles.id, user.id)).returning();
      return r;
    });
    if (!row) throw new HttpError(404, 'Profile not found');
    return c.json(await call(user, 'ensure_profile'));
  })
  .get('/dashboard', async (c) => c.json(await call(userOf(c), 'get_my_dashboard')))

  .get('/addresses', async (c) => {
    const user = userOf(c);
    const rows = await asCaller(user, (tx) => tx.select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.isDefault), asc(addresses.createdAt)));
    return c.json(rows.map(addressOut));
  })
  .put('/addresses', async (c) => {
    const a = await body(c, addressSchema);
    const user = userOf(c);
    const row = await asCaller(user, async (tx) => {
      if (a.is_default) await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, user.id), ne(addresses.id, a.id ?? NIL)));
      const values = { userId: user.id, label: a.label ?? null, fullName: a.full_name, phone: a.phone, line1: a.line1, line2: a.line2 ?? null, city: a.city, state: a.state, postalCode: a.postal_code, country: a.country, isDefault: a.is_default ?? false };
      if (a.id) {
        const [r] = await tx.update(addresses).set(values).where(and(eq(addresses.id, a.id), eq(addresses.userId, user.id))).returning();
        if (!r) throw new HttpError(404, 'Address not found');
        return r;
      }
      const [r] = await tx.insert(addresses).values(values).returning();
      return r;
    });
    return c.json(addressOut(row));
  })
  .delete('/addresses/:id', async (c) => {
    const user = userOf(c);
    await asCaller(user, (tx) => tx.delete(addresses).where(and(eq(addresses.id, c.req.param('id')), eq(addresses.userId, user.id))));
    return c.json({ ok: true });
  });

function addressOut(r: typeof addresses.$inferSelect) {
  return { id: r.id, user_id: r.userId, label: r.label, full_name: r.fullName, phone: r.phone, line1: r.line1, line2: r.line2, city: r.city, state: r.state, postal_code: r.postalCode, country: r.country, is_default: r.isDefault, created_at: r.createdAt };
}
