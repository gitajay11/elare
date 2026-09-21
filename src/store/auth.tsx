import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { client, betterAuth, isConfigured } from '@/lib/neon';
import { api, friendly } from '@/lib/api';
import type { Profile } from '@/lib/types';

/** The signed-in identity as reported by Neon Auth. */
export interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, phone?: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Completes a password reset from the emailed link (`?token=`). */
  completePasswordReset: (token: string, newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function toUser(u: { id: string; email?: string | null } | null | undefined): AuthUser | null {
  return u ? { id: u.id, email: u.email ?? '' } : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileFor = useRef<string | null>(null);

  // Profiles are created lazily on the server (ensure_profile) the first time a
  // signed-in user is seen; this also keeps name/phone in sync on sign-up.
  const loadProfile = useCallback(async (u: AuthUser | null, extra?: { fullName?: string; phone?: string }) => {
    if (!u) {
      profileFor.current = null;
      setProfile(null);
      return;
    }
    if (profileFor.current === u.id && !extra) return;
    profileFor.current = u.id;
    // onAuthStateChange can fire a beat before the new session's JWT is usable
    // by the Data API, so retry briefly instead of clobbering a loaded profile.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        setProfile(await api.ensureProfile(extra?.fullName, extra?.phone));
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    setProfile((prev) => (prev?.id === u.id ? prev : null));
  }, []);

  useEffect(() => {
    let mounted = true;
    client.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = toUser(data.session?.user);
      setUser(u);
      loadProfile(u).finally(() => mounted && setLoading(false));
    }).catch(() => mounted && setLoading(false));
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      const u = toUser(session?.user);
      setUser((prev) => (prev?.id === u?.id ? prev : u));
      loadProfile(u);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      loading,
      isAdmin: profile?.role === 'admin' && profile.status === 'active',
      configured: isConfigured,
      async signIn(email, password) {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw new Error(friendly(error.message));
        const u = toUser(data.user);
        setUser(u);
        await loadProfile(u);
      },
      async signUp(email, password, fullName, phone) {
        const { data, error } = await client.auth.signUp({ email, password, options: { data: { name: fullName } } });
        if (error) throw new Error(friendly(error.message));
        if (!data.session) return { needsConfirmation: true };
        const u = toUser(data.user);
        setUser(u);
        await loadProfile(u, { fullName, phone });
        return { needsConfirmation: false };
      },
      async signOut() {
        await client.auth.signOut();
        setUser(null);
        setProfile(null);
        profileFor.current = null;
      },
      async resetPassword(email) {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?reset=1` });
        if (error) throw new Error(friendly(error.message));
      },
      async completePasswordReset(token, newPassword) {
        const { error } = await betterAuth().resetPassword({ token, newPassword });
        if (error) throw new Error(friendly(error.message ?? 'Reset link is invalid or has expired.'));
      },
      async changePassword(currentPassword, newPassword) {
        const { error } = await betterAuth().changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
        if (error) throw new Error(friendly(error.message ?? 'Could not change password.'));
      },
      refreshProfile: async () => {
        profileFor.current = null;
        await loadProfile(user);
      },
    }),
    [user, profile, loading, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
