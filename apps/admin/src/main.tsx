import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { AuthProvider, PageLoader } from '@elare/ui';
import { client, isConfigured, SITE_URL } from '@/lib/neon';
import { adminApi } from '@/lib/api';
import './index.css';

const App = lazy(() => import('./App'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        client={client.auth}
        configured={isConfigured}
        fetchProfile={() => adminApi.me()}
        resetRedirectTo={() => `${SITE_URL}/auth/callback?reset=1`}
      >
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
