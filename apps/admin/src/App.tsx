import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster, PageLoader, OfflineBanner } from '@elare/ui';
import { ServiceWorker } from '@/lib/pwa';

// The back-office: its own site (apps/admin) deployed on the admin subdomain.
// None of the storefront pages are part of this bundle.
const AdminLayout = lazy(() => import('@/components/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/DashboardPage'));
const AdminProducts = lazy(() => import('@/features/products/ProductsPages').then((m) => ({ default: m.AdminProducts })));
const AdminProductEditor = lazy(() => import('@/features/products/ProductsPages').then((m) => ({ default: m.AdminProductEditor })));
const AdminCategories = lazy(() => import('@/pages/CategoriesPage'));
const AdminOrders = lazy(() => import('@/features/orders/OrdersPages').then((m) => ({ default: m.AdminOrders })));
const AdminOrderDetail = lazy(() => import('@/features/orders/OrdersPages').then((m) => ({ default: m.AdminOrderDetail })));
const AdminCustomers = lazy(() => import('@/features/customers/CustomersPages').then((m) => ({ default: m.AdminCustomers })));
const AdminCustomerDetail = lazy(() => import('@/features/customers/CustomersPages').then((m) => ({ default: m.AdminCustomerDetail })));
const AdminCoupons = lazy(() => import('@/features/coupons/CouponsPage'));
const AdminLoyalty = lazy(() => import('@/features/loyalty/ProgramsPages').then((m) => ({ default: m.AdminLoyalty })));
const AdminGifts = lazy(() => import('@/features/loyalty/ProgramsPages').then((m) => ({ default: m.AdminGifts })));
const AdminReviews = lazy(() => import('@/features/inventory/ModerationPages').then((m) => ({ default: m.AdminReviews })));
const AdminInventory = lazy(() => import('@/features/inventory/ModerationPages').then((m) => ({ default: m.AdminInventory })));
const AdminAnalytics = lazy(() => import('@/features/analytics/SettingsPages').then((m) => ({ default: m.AdminAnalytics })));
const AdminSettings = lazy(() => import('@/features/analytics/SettingsPages').then((m) => ({ default: m.AdminSettings })));
const Auth = lazy(() => import('@/pages/AuthPage'));
const AuthCallback = lazy(() => import('@/pages/AuthPage').then((m) => ({ default: m.AuthCallback })));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export default function AdminApp() {
  return (
    <>
      <ScrollToTop />
      <ServiceWorker />
      <OfflineBanner />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/signin" element={<Auth />} />
          <Route path="/login" element={<Navigate to="/signin" replace />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="products/:id" element={<AdminProductEditor />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="orders/:id" element={<AdminOrderDetail />} />
            <Route path="customers" element={<AdminCustomers />} />
            <Route path="customers/:id" element={<AdminCustomerDetail />} />
            <Route path="coupons" element={<AdminCoupons />} />
            <Route path="loyalty" element={<AdminLoyalty />} />
            <Route path="gifts" element={<AdminGifts />} />
            <Route path="reviews" element={<AdminReviews />} />
            <Route path="inventory" element={<AdminInventory />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      <Toaster />
    </>
  );
}
