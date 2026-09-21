import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { Seo, useAuth, Button, Input, PageLoader, Logo, Modal, ThemeCycleButton, toast } from '@elare/ui';
import { client, STORE_URL } from '@/lib/neon';

type Mode = 'signin' | 'reset';

/** Team sign-in. There is no self-service sign-up: admin access is granted by an existing administrator. */
export default function Auth() {
  const [sp] = useSearchParams();
  const { user, profile, loading, isAdmin, signIn, signOut, resetPassword, configured } = useAuth();
  const next = sp.get('next') || '/';
  const [mode, setMode] = useState<Mode>('signin');
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when a valid account without admin rights tried to enter (here or via the layout guard).
  const [restricted, setRestricted] = useState(sp.get('restricted') === '1');

  useEffect(() => setError(null), [mode]);
  // A signed-in account that is not an active admin is ended immediately.
  useEffect(() => {
    if (user && profile && !isAdmin) {
      setRestricted(true);
      signOut();
    }
  }, [user, profile, isAdmin, signOut]);

  if (loading) return <PageLoader />;
  if (user && isAdmin) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        await signIn(form.email, form.password);
        // The effect above decides: admins are redirected, everyone else is refused.
        setForm((f) => ({ ...f, password: '' }));
      } else {
        await resetPassword(form.email);
        setMessage('If that email is registered, a reset link is on its way.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-x grid min-h-screen items-center py-12">
      <Seo title="Team sign in" noindex />
      <div className="fixed right-4 top-4 z-10"><ThemeCycleButton /></div>
      <Modal open={restricted} onClose={() => setRestricted(false)} size="sm" title={<span className="inline-flex items-center gap-2 text-danger"><ShieldAlert size={22} /> Restricted entry</span>}>
        <p className="text-sm text-ink-soft">This portal is for the Élaré team only. The account you signed in with does not have admin access, so it has been signed out.</p>
        <p className="mt-2 text-sm text-ink-soft">If you are a customer, please use the store. If you should have access, ask an administrator to grant it.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {STORE_URL && <a href={STORE_URL} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-rose hover:text-rose">Go to the store</a>}
          <Button onClick={() => setRestricted(false)}>OK</Button>
        </div>
      </Modal>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="mx-auto w-full max-w-md rounded-[28px] border border-line bg-white p-7 shadow-soft sm:p-9">
        <div className="mb-6 flex justify-center"><Logo /></div>
        {!configured && <p className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger">Not configured yet — set <code>VITE_NEON_URL</code> and <code>VITE_API_URL</code> in <code>.env.local</code>.</p>}
        <h1 className="text-center text-3xl">{mode === 'reset' ? 'Reset your password' : 'Team sign in'}</h1>
        {mode === 'signin' && <p className="mb-6 mt-1 text-center text-[13px] text-mist">Admin access is granted by an existing administrator.</p>}
        {message ? (
          <div className="mt-4 rounded-xl bg-blush/50 px-4 py-4 text-center text-sm">{message}</div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {mode === 'signin' && <Input label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
            {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger" role="alert">{error}</p>}
            <Button type="submit" variant="glow" size="lg" full loading={busy}>{mode === 'signin' ? 'Sign in' : 'Send reset link'}</Button>
          </form>
        )}
        <div className="mt-5 text-center text-[13px] text-ink-soft">
          {mode === 'signin' && <button type="button" onClick={() => setMode('reset')} className="underline-offset-4 hover:underline">Forgot your password?</button>}
          {mode === 'reset' && <button type="button" onClick={() => { setMode('signin'); setMessage(null); }} className="underline-offset-4 hover:underline">Back to sign in</button>}
        </div>
      </motion.div>
    </div>
  );
}

/** Landing page for Neon Auth emails (password reset links arrive as /auth/callback?reset=1&token=…). */
export function AuthCallback() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { completePasswordReset } = useAuth();
  const token = sp.get('token');
  const isReset = !!token || sp.get('reset') === '1';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isReset) return;
    client.auth.getSession().then(({ data }) => navigate(data.session ? sp.get('next') || '/' : '/signin', { replace: true }));
  }, [navigate, sp, isReset]);

  if (!isReset) return <PageLoader />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) { setError('This reset link is incomplete — request a new one.'); return; }
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    setBusy(true);
    setError(null);
    try {
      await completePasswordReset(token, password);
      toast({ title: 'Password updated', description: 'Sign in with your new password.', variant: 'success' });
      navigate('/signin', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-x grid min-h-screen items-center py-12">
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
