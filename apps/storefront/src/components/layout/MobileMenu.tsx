import { Link, NavLink, useNavigate } from 'react-router-dom';
import { SIGN_IN, CREATE_ACCOUNT } from '@/lib/routes';
import { motion } from 'framer-motion';
import { ChevronRight, Heart, LogOut, User } from 'lucide-react';
import { useAuth, Drawer, stagger, fadeUp, InstallButton } from '@elare/ui';
import { ADMIN_URL } from '@/lib/neon';
import { useUi } from '@/lib/ui-store';
import { useStoreConfig } from '@/lib/hooks';
import { NAV_LINKS, Logo } from './Navbar';

export function MobileMenu() {
  const open = useUi((s) => s.menuOpen);
  const setMenu = useUi((s) => s.setMenu);
  const { user, profile, signOut, isAdmin } = useAuth();
  const { config } = useStoreConfig();
  const navigate = useNavigate();
  const close = () => setMenu(false);

  return (
    <Drawer open={open} onClose={close} side="left" title={<Logo />} width="max-w-sm">
      <motion.nav variants={stagger(0.05, 0.1)} initial="hidden" animate="show" aria-label="Mobile" className="space-y-1">
        {NAV_LINKS.map((l, i) => (
          <motion.div key={l.to} variants={fadeUp} custom={i}>
            <NavLink to={l.to} end={l.end} onClick={close} className={({ isActive }) => `flex items-center justify-between rounded-xl px-3 py-3 font-display text-[1.6rem] leading-none ${isActive ? 'bg-blush/60 text-rose-deep' : 'text-ink'}`}>
              {l.label}
              <ChevronRight size={18} className="text-mist" />
            </NavLink>
          </motion.div>
        ))}
      </motion.nav>

      <div className="mt-8 border-t border-line pt-6">
        <p className="eyebrow mb-3">Explore</p>
        <div className="grid grid-cols-2 gap-2">
          {config.categories.flatMap((c) => c.subcategories.slice(0, 3).map((s) => (
            <Link key={s.id} to={`/category/${c.slug}/${s.slug}`} onClick={close} className="rounded-lg px-2 py-1.5 text-[13px] text-ink-soft hover:bg-blush/50">
              {s.name}
            </Link>
          )))}
        </div>
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <InstallButton appName="Élaré Beauty" className="mb-4 border border-line" />
        {user ? (
          <div className="space-y-2">
            <p className="text-sm text-ink-soft">Signed in as <span className="font-semibold text-ink">{profile?.full_name || user.email}</span></p>
            <Link to="/account" onClick={close} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-blush/50"><User size={16} /> My account</Link>
            <Link to="/account/wishlist" onClick={close} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-blush/50"><Heart size={16} /> Wishlist</Link>
            {isAdmin && ADMIN_URL && <a href={ADMIN_URL} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose hover:bg-blush/50">Admin dashboard</a>}
            <button type="button" onClick={async () => { close(); navigate('/'); await signOut(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-blush/50"><LogOut size={16} /> Sign out</button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Link to={SIGN_IN} onClick={close} className="flex h-11 flex-1 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">Sign in</Link>
            <Link to={CREATE_ACCOUNT} onClick={close} className="flex h-11 flex-1 items-center justify-center rounded-full border border-ink text-sm font-semibold">Join</Link>
          </div>
        )}
      </div>
    </Drawer>
  );
}
