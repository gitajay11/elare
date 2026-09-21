import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { createAccountPath, signInPath } from '@/lib/routes';
import { useReducedMotion } from 'framer-motion';
import { Toaster, PageLoader } from '@elare/ui';
import { isConfigured } from '@/lib/neon';
import { useCartSync } from '@/lib/hooks';
import { Navbar } from '@/components/layout/Navbar';
import { MobileMenu } from '@/components/layout/MobileMenu';
import { SearchOverlay } from '@/components/layout/SearchOverlay';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/features/cart/CartDrawer';
import { QuickView } from '@/features/products/QuickView';

// Route-level code splitting. The admin back-office is a separate site (apps/admin).
const Home = lazy(() => import('./HomePage'));
const Catalog = lazy(() => import('@/features/products/CatalogPage'));
const Product = lazy(() => import('@/features/products/ProductPage'));
const Cart = lazy(() => import('@/features/cart/CartPage'));
const Checkout = lazy(() => import('@/features/checkout/CheckoutPage'));
const OrderConfirmation = lazy(() => import('@/features/checkout/OrderConfirmationPage'));
const Auth = lazy(() => import('@/features/account/AuthPage'));
const AuthCallback = lazy(() => import('@/features/account/AuthPage').then((m) => ({ default: m.AuthCallback })));
const StaticPage = lazy(() => import('./StaticPage'));
const NotFound = lazy(() => import('./NotFoundPage'));

const AccountLayout = lazy(() => import('@/features/account/AccountLayout'));
const AccountDashboard = lazy(() => import('@/features/account/DashboardPage'));
const OrdersList = lazy(() => import('@/features/orders/OrdersPages').then((m) => ({ default: m.OrdersList })));
const OrderDetail = lazy(() => import('@/features/orders/OrdersPages').then((m) => ({ default: m.OrderDetail })));
const Wishlist = lazy(() => import('@/features/wishlist/WishlistPage'));
const Loyalty = lazy(() => import('@/features/account/AccountPages').then((m) => ({ default: m.Loyalty })));
const Coupons = lazy(() => import('@/features/account/AccountPages').then((m) => ({ default: m.Coupons })));
const MyReviews = lazy(() => import('@/features/account/AccountPages').then((m) => ({ default: m.MyReviews })));
const Addresses = lazy(() => import('@/features/account/AccountPages').then((m) => ({ default: m.Addresses })));
const Profile = lazy(() => import('@/features/account/AccountPages').then((m) => ({ default: m.Profile })));


/** Old /auth links: /auth?mode=signup → /createaccount, otherwise /signin (keeping ?next). */
function LegacyAuthRedirect() {
  const [sp] = useSearchParams();
  const next = sp.get('next');
  return <Navigate to={sp.get('mode') === 'signup' ? createAccountPath(next) : signInPath(next)} replace />;
}

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
      Not configured — copy <code className="rounded bg-white/10 px-1">.env.example</code> to <code className="rounded bg-white/10 px-1">.env.local</code>, set <code className="rounded bg-white/10 px-1">VITE_NEON_URL</code> and <code className="rounded bg-white/10 px-1">VITE_API_URL</code>, and run <code className="rounded bg-white/10 px-1">pnpm db:migrate</code>.
    </div>
  );
}

function StorefrontLayout() {
  useCartSync();
  const location = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <ConfigBanner />
      <Navbar />
      <main className="flex-1">
        {/* Remount per route with a CSS enter animation: no exit phase to race a lazy chunk. */}
        <div key={location.pathname} className="page-enter">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
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
          <Route path="/signin" element={<Auth initialMode="signin" />} />
          <Route path="/signup" element={<Auth initialMode="signup" />} />
          <Route path="/createaccount" element={<Navigate to="/signup" replace />} />
          <Route path="/auth" element={<LegacyAuthRedirect />} />
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
