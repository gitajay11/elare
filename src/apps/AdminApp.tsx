import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toaster';
import { PageLoader } from '@/components/ui/Spinner';

// The back-office. Built with `vite build --mode admin` and deployed on its own
// domain; none of the storefront pages are included in this bundle.
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const AdminProducts = lazy(() => import('@/pages/admin/Products').then((m) => ({ default: m.AdminProducts })));
const AdminProductEditor = lazy(() => import('@/pages/admin/Products').then((m) => ({ default: m.AdminProductEditor })));
const AdminCategories = lazy(() => import('@/pages/admin/Catalog'));
const AdminOrders = lazy(() => import('@/pages/admin/Orders').then((m) => ({ default: m.AdminOrders })));
const AdminOrderDetail = lazy(() => import('@/pages/admin/Orders').then((m) => ({ default: m.AdminOrderDetail })));
const AdminCustomers = lazy(() => import('@/pages/admin/Customers').then((m) => ({ default: m.AdminCustomers })));
const AdminCustomerDetail = lazy(() => import('@/pages/admin/Customers').then((m) => ({ default: m.AdminCustomerDetail })));
const AdminCoupons = lazy(() => import('@/pages/admin/Coupons'));
const AdminLoyalty = lazy(() => import('@/pages/admin/Programs').then((m) => ({ default: m.AdminLoyalty })));
const AdminGifts = lazy(() => import('@/pages/admin/Programs').then((m) => ({ default: m.AdminGifts })));
const AdminReviews = lazy(() => import('@/pages/admin/Moderation').then((m) => ({ default: m.AdminReviews })));
const AdminInventory = lazy(() => import('@/pages/admin/Moderation').then((m) => ({ default: m.AdminInventory })));
const AdminAnalytics = lazy(() => import('@/pages/admin/Settings').then((m) => ({ default: m.AdminAnalytics })));
const AdminSettings = lazy(() => import('@/pages/admin/Settings').then((m) => ({ default: m.AdminSettings })));
const Auth = lazy(() => import('@/pages/Auth'));
const AuthCallback = lazy(() => import('@/pages/Auth').then((m) => ({ default: m.AuthCallback })));

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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Auth adminMode />} />
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
