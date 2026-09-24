import { Hono } from 'hono';
import { signupOtpSendSchema, signupOtpVerifySchema } from '@elare/validation';
import { body, HttpError } from '../../lib/http';
import { asOwner, rpc } from '../../lib/db';
import { clientIp, limit } from '../../lib/rate-limit';
import { sendVerificationCode } from '../../emails';
import { OTP, hashCode, issueRefusal, newCode, tooMany, type IssueStatus, type VerifyStatus } from './otp';
import type { Env } from '../../middleware';

/**
 * Sign-up email verification (4-digit code, see ./otp).
 *
 * Neon Auth creates the account from the browser; it stays unverified until
 * the customer proves they own the address here. Both endpoints are public —
 * the customer isn't signed in yet — and take only { email } / { email, otp }.
 * Unknown or already-verified emails get the same "sent" answer, so the
 * endpoint can't be used to discover who has an account.
 */
export { OTP };

export const signupOtpRouter = new Hono<Env>()
  .post('/send-email-otp', async (c) => {
    const { email } = await body(c, signupOtpSendSchema);
    const wait = limit(`otp-send:${clientIp(c)}`, 10, 10 * 60_000);
    if (wait) return tooMany('Too many requests. Please try again shortly.', wait);

    const code = newCode();
    const r = await asOwner((tx) => rpc<{ status: IssueStatus; retry_after?: number }>(tx, 'email_otp_issue', {
      p_email: email, p_code_hash: hashCode(email, code), p_ttl_seconds: OTP.ttlSeconds, p_cooldown_seconds: OTP.cooldownSeconds, p_max_per_hour: OTP.maxSendsPerHour,
    }));
    const refused = issueRefusal(r);
    if (refused) return refused;
    if (r.status === 'sent' && !(await sendVerificationCode(email, code, OTP.ttlSeconds / 60))) {
      throw new HttpError(502, "We couldn't send the email just now. Please try again in a moment.", 'send_failed');
    }
    return c.json({ sent: true, resend_in: OTP.cooldownSeconds, expires_in: OTP.ttlSeconds });
  })

  .post('/verify-email-otp', async (c) => {
    const { email, otp } = await body(c, signupOtpVerifySchema);
    const wait = limit(`otp-verify:${clientIp(c)}`, 30, 10 * 60_000);
    if (wait) return tooMany('Too many attempts. Please try again shortly.', wait);

    const r = await asOwner((tx) => rpc<{ status: VerifyStatus; attempts_left?: number }>(tx, 'email_otp_verify', {
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
