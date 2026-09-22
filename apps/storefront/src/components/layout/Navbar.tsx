import { useEffect, useState } from 'react';
import { signInPath } from '@/lib/routes';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Menu, Search, ShoppingBag, User } from 'lucide-react';
import { cn } from '@elare/utils';
import { useAuth, IconButton, InstallButton, Logo } from '@elare/ui';
import { selectCount, useCart } from '@/features/cart/store';
import { useUi } from '@/lib/ui-store';
import { useWishlist } from '@/features/wishlist/store';
import { useStoreConfig } from '@/lib/hooks';

export const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/category/lips', label: 'Lips' },
  { to: '/category/eyes', label: 'Eyes' },
  { to: '/category/face', label: 'Face' },
  { to: '/category/brushes-tools', label: 'Brushes & Tools' },
  { to: '/best-sellers', label: 'Best Sellers' },
];

export { Logo };

function Count({ n }: { n: number }) {
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.span
          key={n}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose px-1 text-[10px] font-bold text-white"
          aria-hidden="true"
        >
          {n > 99 ? '99+' : n}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { user } = useAuth();
  const count = useCart(selectCount);
  const wishlistCount = useWishlist((s) => s.ids.length);
  const openCart = useUi((s) => s.openCart);
  const setMenu = useUi((s) => s.setMenu);
  const setSearch = useUi((s) => s.setSearch);
  const { config } = useStoreConfig();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const freeAbove = config.shipping.free_above;

  return (
    <header className={cn('sticky top-0 z-[80] transition-[background,box-shadow,backdrop-filter] duration-500', scrolled ? 'glass shadow-[0_1px_0_rgba(184,92,120,.12)]' : 'bg-ivory')}>
      <div className="hidden border-b border-line/70 bg-ink text-center text-[11.5px] tracking-[0.12em] text-white/85 sm:block">
        <p className="py-1.5">Complimentary shipping on orders above ₹{freeAbove.toLocaleString('en-IN')} · Earn Élaré points on every order</p>
      </div>
      <div className="container-x flex h-[68px] items-center justify-between gap-4 lg:h-[76px]">
        <div className="flex items-center gap-2 lg:hidden">
          <IconButton label="Open menu" onClick={() => setMenu(true)}><Menu size={22} /></IconButton>
        </div>

        <Logo className="lg:mr-4" />

        <nav className="hidden items-center gap-5 lg:flex xl:gap-7" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => cn('relative whitespace-nowrap py-2 text-[13.5px] font-medium tracking-[0.02em] text-ink-soft transition-colors hover:text-ink', isActive && 'text-ink')}
            >
              {({ isActive }) => (
                <>
                  {l.label}
                  {isActive && <motion.span layoutId="nav-underline" className="absolute inset-x-0 -bottom-0.5 h-px bg-rose" transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <IconButton label="Search" onClick={() => setSearch(true)}><Search size={20} /></IconButton>
          <Link to={user ? '/account' : signInPath(location.pathname)} className="hidden h-10 w-10 place-items-center rounded-full transition-colors hover:bg-blush/70 lg:grid" aria-label={user ? 'Account' : 'Sign in'}>
            <User size={20} />
          </Link>
          <Link to="/account/wishlist" className="relative hidden h-10 w-10 place-items-center rounded-full transition-colors hover:bg-blush/70 lg:grid" aria-label={`Wishlist, ${wishlistCount} items`}>
            <Heart size={20} />
            <Count n={wishlistCount} />
          </Link>
          <InstallButton appName="Élaré Beauty" variant="icon" />
          <IconButton label={`Bag, ${count} items`} onClick={openCart}>
            <ShoppingBag size={20} />
            <Count n={count} />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
