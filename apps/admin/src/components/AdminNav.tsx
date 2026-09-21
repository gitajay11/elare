import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3, Boxes, ExternalLink, Gift, LayoutDashboard, LogOut, Package, Settings, ShoppingBag, Sparkles, Star, Tag, Tags, Users, X, type LucideIcon,
} from 'lucide-react';
import { InstallButton, Logo, ThemeToggle } from '@elare/ui';
import { cn } from '@elare/utils';
import { adminApi } from '@/lib/api';
import { STORE_URL } from '@/lib/neon';

type Item = { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: 'pending_orders' | 'low_stock' | 'pending_reviews' };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  { title: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  ] },
  { title: 'Catalogue', items: [
    { to: '/products', label: 'Products', icon: Package },
    { to: '/categories', label: 'Categories', icon: Tags },
    { to: '/inventory', label: 'Inventory', icon: Boxes, badge: 'low_stock' },
  ] },
  { title: 'Sales', items: [
    { to: '/orders', label: 'Orders', icon: ShoppingBag, badge: 'pending_orders' },
    { to: '/customers', label: 'Customers', icon: Users },
    { to: '/reviews', label: 'Reviews', icon: Star, badge: 'pending_reviews' },
  ] },
  { title: 'Marketing', items: [
    { to: '/coupons', label: 'Coupons', icon: Tag },
    { to: '/gifts', label: 'Free gifts', icon: Gift },
    { to: '/loyalty', label: 'Loyalty', icon: Sparkles },
  ] },
  { title: 'System', items: [
    { to: '/settings', label: 'Settings', icon: Settings },
  ] },
];

/** Live counters shown as badges (orders awaiting fulfilment, low stock, reviews to moderate). */
function useNavCounts() {
  const { data } = useQuery({ queryKey: ['admin-dashboard'], queryFn: adminApi.dashboard, staleTime: 60_000, refetchInterval: 120_000 });
  return data?.totals ?? {};
}

function NavItems({ onNavigate, layoutId }: { onNavigate?: () => void; layoutId: string }) {
  const counts = useNavCounts();
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-mist">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const count = item.badge ? Number(counts[item.badge] ?? 0) : 0;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) => cn(
                      'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors duration-200',
                      isActive ? 'text-white' : 'text-ink-soft hover:bg-blush/50 hover:text-ink',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span layoutId={layoutId} className="absolute inset-0 -z-10 rounded-xl bg-ink shadow-[0_10px_24px_-14px_rgba(36,29,32,.6)]" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
                        )}
                        <span className={cn('grid h-7 w-7 place-items-center rounded-lg transition-colors duration-200', isActive ? 'bg-white/10 text-white' : 'bg-blush/60 text-rose-deep group-hover:bg-blush')}>
                          <item.icon size={15} />
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {count > 0 && (
                          <span className={cn('min-w-[1.4rem] rounded-full px-1.5 py-0.5 text-center text-[10.5px] font-bold tabular-nums', isActive ? 'bg-white text-ink' : 'bg-rose text-white')}>
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Footer({ name, email, onLogout }: { name: string; email: string; onLogout: () => void }) {
  const initials = name.split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'A';
  return (
    <div className="mt-6 border-t border-line pt-4">
      <div className="flex items-center gap-3 px-1">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blush to-champagne text-[12px] font-bold text-rose-deep">{initials}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
          <p className="truncate text-[11.5px] text-mist">{email}</p>
        </div>
      </div>
      <ThemeToggle className="mt-3 w-full" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a href={STORE_URL} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-rose hover:text-rose"><ExternalLink size={13} /> Store</a>
        <button type="button" onClick={onLogout} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-danger hover:text-danger"><LogOut size={13} /> Sign out</button>
      </div>
    </div>
  );
}

/** Desktop sidebar. */
export function Sidebar({ name, email, onLogout }: { name: string; email: string; onLogout: () => void }) {
  return (
    <aside className="hidden border-r border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto">
      <div className="flex items-start justify-between gap-2 px-5 pt-5">
        <div>
          <Logo />
          <p className="mt-1 text-[10.5px] uppercase tracking-[0.22em] text-mist">Back-office</p>
        </div>
        <InstallButton appName="Élaré Admin" variant="icon" className="-mr-2 -mt-1" />
      </div>
      <div className="flex-1 px-3 pt-6"><NavItems layoutId="admin-nav-desktop" /></div>
      <div className="px-4 pb-5"><Footer name={name} email={email} onLogout={onLogout} /></div>
    </aside>
  );
}

/** Mobile slide-in drawer. */
export function MobileNav({ open, onClose, name, email, onLogout }: { open: boolean; onClose: () => void; name: string; email: string; onLogout: () => void }) {
  const location = useLocation();
  useEffect(() => { onClose(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button type="button" aria-label="Close menu" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px] lg:hidden" />
          <motion.aside
            role="dialog"
            aria-label="Admin menu"
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[88vw] flex-col bg-white shadow-2xl lg:hidden"
          >
            <div className="flex items-center justify-between px-5 pt-5">
              <Logo />
              <button type="button" aria-label="Close menu" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-blush/60"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pt-6"><NavItems layoutId="admin-nav-mobile" onNavigate={onClose} /></div>
            <div className="px-4 pb-5"><Footer name={name} email={email} onLogout={onLogout} /></div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
