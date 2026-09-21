import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { zodMessage } from '@elare/validation';

/** An error with an HTTP status; the message is safe to show to the caller. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Validates `data` against a schema, or throws a 400 with a one-line reason. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, zodMessage(r.error), 'validation');
  return r.data;
}

/** Reads and validates a JSON body. */
export async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const raw = await c.req.json().catch(() => ({}));
  return parse(schema, raw);
}

/** Parses the query string: JSON for objects/arrays, otherwise strings (schemas coerce). */
export function query<T>(c: Context, schema: ZodType<T>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c.req.query())) {
    if (v === '') continue;
    if (/^[\[{]/.test(v)) { try { out[k] = JSON.parse(v); continue; } catch { /* keep string */ } }
    if (v === 'true' || v === 'false') { out[k] = v === 'true'; continue; }
    out[k] = v;
  }
  return parse(schema, out);
}

/**
 * Maps a Postgres error raised by the business-logic functions to an HTTP
 * status. The functions raise plain sentences ("authentication required",
 * "Coupon has expired", ...), which are safe to return verbatim.
 */
export function fromDbError(err: unknown): HttpError {
  // Drizzle wraps driver errors ("Failed query: …") with the pg error as `cause`.
  const e = ((err as { cause?: unknown }).cause ?? err) as { message?: string; code?: string };
  const msg = (e.message ?? 'Database error').replace(/^.*?error:\s*/i, '').replace(/\s*\(SQLSTATE.*\)$/, '');
  if (/^authentication required$/i.test(msg)) return new HttpError(401, 'Please sign in to continue.', 'unauthenticated');
  if (/^forbidden$/i.test(msg) || e.code === '42501') return new HttpError(403, 'You do not have permission to do that.', 'forbidden');
  if (/not found$/i.test(msg)) return new HttpError(404, msg, 'not_found');
  if (e.code === '23505') return new HttpError(409, 'That already exists.', 'conflict');
  if (e.code === '23503') return new HttpError(409, 'It is still referenced by other records.', 'conflict');
  if (e.code === 'P0001' || e.code === '22023' || e.code === '23514') return new HttpError(400, msg, 'business_rule');
  return new HttpError(500, msg, e.code);
}
