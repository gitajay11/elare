import type { Context } from 'hono';

/**
 * Small in-memory fixed-window limiter, per function instance. It's the first
 * line of defence against bursts from one client; the durable limits (resend
 * cooldown, hourly send cap, attempts per code) live in the database.
 */
const buckets = new Map<string, { count: number; reset: number }>();

/** Counts a hit; returns 0 when allowed, otherwise the seconds until the window resets. */
export function limit(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    return 0;
  }
  if (b.count >= max) return Math.max(1, Math.ceil((b.reset - now) / 1000));
  b.count++;
  return 0;
}

/** Best-effort client address (first hop of X-Forwarded-For). */
export const clientIp = (c: Context): string =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';
