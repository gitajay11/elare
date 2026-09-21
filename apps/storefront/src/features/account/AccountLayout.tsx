import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Heart, LayoutDashboard, LogOut, MapPin, Package, Sparkles, Star, Tag, User } from 'lucide-react';
import { useAuth, PageLoader } from '@elare/ui';
import { ADMIN_URL } from '@/lib/neon';
import { cn } from '@elare/utils';

const LINKS = [
  { to: '/account', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/account/orders', label: 'Orders', icon: Package },
  { to: '/account/wishlist', label: 'Wishlist', icon: Heart },
  { to: '/account/loyalty', label: 'Élaré points', icon: Sparkles },
  { to: '/account/addresses', label: 'Addresses', icon: MapPin },
  { to: '/account/profile', label: 'Profile', icon: User },
  { to: '/account/coupons', label: 'Coupons', icon: Tag },
  { to: '/account/reviews', label: 'Reviews', icon: Star },
];

export default function AccountLayout() {
  const { user, profile, loading, signOut, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to={`/auth?next=${encodeURIComponent(location.pathname)}`} replace />;
  return (
    <div className="container-x py-8 lg:py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">My account</p>
          <h1 className="mt-1 text-[2.2rem] sm:text-[2.8rem]">Hello, {profile?.full_name?.split(' ')[0] || 'there'}.</h1>
        </div>
        <div className="flex gap-2">
          {isAdmin && ADMIN_URL && <a href={ADMIN_URL} className="rounded-full bg-blush px-4 py-2 text-sm font-semibold text-rose-deep">Admin dashboard</a>}
          <button type="button" onClick={async () => { await signOut(); navigate('/'); }} className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-rose hover:text-rose"><LogOut size={14} /> Sign out</button>
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[230px_1fr]">
        <nav className="scrollbar-none -mx-5 flex gap-1 overflow-x-auto px-5 lg:mx-0 lg:flex-col lg:px-0" aria-label="Account">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => cn('flex shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-blush/60 hover:text-ink')}>
              <l.icon size={16} /> {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0"><Outlet /></div>
      </div>
    </div>
  );
}
