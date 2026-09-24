import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { OtpCode, Spinner, type OtpVisual } from '@elare/ui';
import { cn } from '@elare/utils';
import { maskEmail, useEmailOtp, type OtpPurpose, type OtpStatus } from './useEmailOtp';

const SUCCESS = '#5F9F72';
const ERROR = '#C85C6B';

const COPY: Record<OtpPurpose, { code: string; lead: string; verified: string; back: string }> = {
  signup: { code: '4-digit code', lead: 'Enter it below to continue.', verified: 'Email verified', back: 'Use a different email' },
  reset: { code: '4-digit verification code', lead: 'Enter it below to reset your password.', verified: 'Code verified', back: 'Use a different email' },
};

interface Props {
  email: string;
  /** Called with the server's answer for the verified code (the reset grant, for forgot password). */
  onVerified: (result: unknown) => Promise<void> | void;
  onBack: () => void;
  purpose?: OtpPurpose;
  /** The code was already sent (seconds until resend); don't send another on open. */
  alreadySent?: number;
}

/**
 * The "Verify your email" step — of sign-up (and of sign-in for an account
 * that never finished it), and of forgot password. Presentation only — the
 * logic is in useEmailOtp and the animation in <OtpCode>. Sign-up waits for
 * "Continue"; forgot password moves on by itself once the code is confirmed.
 */
export function EmailVerification({ email, onVerified, onBack, purpose = 'signup', alreadySent }: Props) {
  const otp = useEmailOtp(email, purpose, alreadySent);
  const statusId = useId();
  const [continuing, setContinuing] = useState(false);
  const { status } = otp;
  const copy = COPY[purpose];
  const moved = useRef(false);

  const visual: OtpVisual = status === 'success' ? 'success' : status === 'verifying' ? 'verifying' : 'entry';
  const busy = status === 'verifying' || status === 'sending';
  const canVerify = /^\d{4}$/.test(otp.code) && !busy && status !== 'success';

  const proceed = async () => {
    if (moved.current) return;
    moved.current = true;
    setContinuing(true);
    try { await onVerified(otp.result); } finally { setContinuing(false); moved.current = false; }
  };

  // Forgot password: let the check land, then continue to the new-password form.
  useEffect(() => {
    if (purpose !== 'reset' || status !== 'success') return;
    const t = setTimeout(() => void proceed(), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose, status]);

  return (
    <div className="text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose">Almost there</p>
      <h1 className="mt-2 text-[2rem] leading-tight sm:text-[2.3rem]">Verify your email</h1>
      <p className="mx-auto mt-3 max-w-[20rem] text-[14.5px] leading-relaxed text-ink-soft">
        We’ve sent a {copy.code} to <span className="font-semibold text-ink">{maskEmail(email)}</span>. {copy.lead}
      </p>

      <OtpCode
        className="mt-3"
        value={otp.code}
        onChange={otp.onCodeChange}
        onComplete={otp.verify}
        visual={visual}
        errorKey={otp.errorKey}
        disabled={status === 'sending'}
        autoFocus
        describedBy={statusId}
      />

      {/* One live region for every state, with a fixed height so nothing jumps. */}
      <div id={statusId} className="flex min-h-[3.25rem] flex-col items-center justify-center px-2" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <StatusLine key={status + (otp.message?.text ?? '')} status={status} message={otp.message?.text} tone={otp.message?.tone} verified={copy.verified} />
        </AnimatePresence>
      </div>

      {status === 'success' ? (
        <PillButton onClick={() => void proceed()} loading={continuing} loadingLabel={purpose === 'reset' ? 'Continuing…' : 'Signing you in…'}>Continue</PillButton>
      ) : status === 'network-error' ? (
        <PillButton onClick={() => void otp.retry()}>Try again</PillButton>
      ) : (
        <PillButton onClick={() => void otp.verify(otp.code)} disabled={!canVerify} loading={status === 'verifying'} loadingLabel="Verifying…">Verify Email</PillButton>
      )}

      {status !== 'success' && (
        <div className="mt-5 text-[13px] text-ink-soft">
          <p>Didn’t receive the code?</p>
          {status === 'resending' ? (
            <p className="mt-1 inline-flex items-center gap-2 font-semibold text-rose"><Spinner className="h-3.5 w-3.5" /> Sending a new code…</p>
          ) : otp.resendIn > 0 ? (
            <p className="mt-1 text-mist" aria-live="off">Resend available in <span className="tabular-nums">{otp.resendIn}s</span></p>
          ) : (
            <button type="button" onClick={() => void otp.resend()} disabled={busy} className="mt-1 font-semibold text-rose underline-offset-4 transition-colors hover:text-rose-deep hover:underline disabled:opacity-50">Resend code</button>
          )}
          <p className="mt-3 text-[12px] text-mist">Check your spam folder too. <button type="button" onClick={onBack} className="font-semibold text-ink-soft underline-offset-4 hover:underline">{copy.back}</button></p>
        </div>
      )}
    </div>
  );
}

function StatusLine({ status, message, tone, verified }: { status: OtpStatus; message?: string; tone?: 'info' | 'error' | 'success'; verified: string }) {
  const base = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.2 } };
  if (status === 'success') {
    return (
      <motion.p {...base} className="text-[15px] font-semibold" style={{ color: SUCCESS }} role="status">
        <span aria-hidden="true">✓ </span>{verified}
      </motion.p>
    );
  }
  if (status === 'verifying') return <motion.p {...base} className="text-[13.5px] font-medium text-rose" role="status">Verifying…</motion.p>;
  if (status === 'sending') return <motion.p {...base} className="inline-flex items-center gap-2 text-[13.5px] text-mist" role="status"><Spinner className="h-3.5 w-3.5" /> Sending your code…</motion.p>;
  if (message) {
    return (
      <motion.p {...base} className={cn('max-w-[20rem] text-[13.5px] leading-snug', tone === 'error' ? 'font-medium' : tone === 'success' ? 'text-ink-soft' : 'text-mist')} style={tone === 'error' ? { color: ERROR } : undefined} role={tone === 'error' ? 'alert' : 'status'}>
        {message}
      </motion.p>
    );
  }
  return <motion.span {...base} className="text-[12.5px] text-mist">The code expires in 10 minutes.</motion.span>;
}

function PillButton({ children, onClick, disabled, loading, loadingLabel }: { children: string; onClick: () => void; disabled?: boolean; loading?: boolean; loadingLabel?: string }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      whileHover={disabled || loading ? undefined : { y: -1.5 }}
      whileTap={disabled || loading ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      aria-busy={loading || undefined}
      className="mx-auto mt-2 inline-flex h-12 w-full max-w-[20rem] items-center justify-center gap-2 rounded-full bg-rose px-8 text-[14.5px] font-semibold tracking-[0.02em] text-white shadow-[0_10px_24px_-14px_rgba(184,92,120,0.75)] transition-[background-color,box-shadow,opacity] duration-200 hover:bg-rose-deep hover:shadow-[0_16px_30px_-16px_rgba(184,92,120,0.8)] disabled:cursor-not-allowed disabled:bg-[#E8A7B8] disabled:opacity-70 disabled:shadow-none"
    >
      {loading && <Spinner className="h-4 w-4" />}
      {loading ? loadingLabel : children}
    </motion.button>
  );
}
