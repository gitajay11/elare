import { Hono, type Context } from 'hono';
import { createHash, randomBytes } from 'node:crypto';
import { forgotPasswordSchema, forgotPasswordVerifySchema, resetPasswordSchema } from '@elare/validation';
import { env } from '../../lib/env';
import { body, HttpError } from '../../lib/http';
import { asOwner, rpc } from '../../lib/db';
import { clientIp, limit } from '../../lib/rate-limit';
import { sendVerificationCode } from '../../emails';
import { OTP, hashCode, issueRefusal, newCode, tooMany, type IssueStatus, type VerifyStatus } from './otp';
import type { Env } from '../../middleware';

/**
 * Forgot password, with the same 4-digit email code as sign-up (see ./otp).
 *
 *   POST /auth/forgot-password              { email }                 → code emailed
 *   POST /auth/forgot-password/resend-otp   { email }                 → new code, old one void
 *   POST /auth/forgot-password/verify-otp   { email, otp }            → { reset_token } (10 min)
 *   POST /auth/reset-password               { email, reset_token,
 *                                             password, confirm_password } → password changed
 *
 * Entering the right code changes nothing by itself: it earns a short-lived,
 * single-use reset grant (only its SHA-256 is stored) that the last step must
 * present. The password is then set by Neon Auth itself — we hand it a
 * one-time reset token of its own kind and redeem it server-side, so hashing
 * and the credential stay Neon Auth's — and every existing session is signed
 * out. Passwords are never logged, stored or echoed.
 *
 * Unknown emails get an explicit "no account" answer (the product's choice);
 * the per-IP limit keeps that from being used to sweep for addresses.
 */
const GRANT_TTL_SECONDS = 10 * 60;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const token = () => randomBytes(32).toString('base64url');

const NOT_FOUND = "We couldn't find an account associated with that email address. Please check the email and try again.";
const INVALID_OTP = 'That verification code is incorrect. Please try again.';
const EXPIRED_OTP = 'This verification code has expired. Please request a new code.';
const RESET_EXPIRED = 'Your reset session has expired. Please request a new code.';

async function sendCode(c: Context<Env>) {
  const { email } = await body(c, forgotPasswordSchema);
  const wait = limit(`pw-send:${clientIp(c)}`, 10, 10 * 60_000);
  if (wait) return tooMany('Too many requests. Please try again shortly.', wait);

  const code = newCode();
  const r = await asOwner((tx) => rpc<{ status: IssueStatus; retry_after?: number }>(tx, 'email_otp_issue', {
    p_email: email, p_code_hash: hashCode(email, code), p_ttl_seconds: OTP.ttlSeconds, p_cooldown_seconds: OTP.cooldownSeconds,
    p_max_per_hour: OTP.maxSendsPerHour, p_purpose: 'reset',
  }));
  if (r.status === 'not_found') return c.json({ error: NOT_FOUND, code: 'account_not_found' }, 404);
  const refused = issueRefusal(r);
  if (refused) return refused;
  if (!(await sendVerificationCode(email, code, OTP.ttlSeconds / 60, 'reset'))) {
    throw new HttpError(502, "We couldn't send the email just now. Please try again in a moment.", 'send_failed');
  }
  return c.json({ sent: true, resend_in: OTP.cooldownSeconds, expires_in: OTP.ttlSeconds });
}

/** Neon Auth checks the Origin of password changes; ours is the storefront. */
function authOrigin(): string {
  const store = env('STORE_URL') || env('ALLOWED_ORIGINS')?.split(',')[0]?.trim() || 'https://www.elarebeauty.store';
  return new URL(store).origin;
}

/** Redeems a one-time Neon Auth reset token. Resolves to Neon Auth's error code on refusal. */
async function neonAuthReset(authToken: string, newPassword: string): Promise<{ ok: true } | { ok: false; code: string }> {
  const base = env('NEON_AUTH_BASE_URL');
  if (!base) throw new HttpError(503, 'Password reset is not configured yet.', 'not_configured');
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: authOrigin() },
      body: JSON.stringify({ token: authToken, newPassword }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const err = (await res.json().catch(() => ({}))) as { code?: string };
    console.warn(`[password-reset] Neon Auth refused the reset: ${res.status} ${err.code ?? ''}`);
    return { ok: false, code: err.code ?? `HTTP_${res.status}` };
  } catch (e) {
    console.warn(`[password-reset] Neon Auth unreachable: ${(e as Error).name}`);
    return { ok: false, code: 'UNREACHABLE' };
  }
}

export const passwordResetRouter = new Hono<Env>()
  .post('/forgot-password', sendCode)
  .post('/forgot-password/resend-otp', sendCode)

  .post('/forgot-password/verify-otp', async (c) => {
    const { email, otp } = await body(c, forgotPasswordVerifySchema);
    const wait = limit(`pw-verify:${clientIp(c)}`, 30, 10 * 60_000);
    if (wait) return tooMany('Too many attempts. Please try again shortly.', wait);

    const grant = token();
    const r = await asOwner((tx) => rpc<{ status: VerifyStatus; attempts_left?: number }>(tx, 'email_otp_verify', {
      p_email: email, p_code_hash: hashCode(email, otp), p_max_attempts: OTP.maxAttempts,
      p_purpose: 'reset', p_grant_hash: sha256(grant), p_grant_ttl_seconds: GRANT_TTL_SECONDS,
    }));
    switch (r.status) {
      case 'verified':
        return c.json({ verified: true, reset_token: grant, expires_in: GRANT_TTL_SECONDS });
      case 'expired':
        return c.json({ error: EXPIRED_OTP, code: 'expired_otp' }, 410);
      case 'locked':
        return c.json({ error: 'Too many incorrect attempts. Please request a new code.', code: 'too_many_attempts' }, 429);
      default:
        return c.json({ error: INVALID_OTP, code: 'invalid_otp', attempts_left: r.attempts_left ?? null }, 400);
    }
  })

  .post('/reset-password', async (c) => {
    const wait = limit(`pw-reset:${clientIp(c)}`, 10, 10 * 60_000);
    if (wait) return tooMany('Too many attempts. Please try again shortly.', wait);
    const { email, reset_token, password } = await body(c, resetPasswordSchema);
    const grantHash = sha256(reset_token);

    const authToken = token();
    const claim = await asOwner((tx) => rpc<{ status: 'ok' | 'invalid' | 'expired' | 'busy' }>(tx, 'password_reset_claim', {
      p_email: email, p_grant_hash: grantHash, p_auth_token: authToken,
    }));
    if (claim.status === 'expired') return c.json({ error: RESET_EXPIRED, code: 'reset_expired' }, 410);
    if (claim.status === 'busy') return c.json({ error: 'Your password is already being updated.', code: 'reset_in_progress' }, 409);
    if (claim.status !== 'ok') return c.json({ error: 'This reset session is no longer valid. Please request a new code.', code: 'reset_invalid' }, 403);

    const r = await neonAuthReset(authToken, password);
    if (!r.ok) {
      await asOwner((tx) => rpc(tx, 'password_reset_release', { p_email: email, p_grant_hash: grantHash }));
      if (r.code === 'PASSWORD_TOO_SHORT' || r.code === 'PASSWORD_TOO_LONG') {
        return c.json({ error: 'Use 8 to 128 characters, including a letter and a number.', code: 'validation' }, 400);
      }
      throw new HttpError(502, "We couldn't update your password just now. Please try again.", 'reset_failed');
    }
    await asOwner((tx) => rpc(tx, 'password_reset_finish', { p_email: email, p_grant_hash: grantHash }));
    return c.json({ reset: true });
  });
