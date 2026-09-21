import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when the app has been pointed at a Supabase project. */
export const isConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'));

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const SITE_URL = (import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');

/** Which app this bundle is: the customer storefront or the admin back-office (vite --mode admin). */
export const APP: 'store' | 'admin' = import.meta.env.MODE === 'admin' ? 'admin' : 'store';
/** Public origin of the storefront (used by the admin app for outbound links). */
export const STORE_URL = (import.meta.env.VITE_STORE_URL || SITE_URL).replace(/\/$/, '');
/** Public origin of the admin back-office; empty when not deployed. */
export const ADMIN_URL = (import.meta.env.VITE_ADMIN_URL || '').replace(/\/$/, '');
