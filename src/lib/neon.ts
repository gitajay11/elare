import { createClient, SupabaseAuthAdapter, type SupabaseAuthAdapterInstance } from '@neondatabase/neon-js';

// One Neon base URL (host + database) — the SDK derives the Managed Auth URL
// and the Data API (PostgREST-compatible) URL from it.
const url = import.meta.env.VITE_NEON_URL;

/** True when the app has been pointed at a Neon project. */
export const isConfigured = Boolean(url && !url.includes('ep-xxx'));

/**
 * Auth (Managed Better Auth, Supabase-shaped adapter so the call sites read
 * `client.auth.signInWithPassword` etc.) + Data API. Guests get a short-lived
 * anonymous JWT so the `anonymous` Postgres role can read the catalogue.
 */
export const client = createClient(url || 'https://ep-xxx.c-0.us-east-1.aws.neon.tech/neondb', {
  // The factory returns a builder that createClient invokes with the derived auth URL;
  // the published types expect the built instance, hence the cast.
  auth: { adapter: SupabaseAuthAdapter() as ReturnType<typeof SupabaseAuthAdapter> & SupabaseAuthAdapterInstance, allowAnonymous: true },
});

/** Raw Better Auth client, for the few flows the Supabase-shaped adapter does not cover (password change / reset). */
export const betterAuth = () => client.auth.getBetterAuthInstance();

export const SITE_URL = (import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');

/** Base URL of the Élaré API Function (payments, uploads). Empty when not deployed. */
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** Which app this bundle is: the customer storefront or the admin back-office (vite --mode admin). */
export const APP: 'store' | 'admin' = import.meta.env.MODE === 'admin' ? 'admin' : 'store';
/** Public origin of the storefront (used by the admin app for outbound links). */
export const STORE_URL = (import.meta.env.VITE_STORE_URL || SITE_URL).replace(/\/$/, '');
/** Public origin of the admin back-office; empty when not deployed. */
export const ADMIN_URL = (import.meta.env.VITE_ADMIN_URL || '').replace(/\/$/, '');

/** Bearer token for calls to the API Function; null when signed out. */
export async function accessToken(): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Calls the API Function with the current user's JWT. Throws a friendly Error on failure. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new Error('This feature needs the Élaré API, which is not configured yet.');
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}
