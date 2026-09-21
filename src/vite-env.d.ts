/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_RAZORPAY_KEY_ID?: string;
  readonly VITE_STORE_URL?: string;
  readonly VITE_ADMIN_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Razorpay Checkout is loaded on demand from checkout.razorpay.com
interface Window {
  Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };
}
