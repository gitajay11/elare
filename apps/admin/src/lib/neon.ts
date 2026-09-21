import { createClient, SupabaseAuthAdapter, type SupabaseAuthAdapterInstance } from '@neondatabase/neon-js';

// One Neon base URL (host + database) — the SDK derives the Managed Auth URL from it.
const url = import.meta.env.VITE_NEON_URL;

/** True when the app has been pointed at a Neon project and the API. */
export const isConfigured = Boolean(url && !url.includes('ep-xxx') && import.meta.env.VITE_API_URL);

/** Neon Auth only. Every data call goes through the Élaré API with the session JWT. */
export const client = createClient(url || 'https://ep-xxx.c-0.us-east-1.aws.neon.tech/neondb', {
  auth: { adapter: SupabaseAuthAdapter() as ReturnType<typeof SupabaseAuthAdapter> & SupabaseAuthAdapterInstance, allowAnonymous: false },
});

/** Base URL of the Élaré API. */
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
/** Public origin of this admin site. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
/** Public origin of the customer storefront (main domain), for outbound links. */
export const STORE_URL = (import.meta.env.VITE_STORE_URL || '').replace(/\/$/, '');

/** Bearer token for API calls; null when signed out. */
export async function accessToken(): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}
