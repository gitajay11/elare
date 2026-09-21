import { useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Boxes, Gift, LayoutDashboard, LogOut, Menu, Package, Settings, ShoppingBag, Sparkles, Star, Tag, Tags, Users, X } from 'lucide-react';
import { useAuth, PageLoader, Seo, Logo } from '@elare/ui';
import { STORE_URL } from '@/lib/neon';
import { cn } from '@elare/utils';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/coupons', label: 'Coupons', icon: Tag },
  { to: '/loyalty', label: 'Loyalty', icon: Sparkles },
  { to: '/gifts', label: 'Free gifts', icon: Gift },
  { to: '/reviews', label: 'Reviews', icon: Star },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const { user, loading, isAdmin, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Leave the protected area first so the guard below does not add ?next.
  const logout = async () => { navigate('/signin', { replace: true }); await signOut(); };
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={location.pathname === '/' ? '/signin' : `/signin?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!isAdmin) {
    return (
      <div className="container-x grid min-h-[60vh] place-items-center text-center">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-2 text-3xl">This area is for the Élaré team.</h1>
          <p className="mt-2 text-sm text-ink-soft">Signed in as {user.email}. Ask an administrator to grant you access.</p>
          <div className="mt-6 flex justify-center gap-3">
            <a href={STORE_URL} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-rose hover:text-rose">Back to store</a>
            <button type="button" onClick={logout} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">Sign out</button>
          </div>
        </div>
      </div>
    );
  }
  const nav = (
    <nav className="space-y-0.5" aria-label="Admin">
      {LINKS.map((l) => (
        <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)} className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors', isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-blush/60 hover:text-ink')}>
          <l.icon size={16} /> {l.label}
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="min-h-screen bg-ivory lg:grid lg:grid-cols-[240px_1fr]">
      <Seo title="Admin" noindex />
      <aside className="hidden border-r border-line bg-white p-5 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        <Logo />
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-mist">Admin</p>
        <div className="mt-6">{nav}</div>
        <p className="mt-8 truncate text-[12px] text-mist">{profile?.full_name || user.email}</p>
        <a href={STORE_URL} className="mt-1 block text-[12px] font-semibold text-rose">← Back to store</a>
        <button type="button" onClick={logout} className="mt-4 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[12.5px] font-semibold hover:border-rose hover:text-rose"><LogOut size={14} /> Sign out</button>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
          <Logo />
          <button type="button" aria-label="Menu" onClick={() => setOpen((o) => !o)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-blush/60">{open ? <X size={20} /> : <Menu size={20} />}</button>
        </header>
        {open && (
          <div className="border-b border-line bg-white p-4 lg:hidden">
            {nav}
            <button type="button" onClick={logout} className="mt-3 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[12.5px] font-semibold"><LogOut size={14} /> Sign out</button>
          </div>
        )}
        <main className="p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}

export function AdminHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-[2rem] leading-tight">{title}</h1>{description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}</div>
      {action}
    </div>
  );
}

export function Table({ head, children, className }: { head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-line bg-white', className)}>
      <table className="w-full min-w-[640px] text-[13.5px]">
        <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.12em] text-mist">{head.map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Pager({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
      <span>{total} total</span>
      <div className="flex gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="h-9 rounded-full border border-line px-3 disabled:opacity-40">Prev</button>
        <span className="grid h-9 place-items-center px-2">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="h-9 rounded-full border border-line px-3 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}
