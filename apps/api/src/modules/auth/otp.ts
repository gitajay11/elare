import { createHmac, randomInt } from 'node:crypto';
import { env } from '../../lib/env';
import { HttpError } from '../../lib/http';

/**
 * The 4-digit email code shared by sign-up verification and forgot password.
 *
 * Codes come from a CSPRNG, are emailed, and are stored only as an HMAC keyed
 * with OTP_SECRET — never returned, logged or put in a subject line. The
 * durable rules (resend cooldown, hourly cap, attempts, expiry, one-time use,
 * previous code invalidated) live in email_otp_issue / email_otp_verify.
 */
export const OTP = { length: 4, ttlSeconds: 10 * 60, cooldownSeconds: 30, maxSendsPerHour: 5, maxAttempts: 5 } as const;

let warned = false;
function hmacKey(): string {
  const key = env('OTP_SECRET');
  if (key) return key;
  // Fallback keeps verification working before OTP_SECRET is deployed; the
  // connection string is a server-only secret too.
  const fallback = env('DATABASE_URL');
  if (!fallback) throw new HttpError(503, 'Email verification is not configured yet.', 'not_configured');
  if (!warned) { console.warn('[otp] OTP_SECRET is not set; using a derived key'); warned = true; }
  return fallback;
}

export const hashCode = (email: string, code: string) => createHmac('sha256', hmacKey()).update(`${email}:${code}`).digest('hex');
export const newCode = () => randomInt(0, 10 ** OTP.length).toString().padStart(OTP.length, '0');

export type IssueStatus = 'sent' | 'cooldown' | 'rate_limited' | 'not_applicable' | 'not_found';
export type VerifyStatus = 'verified' | 'invalid' | 'expired' | 'locked';

export const tooMany = (message: string, retryAfter: number, code = 'rate_limited') =>
  new Response(JSON.stringify({ error: message, code, retry_after: retryAfter }), {
    status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
  });

/** 429 for the database's cooldown / hourly-cap answers; null otherwise. */
export function issueRefusal(r: { status: IssueStatus; retry_after?: number }): Response | null {
  if (r.status === 'cooldown') return tooMany(`Please wait ${r.retry_after}s before requesting another code.`, r.retry_after ?? OTP.cooldownSeconds, 'cooldown');
  if (r.status === 'rate_limited') return tooMany('Too many codes requested. Please try again later.', r.retry_after ?? 3600);
  return null;
}
