import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Seo } from '@/lib/seo';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Logo } from '@/components/layout/Navbar';
import { Tabs } from '@/components/ui/Accordion';
import { PageLoader } from '@/components/ui/Spinner';

type Mode = 'signin' | 'signup' | 'reset';

export default function Auth() {
  const [sp] = useSearchParams();
  const { user, loading, signIn, signUp, resetPassword, configured } = useAuth();
  const navigate = useNavigate();
  const next = sp.get('next') || '/account';
  const [mode, setMode] = useState<Mode>((sp.get('mode') as Mode) || 'signin');
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setError(null), [mode]);
  if (loading) return <PageLoader />;
  if (user) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        await signIn(form.email, form.password);
        navigate(next, { replace: true });
      } else if (mode === 'signup') {
        if (form.name.trim().length < 2) throw new Error('Please enter your name.');
        if (form.password.length < 8) throw new Error('Use at least 8 characters for your password.');
        const r = await signUp(form.email, form.password, form.name.trim(), form.phone.trim());
        if (r.needsConfirmation) setMessage('Check your inbox — we’ve sent a link to confirm your email.');
        else { toast({ title: 'Welcome to Élaré', variant: 'success' }); navigate(next, { replace: true }); }
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
    <div className="container-x grid min-h-[80vh] items-center py-12">
      <Seo title={mode === 'signup' ? 'Create account' : 'Sign in'} noindex />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="mx-auto w-full max-w-md rounded-[28px] border border-line bg-white p-7 shadow-soft sm:p-9">
        <div className="mb-6 flex justify-center"><Logo /></div>
        {!configured && <p className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger">Supabase isn’t configured yet — copy <code>.env.example</code> to <code>.env</code> and add your project keys.</p>}
        {mode !== 'reset' && (
          <Tabs tabs={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} value={mode as 'signin' | 'signup'} onChange={(v) => setMode(v)} className="mb-6 justify-center" />
        )}
        {mode === 'reset' && <h1 className="mb-2 text-center text-3xl">Reset your password</h1>}
        {message ? (
          <div className="rounded-xl bg-blush/50 px-4 py-4 text-center text-sm">{message}</div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && <Input label="Full name" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
            <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            {mode === 'signup' && <Input label="Mobile (optional)" autoComplete="tel" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
            {mode !== 'reset' && <Input label="Password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : undefined} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint={mode === 'signup' ? 'At least 8 characters.' : undefined} />}
            {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger" role="alert">{error}</p>}
            <Button type="submit" variant="glow" size="lg" full loading={busy}>
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create my account' : 'Send reset link'}
            </Button>
          </form>
        )}
        <div className="mt-5 text-center text-[13px] text-ink-soft">
          {mode === 'signin' && <button type="button" onClick={() => setMode('reset')} className="underline-offset-4 hover:underline">Forgot your password?</button>}
          {mode === 'reset' && <button type="button" onClick={() => { setMode('signin'); setMessage(null); }} className="underline-offset-4 hover:underline">Back to sign in</button>}
          {mode === 'signup' && <p>By creating an account you agree to our <Link to="/pages/terms" className="underline">terms</Link> and <Link to="/pages/privacy" className="underline">privacy policy</Link>.</p>}
        </div>
      </motion.div>
    </div>
  );
}

/** Handles the email confirmation / password recovery redirect from Supabase. */
export function AuthCallback() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Signing you in…');
  useEffect(() => {
    const next = sp.get('next') || '/account';
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') navigate('/account/profile?reset=1', { replace: true });
      else if (event === 'SIGNED_IN') navigate(next, { replace: true });
    });
    supabase.auth.getSession().then(({ data: s }) => { if (s.session) navigate(next, { replace: true }); else setStatus('Waiting for confirmation…'); });
    const t = setTimeout(() => navigate('/auth', { replace: true }), 8000);
    return () => { data.subscription.unsubscribe(); clearTimeout(t); };
  }, [navigate, sp]);
  return <div className="grid min-h-[60vh] place-items-center text-sm text-mist">{status}</div>;
}
