import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Seo, useAuth, Button, Input, Tabs, PageLoader, EmailUnverifiedError } from '@elare/ui';
import { passwordProblem } from '@elare/utils';
import { toast } from '@/lib/ui-store';
import { client } from '@/lib/neon';
import { CREATE_ACCOUNT, SIGN_IN } from '@/lib/routes';
import { Logo } from '@/components/layout/Navbar';
import { EmailVerification } from './EmailVerification';
import { ForgotPassword } from './ForgotPassword';

type Mode = 'signin' | 'signup' | 'reset' | 'verify';

/** /signin and /signup share this page; the tab switch changes the URL. */
export default function Auth({ initialMode = 'signin' }: { initialMode?: 'signin' | 'signup' }) {
  const [sp] = useSearchParams();
  const { user, loading, signIn, signUp, configured } = useAuth();
  const navigate = useNavigate();
  const next = sp.get('next') || '/';
  const [mode, setModeState] = useState<Mode>(initialMode);
  const search = sp.get('next') ? `?next=${encodeURIComponent(sp.get('next')!)}` : '';
  const setMode = (m: Mode) => {
    setModeState(m);
    if (m !== 'reset') navigate(`${m === 'signup' ? CREATE_ACCOUNT : SIGN_IN}${search}`, { replace: true });
  };
  useEffect(() => setModeState(initialMode), [initialMode]);
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The account awaiting its email code. Held in memory only, to sign in once verified.
  const [pending, setPending] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => { setError(null); if (mode !== 'signin') setNotice(null); }, [mode]);
  if (loading) return <PageLoader />;
  if (user) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        try {
          await signIn(form.email, form.password);
          navigate(next, { replace: true });
        } catch (err) {
          // Right password, but the email was never verified: finish that first.
          if (!(err instanceof EmailUnverifiedError)) throw err;
          setPending({ email: err.email || form.email.trim(), password: form.password });
          setModeState('verify');
        }
      } else if (mode === 'signup') {
        if (form.name.trim().length < 2) throw new Error('Please enter your name.');
        const weak = passwordProblem(form.password);
        if (weak) throw new Error(weak);
        const r = await signUp(form.email, form.password, form.name.trim(), form.phone.trim());
        if (r.needsConfirmation) setMessage('Check your inbox — we’ve sent a link to confirm your email.');
        else {
          // Account created (unverified): next, the 4-digit code sent to this address.
          setPending({ email: form.email.trim().toLowerCase(), password: form.password });
          setModeState('verify');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onVerified = async () => {
    if (!pending) return;
    try {
      await signIn(pending.email, pending.password);
      toast({ title: 'Welcome to Élaré', description: 'Your email is verified and you’re signed in.', variant: 'success' });
      navigate(next, { replace: true });
    } catch {
      // Verified, but the automatic sign-in didn't go through: sign in by hand.
      setForm((f) => ({ ...f, email: pending.email, password: '' }));
      setNotice('Your email is verified. Sign in to continue.');
      setMode('signin');
    } finally {
      setPending(null);
    }
  };

  const leaveVerify = () => {
    setPending(null);
    setForm((f) => ({ ...f, password: '' }));
    setMode('signup');
  };

  return (
    <div className="container-x grid min-h-[80vh] items-center py-12">
      <Seo title={mode === 'verify' ? 'Verify your email' : mode === 'reset' ? 'Forgot password' : mode === 'signup' ? 'Create account' : 'Sign in'} noindex />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="mx-auto w-full max-w-md rounded-[28px] border border-line bg-white p-7 shadow-soft sm:p-9">
        <div className="mb-6 flex justify-center"><Logo size="lg" /></div>
        <AnimatePresence mode="wait" initial={false}>
        {mode === 'reset' ? (
          <motion.div key="reset" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            <ForgotPassword
              initialEmail={form.email}
              onBack={(email) => { setForm((f) => ({ ...f, email, password: '' })); setMode('signin'); }}
              onDone={(email) => {
                setForm((f) => ({ ...f, email, password: '' }));
                setMode('signin');
                setNotice('Your password has been changed. Sign in with your new password.');
              }}
            />
          </motion.div>
        ) : mode === 'verify' && pending ? (
          <motion.div key="verify" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            <EmailVerification email={pending.email} onVerified={onVerified} onBack={leaveVerify} />
          </motion.div>
        ) : (
        <motion.div key="form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
        {!configured && <p className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger">Not configured yet — copy <code>.env.example</code> to <code>.env.local</code> and set <code>VITE_NEON_URL</code> and <code>VITE_API_URL</code>.</p>}
        <Tabs tabs={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} value={mode as 'signin' | 'signup'} onChange={(v) => setMode(v)} className="mb-6 justify-center" />
        {message ? (
          <div className="rounded-xl bg-blush/50 px-4 py-4 text-center text-sm">{message}</div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {notice && <p className="rounded-xl bg-success/10 px-4 py-3 text-[13px] text-success" role="status">{notice}</p>}
            {mode === 'signup' && <Input label="Full name" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
            <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {mode === 'signup' && <Input label="Mobile (optional)" autoComplete="tel" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
            <Input label="Password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : undefined} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint={mode === 'signup' ? 'At least 8 characters, with a letter and a number.' : undefined} />
            {mode === 'signin' && (
              <div className="-mt-1 flex justify-end">
                <button type="button" onClick={() => setMode('reset')} className="rounded text-[13px] font-medium text-rose underline-offset-4 transition-colors hover:text-rose-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink/60">
                  Forgot Password?
                </button>
              </div>
            )}
            {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger" role="alert">{error}</p>}
            <Button type="submit" variant="glow" size="lg" full loading={busy}>
              {mode === 'signin' ? 'Sign in' : 'Create my account'}
            </Button>
          </form>
        )}
        <div className="mt-5 text-center text-[13px] text-ink-soft">
          {mode === 'signup' && <p>By creating an account you agree to our <Link to="/pages/terms" className="underline">terms</Link> and <Link to="/pages/privacy" className="underline">privacy policy</Link>.</p>}
        </div>
        </motion.div>
        )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/**
 * Landing page for Neon Auth emails. A password-reset link arrives as
 * /auth/callback?reset=1&token=…; email-verification links simply return here
 * with a live session.
 */
export function AuthCallback() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { completePasswordReset } = useAuth();
  const token = sp.get('token');
  const isReset = !!token || sp.get('reset') === '1';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Signing you in…');

  useEffect(() => {
    if (isReset) return;
    const next = sp.get('next') || '/';
    client.auth.getSession().then(({ data }) => {
      if (data.session) navigate(next, { replace: true });
      else setStatus('Waiting for confirmation…');
    });
    const t = setTimeout(() => navigate(SIGN_IN, { replace: true }), 8000);
    return () => clearTimeout(t);
  }, [navigate, sp, isReset]);

  if (!isReset) return <div className="grid min-h-[60vh] place-items-center text-sm text-mist">{status}</div>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) { setError('This reset link is incomplete — request a new one.'); return; }
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    setBusy(true);
    setError(null);
    try {
      await completePasswordReset(token, password);
      toast({ title: 'Password updated', description: 'Sign in with your new password.', variant: 'success' });
      navigate(SIGN_IN, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-x grid min-h-[70vh] items-center py-12">
      <Seo title="Reset password" noindex />
      <form onSubmit={submit} className="mx-auto w-full max-w-md space-y-4 rounded-[28px] border border-line bg-white p-8 shadow-soft">
        <div className="mb-2 flex justify-center"><Logo /></div>
        <h1 className="text-center text-3xl">Choose a new password</h1>
        <Input label="New password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." />
        {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger" role="alert">{error}</p>}
        <Button type="submit" variant="glow" size="lg" full loading={busy}>Save password</Button>
      </form>
    </div>
  );
}
