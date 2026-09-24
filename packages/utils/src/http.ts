/** Error thrown by the API client; `status` is the HTTP status, `code` an optional machine code. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the caller's bearer token, or null for guests. */
  getToken: () => Promise<string | null>;
}

/**
 * Minimal typed HTTP client for the Élaré API. Every request carries the
 * current session's JWT when there is one; errors are surfaced as ApiError
 * with the server's message so the UI can show it verbatim.
 */
export function createApiClient({ baseUrl, getToken }: ApiClientOptions) {
  const base = baseUrl.replace(/\/$/, '');
  async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
    if (!base) throw new ApiError('The Élaré API URL is not configured (VITE_API_URL).', 0, 'not_configured');
    const headers = new Headers(init.headers);
    const token = await getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers.set('Content-Type', 'application/json'); payload = JSON.stringify(body); }
    const res = await fetch(`${base}${path}`, { ...init, method, headers, body: payload });
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      const err = (data as { error?: string; code?: string } | null) ?? {};
      throw new ApiError(err.error || `Request failed (${res.status})`, res.status, err.code, (data as Record<string, unknown>) ?? {});
    }
    return data as T;
  }
  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return { error: text }; }
}

/** Builds a query string from a plain object, skipping empty values and JSON-encoding objects/arrays. */
export function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
