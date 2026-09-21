import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth, PageLoader, Seo, Logo, InstallButton, ThemeCycleButton } from '@elare/ui';
import { cn } from '@elare/utils';
import { MobileNav, Sidebar } from './AdminNav';

function RestrictedRedirect({ signOut }: { signOut: () => Promise<void> }) {
  useEffect(() => { void signOut(); }, [signOut]);
  return <Navigate to="/signin?restricted=1" replace />;
}

export default function AdminLayout() {
  const { user, loading, isAdmin, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Leave the protected area first so the guard below does not add ?next.
  const logout = async () => { navigate('/signin', { replace: true }); await signOut(); };
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={location.pathname === '/' ? '/signin' : `/signin?next=${encodeURIComponent(location.pathname)}`} replace />;
  // Profile still loading: wait rather than judging too early.
  if (!profile) return <PageLoader />;
  // Not an active admin (e.g. a customer session shared from the store): end it and warn on the sign-in page.
  if (!isAdmin) return <RestrictedRedirect signOut={signOut} />;
  const name = profile.full_name || user.email;
  return (
    <div className="min-h-screen bg-ivory lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <Seo title="Admin" noindex />
      <Sidebar name={name} email={user.email} onLogout={logout} />
      <MobileNav open={open} onClose={() => setOpen(false)} name={name} email={user.email} onLogout={logout} />
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Menu" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-blush/60"><Menu size={20} /></button>
            <Logo />
          </div>
          <div className="flex items-center">
            <ThemeCycleButton />
            <InstallButton appName="Élaré Admin" variant="icon" />
          </div>
        </header>
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
