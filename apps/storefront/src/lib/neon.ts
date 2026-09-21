import { createClient, SupabaseAuthAdapter, type SupabaseAuthAdapterInstance } from '@neondatabase/neon-js';

// One Neon base URL (host + database) — the SDK derives the Managed Auth URL from it.
const url = import.meta.env.VITE_NEON_URL;

/** True when the app has been pointed at a Neon project and the API. */
export const isConfigured = Boolean(url && !url.includes('ep-xxx') && import.meta.env.VITE_API_URL);

/**
 * Neon Auth only (Managed Better Auth, Supabase-shaped adapter). All data
 * access goes through the Élaré API with the session's JWT — the storefront
 * never talks to the database directly.
 */
export const client = createClient(url || 'https://ep-xxx.c-0.us-east-1.aws.neon.tech/neondb', {
  // The factory returns a builder that createClient invokes with the derived auth URL;
  // the published types expect the built instance, hence the cast.
  auth: { adapter: SupabaseAuthAdapter() as ReturnType<typeof SupabaseAuthAdapter> & SupabaseAuthAdapterInstance, allowAnonymous: false },
});

export const auth = client.auth;

/** Base URL of the Élaré API. */
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
/** Public origin of this storefront. */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
/** Public origin of the admin back-office (subdomain); empty when not deployed. */
export const ADMIN_URL = (import.meta.env.VITE_ADMIN_URL || '').replace(/\/$/, '');

/** Bearer token for API calls; null when signed out. */
export async function accessToken(): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}
