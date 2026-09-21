import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { PageLoader } from '@/components/ui/Spinner';

// import.meta.env.MODE is a build-time constant, so Rollup drops the other app's
// import entirely: the storefront bundle contains no admin code and vice versa.
const App = lazy(() => (import.meta.env.MODE === 'admin' ? import('./apps/AdminApp') : import('./apps/StoreApp')));
import { AuthProvider } from '@/store/auth';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <MotionConfig reducedMotion="user">
            <Suspense fallback={<PageLoader />}>
              <App />
            </Suspense>
          </MotionConfig>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
