import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { fadeUp, stagger, viewportOnce } from '@/lib/motion';
import { useStoreConfig } from '@/hooks/useStore';
import { Logo } from './Navbar';
import { Spinner } from '@/components/ui/Spinner';

export function Newsletter() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setState('error'); setMessage('Please enter a valid email address.'); return; }
    setState('loading');
    try {
      const r = await api.subscribe(email, 'home-newsletter');
      setState(r.status === 'subscribed' ? 'success' : 'duplicate');
      setMessage(r.status === 'subscribed' ? 'Welcome to the Circle. Your first-order code is on its way.' : 'You’re already part of the Circle — we’ll be in touch soon.');
    } catch (err) {
      setState('error');
      setMessage((err as Error).message);
    }
  };

  return (
    <section className="container-x py-20 lg:py-28" aria-labelledby="newsletter-heading">
      <motion.div variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={viewportOnce} className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#f8dde5_0%,#fff9fa_55%,#ecdcc0_100%)] px-6 py-14 text-center sm:px-12 lg:py-20">
        <div className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-pink/25 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-champagne/40 blur-3xl" aria-hidden="true" />
        <motion.p variants={fadeUp} className="eyebrow">The Élaré Circle</motion.p>
        <motion.h2 id="newsletter-heading" variants={fadeUp} custom={1} className="mx-auto mt-3 max-w-xl text-[2.4rem] leading-[1.05] sm:text-[3rem]">Join the Élaré Circle.</motion.h2>
        <motion.p variants={fadeUp} custom={2} className="mx-auto mt-4 max-w-md text-[15px] text-ink-soft">Early access to new shades, members-only edits and a welcome offer on your first order.</motion.p>
        <motion.form variants={fadeUp} custom={3} onSubmit={submit} className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row" aria-live="polite">
          {state === 'success' || state === 'duplicate' ? (
            <p className="flex w-full items-center justify-center gap-2 rounded-full bg-white/80 px-5 py-3.5 text-sm font-medium text-ink"><Check size={16} className="text-success" /> {message}</p>
          ) : (
            <>
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <input id="newsletter-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" className="h-[52px] flex-1 rounded-full border border-white bg-white/85 px-5 text-[15px] outline-none placeholder:text-mist focus:border-rose" />
              <button type="submit" disabled={state === 'loading'} className="btn-glow h-[52px] rounded-[14px] px-6 text-sm">
                <span className="flex items-center gap-2">{state === 'loading' ? <Spinner className="h-4 w-4" /> : <ArrowRight size={16} />} Join</span>
              </button>
            </>
          )}
        </motion.form>
        {state === 'error' && <p className="mt-3 text-sm text-danger" role="alert">{message}</p>}
        <p className="mt-4 text-[11.5px] text-mist">No spam. Unsubscribe at any time.</p>
      </motion.div>
    </section>
  );
}

export function Footer() {
  const { config } = useStoreConfig();
  return (
    <footer className="border-t border-line bg-white">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-ink-soft">Refined makeup designed to complement every complexion, mood and moment. Cruelty-free, dermatologically tested, made with intention.</p>
        </div>
        <div>
          <p className="eyebrow mb-4">Shop</p>
          <ul className="space-y-2.5 text-[14px] text-ink-soft">
            {config.categories.map((c) => <li key={c.id}><Link to={`/category/${c.slug}`} className="hover:text-rose">{c.name}</Link></li>)}
            <li><Link to="/best-sellers" className="hover:text-rose">Best sellers</Link></li>
            <li><Link to="/category/lips/signature-lip-collection" className="hover:text-rose">Signature Lip Edit</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">Account</p>
          <ul className="space-y-2.5 text-[14px] text-ink-soft">
            <li><Link to="/account/orders" className="hover:text-rose">Track an order</Link></li>
            <li><Link to="/account/loyalty" className="hover:text-rose">Élaré points</Link></li>
            <li><Link to="/account/wishlist" className="hover:text-rose">Wishlist</Link></li>
            <li><Link to="/account/coupons" className="hover:text-rose">Offers & coupons</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">Help</p>
          <ul className="space-y-2.5 text-[14px] text-ink-soft">
            <li><Link to="/pages/shipping" className="hover:text-rose">Shipping & delivery</Link></li>
            <li><Link to="/pages/returns" className="hover:text-rose">Returns & refunds</Link></li>
            <li><Link to="/pages/privacy" className="hover:text-rose">Privacy</Link></li>
            <li><Link to="/pages/terms" className="hover:text-rose">Terms</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-5 text-[12px] text-mist sm:flex-row">
          <p>© {new Date().getFullYear()} Élaré Beauty. All rights reserved.</p>
          <p>Prices in INR, inclusive of taxes · Ships across India</p>
        </div>
      </div>
    </footer>
  );
}
