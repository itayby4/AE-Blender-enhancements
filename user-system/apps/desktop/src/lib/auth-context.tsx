/**
 * PipeFX Desktop — Auth Context.
 *
 * Wraps Supabase Auth in a React context so the rest of the app
 * never imports @supabase/supabase-js directly.
 *
 * Anti-lock-in: If we ever swap to Auth.js / Clerk / etc.,
 * only this file and lib/supabase.ts need to change.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase } from './supabase.js';
import type { User, Session } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  /** The authenticated user, or null if not signed in. */
  user: AuthUser | null;

  /** True while the initial session is being loaded. */
  isLoading: boolean;

  /** Sign in with email + password. Returns error string on failure. */
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error?: string }>;

  /** Register with email + password. Returns error string on failure. */
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error?: string }>;

  /** Start Google OAuth flow (opens system browser). */
  signInWithGoogle: () => Promise<void>;

  /** Sign out and clear session. */
  signOut: () => Promise<void>;
}

// ────────────────────────────────────────────────────────
// Context
// ────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ────────────────────────────────────────────────────────
// Standalone token getter (for use in non-React modules like api.ts)
// ────────────────────────────────────────────────────────

/**
 * Get the current Supabase access token.
 * Can be called from anywhere (doesn't need React context).
 * Returns null if no active session.
 */
export async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

function mapUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return { id: user.id, email: user.email ?? '' };
}

// ────────────────────────────────────────────────────────
// Provider
// ────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Listen for auth state changes (login, logout, token refresh)
  useEffect(() => {
    // Get the initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(mapUser(session?.user ?? null));
      setIsLoading(false);
    });

    // Subscribe to future changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        setUser(mapUser(session?.user ?? null));
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ── Sign in with email/password ──
  const signIn = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ error?: string }> => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
      return {};
    },
    []
  );

  // ── Register with email/password ──
  const signUp = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ error?: string }> => {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
      return {};
    },
    []
  );

  // ── Google OAuth ──
  const signInWithGoogle = useCallback(async () => {
    // In a Tauri desktop app, this opens the system browser.
    // The redirect URL must be configured in Supabase Dashboard
    // under Authentication → URL Configuration → Redirect URLs.
    // For desktop, add: pipefx://auth/callback
    //
    // After the OAuth flow completes, Supabase redirects to this URL
    // with tokens in the hash fragment. The Tauri deep-link plugin
    // captures it and the onAuthStateChange listener picks up the session.
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // For Tauri desktop, we redirect to the app's deep link
        redirectTo: window.location.origin,
      },
    });
  }, []);

  // ── Sign out ──
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, signIn, signUp, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
