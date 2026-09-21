import { cors } from 'hono/cors';
import { env } from '../lib/env';

/**
 * Allows the storefront and admin origins (ALLOWED_ORIGINS, comma-separated).
 * Both sites live on different hosts, so every browser call to the API is
 * cross-origin. "*" allows everything; "http://localhost:*" allows any local
 * dev port.
 */
export function corsMiddleware() {
  const allowed = (env('ALLOWED_ORIGINS') || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const matches = (origin: string) => allowed.some((a) => a === '*' || a === origin || (a.endsWith(':*') && origin.startsWith(a.slice(0, -1))));
  return cors({
    origin: (origin) => (allowed.includes('*') ? origin || '*' : matches(origin) ? origin : ''),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
  });
}
