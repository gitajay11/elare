import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Input, PasswordInput, SuccessMark } from '@elare/ui';
import { ApiError, cn, looksLikeEmail, passwordProblem, PASSWORD_MAX, PASSWORD_RULES } from '@elare/utils';
import { api } from '@/lib/api';
import { EmailVerification } from './EmailVerification';

/**
 * Forgot password, inside the sign-in card:
 *
 *   email → 4-digit code (the sign-up verification screen, same animation)
 *         → new password → "Password updated" → back to sign in
 *
 * The server owns every rule (who has an account, the code, its limits, the
 * reset grant, the password change). The grant the code earns and the new
 * password live only in this component's memory and are dropped as soon as
 * the password is changed or the customer leaves.
 */
type Step = 'email' | 'code' | 'password' | 'done';

const REDIRECT_MS = 1800;
const OFFLINE = 'We couldn’t reach Élaré. Check your connection and try again.';
const offline = (e: unknown) => !(e instanceof ApiError) || e.status === 0;
const minutes = (s: number) => Math.max(1, Math.ceil(s / 60));

const swap = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } } as const;

export function ForgotPassword({ initialEmail, onBack, onDone }: {
  initialEmail: string;
  /** Back to sign in (with the email typed so far). */
  onBack: (email: string) => void;
  /** Password changed: sign in with it. */
  onDone: (email: string) => void;
}) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail);
  const [address, setAddress] = useState('');        // the normalised email the code went to
  const [resendIn, setResendIn] = useState(0);
  const [grant, setGrant] = useState<string | null>(null);
  const [restartNote, setRestartNote] = useState<string | null>(null);

  const restart = (why?: string) => { setGrant(null); setStep('email'); setRestartNote(why ?? null); };

  // On a phone the page is often scrolled down to the form: bring each new step's top back into view.
  const top = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 80) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [step]);

  return (
    <div ref={top} className="scroll-mt-28">
    <AnimatePresence mode="wait" initial={false}>
      {step === 'email' && (
        <motion.div key="email" {...swap}>
          <EmailStep
            email={email}
            setEmail={setEmail}
            note={restartNote}
            onSent={(normalised, wait) => { setAddress(normalised); setResendIn(wait); setRestartNote(null); setStep('code'); }}
            onBack={() => onBack(email)}
          />
        </motion.div>
      )}
      {step === 'code' && (
        <motion.div key="code" {...swap}>
          <EmailVerification
            purpose="reset"
            email={address}
            alreadySent={resendIn}
            onVerified={(r) => {
              const token = (r as { reset_token?: string } | null)?.reset_token;
              if (!token) { restart('Something went wrong. Please request a new code.'); return; }
              setGrant(token);
              setStep('password');
            }}
            onBack={() => restart()}
          />
        </motion.div>
      )}
      {step === 'password' && grant && (
        <motion.div key="password" {...swap}>
          <PasswordStep
            email={address}
            grant={grant}
            onChanged={() => { setGrant(null); setStep('done'); }}
            onRestart={restart}
          />
        </motion.div>
      )}
      {step === 'done' && (
        <motion.div key="done" {...swap}>
          <DoneStep onContinue={() => onDone(address)} />
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}

/** Moves focus to a step's heading when it opens, so screen readers follow along. */
function useStepFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return ref;
}

function Header({ eyebrow, title, children, headingRef }: { eyebrow: string; title: string; children: ReactNode; headingRef?: Ref<HTMLHeadingElement> }) {
  return (
    <div className="text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose">{eyebrow}</p>
      <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-[2rem] leading-tight outline-none sm:text-[2.3rem]">{title}</h1>
      <p className="mx-auto mt-3 max-w-[21rem] text-[14.5px] leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-danger/10 px-4 py-3 text-[13px] leading-snug text-danger" role="alert">
      {children}
    </motion.p>
  );
}

function TextLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded text-[13px] font-medium text-ink-soft underline-offset-4 transition-colors hover:text-rose-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink/60">
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// 1. Email
// ---------------------------------------------------------------------------
function EmailStep({ email, setEmail, note, onSent, onBack }: {
  email: string;
  setEmail: (v: string) => void;
  note: string | null;
  onSent: (normalised: string, resendIn: number) => void;
  onBack: () => void;
}) {
  const heading = useStepFocus<HTMLHeadingElement>();
  const input = useRef<HTMLInputElement>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(note);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const address = email.trim().toLowerCase();
    if (!looksLikeEmail(address)) {
      // Obviously invalid: no request.
      setFieldError('Please enter a valid email address.');
      input.current?.focus();
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      const r = await api.forgotPassword(address);
      onSent(address, r.resend_in);
    } catch (err) {
      if (offline(err)) setError(OFFLINE);
      else if (err instanceof ApiError && err.code === 'cooldown') {
        // A code went out moments ago and still works — go and enter it.
        onSent(address, Number(err.details.retry_after) || 30);
      } else if (err instanceof ApiError && err.status === 429) {
        setError(`Too many codes requested. Please try again in ${minutes(Number(err.details.retry_after) || 600)} min.`);
      } else setError((err as Error).message || 'We couldn’t send your code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header eyebrow="Account help" title="Forgot your password?" headingRef={heading}>
        Enter your registered email address and we’ll send you a verification code to reset your password.
      </Header>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <Input
          ref={input}
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => { setEmail(e.target.value); setFieldError(null); setError(null); }}
          error={fieldError}
        />
        <AnimatePresence initial={false}>{error && <Alert key={error}>{error}</Alert>}</AnimatePresence>
        <Button type="submit" variant="glow" size="lg" full loading={busy} className="max-sm:px-4">
          {busy ? 'Sending code…' : 'Send Verification Code'}
        </Button>
      </form>
      <div className="mt-5 text-center">
        <TextLink onClick={onBack}><span aria-hidden="true">← </span>Back to Login</TextLink>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. New password
// ---------------------------------------------------------------------------
const STRENGTH = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;
const BAR = ['#F3DCE3', '#F8DDE5', '#E8A7B8', '#D98AA1', '#B85C78'];

function strength(p: string): number {
  if (!p) return 0;
  if (passwordProblem(p)) return 1;
  let s = 2;
  if (p.length >= 12) s++;
  if ((/[a-z]/.test(p) && /[A-Z]/.test(p)) || /[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}

function PasswordStep({ email, grant, onChanged, onRestart }: {
  email: string;
  grant: string;
  onChanged: () => void;
  onRestart: (why?: string) => void;
}) {
  const rulesId = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState<{ text: string; restart?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const problem = passwordProblem(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = !problem && confirm.length > 0 && !mismatch;
  const score = strength(password);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setConfirmTouched(true);
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword({ email, reset_token: grant, password, confirm_password: confirm });
      // Done with them: nothing sensitive stays in memory.
      setPassword('');
      setConfirm('');
      onChanged();
    } catch (err) {
      if (offline(err)) setError({ text: OFFLINE });
      else if (err instanceof ApiError && (err.code === 'reset_expired' || err.code === 'reset_invalid')) setError({ text: err.message, restart: true });
      else setError({ text: (err as Error).message || 'We couldn’t update your password. Please try again.' });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div>
      <Header eyebrow="Almost done" title="Create a new password">
        Choose a new password for your Élaré Beauty account.
      </Header>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        {/* Lets password managers file the new password under the right account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <div>
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            autoFocus
            maxLength={PASSWORD_MAX}
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            aria-describedby={rulesId}
          />
          <StrengthMeter score={score} show={password.length > 0} />
          <ul id={rulesId} className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Password requirements">
            {PASSWORD_RULES.map((r) => {
              const met = r.test(password);
              return (
                <li key={r.id} className={cn('flex items-center gap-2 text-[12.5px] transition-colors duration-200', met ? 'text-rose-deep' : 'text-mist')}>
                  <span aria-hidden="true" className={cn('grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors duration-200', met ? 'border-rose-deep bg-rose-deep text-white' : 'border-line bg-white')}>
                    {met && <svg width="9" height="9" viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                  <span>{r.label}<span className="sr-only">{met ? ' — met' : ' — not met yet'}</span></span>
                </li>
              );
            })}
          </ul>
        </div>
        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(null); }}
          onBlur={() => setConfirmTouched(true)}
          error={(confirmTouched || confirm.length >= password.length) && mismatch ? 'Passwords do not match.' : confirmTouched && !confirm && password ? 'Confirm your new password.' : undefined}
        />
        <AnimatePresence initial={false}>
          {error && (
            <Alert key={error.text}>
              {error.text}
              {error.restart && (
                <> <button type="button" onClick={() => onRestart()} className="font-semibold underline underline-offset-2">Request a new code</button></>
              )}
            </Alert>
          )}
        </AnimatePresence>
        <Button type="submit" variant="glow" size="lg" full loading={busy} disabled={!valid || busy} className="max-sm:px-4">
          {busy ? 'Updating password…' : 'Reset Password'}
        </Button>
      </form>
    </div>
  );
}

function StrengthMeter({ score, show }: { score: number; show: boolean }) {
  return (
    <div className={cn('mt-3 flex items-center gap-3 transition-opacity duration-200', show ? 'opacity-100' : 'opacity-0')} aria-hidden={!show}>
      <div className="flex flex-1 gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F6E8EC]">
            <motion.span
              className="block h-full rounded-full"
              initial={false}
              animate={{ scaleX: score >= i ? 1 : 0, backgroundColor: BAR[score] }}
              style={{ originX: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
        ))}
      </div>
      <span className="min-w-[4.5rem] text-right text-[12px] font-medium text-ink-soft" aria-live="polite">
        {show && <><span className="sr-only">Password strength: </span>{STRENGTH[score]}</>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Done
// ---------------------------------------------------------------------------
function DoneStep({ onContinue }: { onContinue: () => void }) {
  const heading = useStepFocus<HTMLHeadingElement>();
  const went = useRef(false);
  const go = () => { if (!went.current) { went.current = true; onContinue(); } };
  useEffect(() => {
    const t = setTimeout(go, REDIRECT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="text-center" role="status">
      <SuccessMark className="mb-6 mt-2" />
      <h1 ref={heading} tabIndex={-1} className="text-[1.9rem] leading-tight outline-none sm:text-[2.2rem]">Password updated successfully</h1>
      <p className="mx-auto mt-3 max-w-[20rem] text-[14.5px] leading-relaxed text-ink-soft">
        Your password has been changed. You can now log in with your new password.
      </p>
      <div className="mx-auto mt-6 max-w-[20rem]">
        <Button type="button" variant="glow" size="lg" full onClick={go} className="max-sm:px-4">Continue to Login</Button>
      </div>
      <p className="mt-3 text-[12px] text-mist">Taking you to sign in…</p>
    </div>
  );
}
