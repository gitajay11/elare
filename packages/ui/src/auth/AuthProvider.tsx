import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** The signed-in identity as reported by Neon Auth. */
export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: 'customer' | 'admin';
  status: 'active' | 'suspended';
}

/**
 * The slice of the Neon Auth client (Supabase-shaped adapter) the provider needs.
 * Both apps build their own client and pass it in.
 */
export interface AuthClientLike {
  getSession: () => Promise<{ data: { session: { user: { id: string; email?: string | null } } | null } }>;
  onAuthStateChange: (cb: (event: string, session: { user: { id: string; email?: string | null } } | null) => void) => { data: { subscription: { unsubscribe: () => void } } };
  signInWithPassword: (c: { email: string; password: string }) => Promise<{ data: { user: { id: string; email?: string | null } | null }; error: { message: string } | null }>;
  signUp: (c: { email: string; password: string; options?: { data?: Record<string, unknown> } }) => Promise<{ data: { user: { id: string; email?: string | null } | null; session: unknown }; error: { message: string } | null }>;
  signOut: () => Promise<unknown>;
  resetPasswordForEmail: (email: string, options?: { redirectTo?: string }) => Promise<{ error: { message: string } | null }>;
  getBetterAuthInstance: () => {
    resetPassword: (p: { token: string; newPassword: string }) => Promise<{ error?: { message?: string } | null }>;
    changePassword: (p: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }) => Promise<{ error?: { message?: string } | null }>;
  };
}

export interface AuthProviderProps {
  client: AuthClientLike;
  /** Loads (and lazily creates) the caller's profile through the API. */
  fetchProfile: (extra?: { fullName?: string; phone?: string }) => Promise<AuthProfile>;
  /** Where password-reset emails should land. */
  resetRedirectTo: () => string;
  configured: boolean;
  children: ReactNode;
}

export interface AuthState {
  user: AuthUser | null;
  profile: AuthProfile | null;
  loading: boolean;
  isAdmin: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, phone?: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  completePasswordReset: (token: string, newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null => (u ? { id: u.id, email: u.email ?? '' } : null);
const friendly = (m: string | undefined, fallback: string) => (m || fallback).replace(/^.*?error:\s*/i, '');

export function AuthProvider({ client, fetchProfile, resetRedirectTo, configured, children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (u: AuthUser | null, extra?: { fullName?: string; phone?: string }) => {
    if (!u) {
      profileFor.current = null;
      setProfile(null);
      return;
    }
    if (profileFor.current === u.id && !extra) return;
    profileFor.current = u.id;
    // onAuthStateChange can fire a beat before the new session's JWT is usable,
    // so retry briefly instead of clobbering a loaded profile.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        setProfile(await fetchProfile(extra));
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    setProfile((prev) => (prev?.id === u.id ? prev : null));
  }, [fetchProfile]);

  useEffect(() => {
    let mounted = true;
    client.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = toUser(data.session?.user);
      setUser(u);
      loadProfile(u).finally(() => mounted && setLoading(false));
    }).catch(() => mounted && setLoading(false));
    const { data: sub } = client.onAuthStateChange((_event, session) => {
      const u = toUser(session?.user);
      setUser((prev) => (prev?.id === u?.id ? prev : u));
      loadProfile(u);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [client, loadProfile]);

  const value = useMemo<AuthState>(() => ({
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin' && profile.status === 'active',
    configured,
    async signIn(email, password) {
      const { data, error } = await client.signInWithPassword({ email, password });
      if (error) throw new Error(friendly(error.message, 'Sign in failed'));
      const u = toUser(data.user);
      setUser(u);
      await loadProfile(u);
    },
    async signUp(email, password, fullName, phone) {
      const { data, error } = await client.signUp({ email, password, options: { data: { name: fullName } } });
      if (error) throw new Error(friendly(error.message, 'Sign up failed'));
      if (!data.session) return { needsConfirmation: true };
      const u = toUser(data.user);
      setUser(u);
      await loadProfile(u, { fullName, phone });
      return { needsConfirmation: false };
    },
    async signOut() {
      await client.signOut();
      setUser(null);
      setProfile(null);
      profileFor.current = null;
    },
    async resetPassword(email) {
      const { error } = await client.resetPasswordForEmail(email, { redirectTo: resetRedirectTo() });
      if (error) throw new Error(friendly(error.message, 'Could not send the reset email'));
    },
    async completePasswordReset(token, newPassword) {
      const { error } = await client.getBetterAuthInstance().resetPassword({ token, newPassword });
      if (error) throw new Error(friendly(error.message ?? undefined, 'Reset link is invalid or has expired.'));
    },
    async changePassword(currentPassword, newPassword) {
      const { error } = await client.getBetterAuthInstance().changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (error) throw new Error(friendly(error.message ?? undefined, 'Could not change password.'));
    },
    refreshProfile: async () => {
      profileFor.current = null;
      await loadProfile(user);
    },
  }), [user, profile, loading, configured, client, loadProfile, resetRedirectTo]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
