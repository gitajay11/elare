import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { sql } from 'drizzle-orm';
import { need } from '../lib/env';
import { HttpError } from '../lib/http';
import { asCaller, type Caller } from '../lib/db';

export type AuthVars = { caller: Caller | null };
export type Env = { Variables: AuthVars };

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let issuer: string | undefined;

async function verify(token: string): Promise<JWTPayload> {
  jwks ??= createRemoteJWKSet(new URL(need('NEON_AUTH_JWKS_URL')));
  issuer ??= new URL(need('NEON_AUTH_BASE_URL')).origin;
  const { payload } = await jwtVerify(token, jwks, { issuer });
  return payload;
}

/**
 * Reads the Neon Auth JWT when present. Guests continue with `caller = null`
 * (they run as the `anonymous` Postgres role); a bad token is rejected rather
 * than silently downgraded so the client notices an expired session.
 */
export const optionalAuth = createMiddleware<Env>(async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  if (!/^bearer /i.test(auth)) {
    c.set('caller', null);
    return next();
  }
  try {
    const payload = await verify(auth.slice(7).trim());
    if (!payload.sub) throw new Error('no subject');
    c.set('caller', { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : null });
  } catch (e) {
    const expired = /expired/i.test(String((e as Error).message));
    if (!expired) console.warn(`[auth] rejected token: ${(e as Error).message}`);
    throw new HttpError(401, expired ? 'Your session expired — please sign in again.' : 'Invalid session.', 'unauthenticated');
  }
  await next();
});

/** Requires a signed-in caller. */
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  if (!c.get('caller')) throw new HttpError(401, 'Please sign in to continue.', 'unauthenticated');
  await next();
});

/** Requires an active admin (checked against `profiles`, the same source the SQL `require_admin()` uses). */
export const requireAdmin = createMiddleware<Env>(async (c, next) => {
  const caller = c.get('caller');
  if (!caller) throw new HttpError(401, 'Please sign in to continue.', 'unauthenticated');
  const ok = await asCaller(caller, async (tx) => (await tx.execute(sql`select is_admin() as ok`)).rows[0]?.ok === true);
  if (!ok) throw new HttpError(403, 'Admin access required.', 'forbidden');
  await next();
});

export const callerOf = (c: { get: (k: 'caller') => Caller | null }) => c.get('caller');
export const userOf = (c: { get: (k: 'caller') => Caller | null }): Caller => {
  const u = c.get('caller');
  if (!u) throw new HttpError(401, 'Please sign in to continue.', 'unauthenticated');
  return u;
};
