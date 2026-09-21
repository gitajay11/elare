/** Public origin of the current app, for canonical links and Open Graph. */
export const SITE_URL: string = (
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SITE_URL) ||
  (typeof window !== 'undefined' ? window.location.origin : '')
).replace(/\/$/, '');
