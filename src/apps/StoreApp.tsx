import { Suspense, lazy, useEffect, useState } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { pageTransition } from '@/lib/motion';
import { isConfigured } from '@/lib/neon';
import { useCartSync } from '@/hooks/useStore';
import { Navbar } from '@/components/layout/Navbar';
import { MobileMenu } from '@/components/layout/MobileMenu';
import { SearchOverlay } from '@/components/layout/SearchOverlay';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { QuickView } from '@/components/product/QuickView';
import { Toaster } from '@/components/ui/Toaster';
import { PageLoader } from '@/components/ui/Spinner';

// Route-level code splitting. The admin back-office is a separate app (src/apps/AdminApp.tsx).
const Home = lazy(() => import('@/pages/Home'));
const Catalog = lazy(() => import('@/pages/Catalog'));
const Product = lazy(() => import('@/pages/Product'));
const Cart = lazy(() => import('@/pages/Cart'));
const Checkout = lazy(() => import('@/pages/Checkout'));
const OrderConfirmation = lazy(() => import('@/pages/OrderConfirmation'));
const Auth = lazy(() => import('@/pages/Auth'));
const AuthCallback = lazy(() => import('@/pages/Auth').then((m) => ({ default: m.AuthCallback })));
const StaticPage = lazy(() => import('@/pages/StaticPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const AccountLayout = lazy(() => import('@/pages/account/AccountLayout'));
const AccountDashboard = lazy(() => import('@/pages/account/Dashboard'));
const OrdersList = lazy(() => import('@/pages/account/Orders').then((m) => ({ default: m.OrdersList })));
const OrderDetail = lazy(() => import('@/pages/account/Orders').then((m) => ({ default: m.OrderDetail })));
const Wishlist = lazy(() => import('@/pages/account/Wishlist'));
const Loyalty = lazy(() => import('@/pages/account/Misc').then((m) => ({ default: m.Loyalty })));
const Coupons = lazy(() => import('@/pages/account/Misc').then((m) => ({ default: m.Coupons })));
const MyReviews = lazy(() => import('@/pages/account/Misc').then((m) => ({ default: m.MyReviews })));
const Addresses = lazy(() => import('@/pages/account/Misc').then((m) => ({ default: m.Addresses })));
const Profile = lazy(() => import('@/pages/account/Misc').then((m) => ({ default: m.Profile })));


function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

/** Subtle cursor dot on fine-pointer devices; grows over links and buttons. */
function CursorDot() {
  const [pos, setPos] = useState({ x: -100, y: -100, link: false });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const move = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      setPos({ x: e.clientX, y: e.clientY, link: !!t?.closest('a,button,[role="button"]') });
    };
    window.addEventListener('mousemove', move, { passive: true });
    return () => window.removeEventListener('mousemove', move);
  }, [reduce]);
  if (reduce) return null;
  return <div className={`cursor-dot ${pos.link ? 'is-link' : ''}`} style={{ left: pos.x, top: pos.y }} aria-hidden="true" />;
}

function ConfigBanner() {
  if (isConfigured) return null;
  return (
    <div className="bg-ink px-4 py-2 text-center text-[12.5px] text-white">
      Neon is not configured — copy <code className="rounded bg-white/10 px-1">.env.example</code> to <code className="rounded bg-white/10 px-1">.env</code>, set <code className="rounded bg-white/10 px-1">VITE_NEON_URL</code>, and run <code className="rounded bg-white/10 px-1">npm run db:migrate</code>.
    </div>
  );
}

function StorefrontLayout() {
  useCartSync();
  const location = useLocation();
  const reduce = useReducedMotion();
  return (
    <div className="flex min-h-screen flex-col">
      <ConfigBanner />
      <Navbar />
      <main className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={location.pathname} {...(reduce ? {} : pageTransition)}>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
      <MobileMenu />
      <SearchOverlay />
      <CartDrawer />
      <QuickView />
    </div>
  );
}

/** Checkout runs without the storefront chrome. */
function BareLayout() {
  useCartSync();
  return (
    <Suspense fallback={<PageLoader />}>
      <ConfigBanner />
      <Outlet />
      <CartDrawer />
    </Suspense>
  );
}

export default function StoreApp() {
  return (
    <>
      <ScrollToTop />
      <CursorDot />
      <Routes>
        <Route element={<StorefrontLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Catalog mode="shop" />} />
          <Route path="/best-sellers" element={<Catalog mode="best-sellers" />} />
          <Route path="/search" element={<Catalog mode="search" />} />
          <Route path="/category/:category" element={<Catalog mode="category" />} />
          <Route path="/category/:category/:subcategory" element={<Catalog mode="category" />} />
          <Route path="/product/:slug" element={<Product />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/order/:id/confirmation" element={<OrderConfirmation />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/pages/:slug" element={<StaticPage />} />
          <Route path="/account" element={<AccountLayout />}>
            <Route index element={<AccountDashboard />} />
            <Route path="orders" element={<OrdersList />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="wishlist" element={<Wishlist />} />
            <Route path="loyalty" element={<Loyalty />} />
            <Route path="addresses" element={<Addresses />} />
            <Route path="profile" element={<Profile />} />
            <Route path="coupons" element={<Coupons />} />
            <Route path="reviews" element={<MyReviews />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route element={<BareLayout />}>
          <Route path="/checkout" element={<Checkout />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
