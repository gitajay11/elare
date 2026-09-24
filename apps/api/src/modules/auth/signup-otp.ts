import { Hono } from 'hono';
import { createHmac, randomInt } from 'node:crypto';
import { signupOtpSendSchema, signupOtpVerifySchema } from '@elare/validation';
import { env } from '../../lib/env';
import { body, HttpError } from '../../lib/http';
import { asOwner, rpc } from '../../lib/db';
import { clientIp, limit } from '../../lib/rate-limit';
import { sendVerificationCode } from '../../emails';
import type { Env } from '../../middleware';

/**
 * Sign-up email verification (4-digit code).
 *
 * Neon Auth creates the account from the browser; it stays unverified until
 * the customer proves they own the address here. Both endpoints are public —
 * the customer isn't signed in yet — and take only { email } / { email, otp }.
 *
 * - The code is generated with a CSPRNG, emailed, and stored only as an HMAC
 *   keyed with OTP_SECRET. It is never returned, logged or put in the subject.
 * - Durable limits live in the database (email_otp_issue / email_otp_verify):
 *   resend cooldown, hourly send cap, attempts per code, expiry, one-time use,
 *   previous code invalidated on resend. Per-IP bursts are limited here too.
 * - Unknown or already-verified emails get the same "sent" answer, so the
 *   endpoint can't be used to discover who has an account.
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
const hashCode = (email: string, code: string) => createHmac('sha256', hmacKey()).update(`${email}:${code}`).digest('hex');
const newCode = () => randomInt(0, 10 ** OTP.length).toString().padStart(OTP.length, '0');

const tooMany = (message: string, retryAfter: number, code = 'rate_limited') =>
  new Response(JSON.stringify({ error: message, code, retry_after: retryAfter }), {
    status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
  });

export const signupOtpRouter = new Hono<Env>()
  .post('/send-email-otp', async (c) => {
    const { email } = await body(c, signupOtpSendSchema);
    const wait = limit(`otp-send:${clientIp(c)}`, 10, 10 * 60_000);
    if (wait) return tooMany('Too many requests. Please try again shortly.', wait);

    const code = newCode();
    const r = await asOwner((tx) => rpc<{ status: 'sent' | 'cooldown' | 'rate_limited' | 'not_applicable'; retry_after?: number }>(tx, 'email_otp_issue', {
      p_email: email, p_code_hash: hashCode(email, code), p_ttl_seconds: OTP.ttlSeconds, p_cooldown_seconds: OTP.cooldownSeconds, p_max_per_hour: OTP.maxSendsPerHour,
    }));
    if (r.status === 'cooldown') return tooMany(`Please wait ${r.retry_after}s before requesting another code.`, r.retry_after ?? OTP.cooldownSeconds, 'cooldown');
    if (r.status === 'rate_limited') return tooMany('Too many codes requested. Please try again later.', r.retry_after ?? 3600);
    if (r.status === 'sent' && !(await sendVerificationCode(email, code, OTP.ttlSeconds / 60))) {
      throw new HttpError(502, "We couldn't send the email just now. Please try again in a moment.", 'send_failed');
    }
    return c.json({ sent: true, resend_in: OTP.cooldownSeconds, expires_in: OTP.ttlSeconds });
  })

  .post('/verify-email-otp', async (c) => {
    const { email, otp } = await body(c, signupOtpVerifySchema);
    const wait = limit(`otp-verify:${clientIp(c)}`, 30, 10 * 60_000);
    if (wait) return tooMany('Too many attempts. Please try again shortly.', wait);

    const r = await asOwner((tx) => rpc<{ status: 'verified' | 'invalid' | 'expired' | 'locked'; attempts_left?: number }>(tx, 'email_otp_verify', {
      p_email: email, p_code_hash: hashCode(email, otp), p_max_attempts: OTP.maxAttempts,
    }));
    switch (r.status) {
      case 'verified':
        return c.json({ verified: true });
      case 'expired':
        return c.json({ error: 'This code has expired. Request a new verification code.', code: 'expired_otp' }, 410);
      case 'locked':
        return c.json({ error: 'Too many incorrect attempts. Request a new verification code.', code: 'too_many_attempts' }, 429);
      default:
        return c.json({ error: "That code doesn't match. Please try again.", code: 'invalid_otp', attempts_left: r.attempts_left ?? null }, 400);
    }
  });
