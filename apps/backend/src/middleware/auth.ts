/**
 * PipeFX Backend — Auth Middleware.
 *
 * Verifies Supabase JWTs from the Authorization header.
 * Called once in main.ts before routing — acts as a top-level gate.
 * If the token is invalid or missing, the request is rejected with 401.
 *
 * When Supabase is NOT configured (no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY),
 * auth is bypassed and a default local-user identity is used. This allows
 * development without Supabase credentials.
 */

import type { IncomingMessage } from 'http';
import { config } from '../config.js';

export interface AuthUser {
  id: string;
  email: string;
}

/** True when Supabase is actually configured. */
const isSupabaseConfigured =
  !!config.supabaseUrl &&
  config.supabaseUrl !== '' &&
  !!config.supabaseServiceKey &&
  config.supabaseServiceKey !== '';

if (!isSupabaseConfigured) {
  console.warn(
    '[Auth] Supabase not configured — auth is BYPASSED. All requests use local-user identity.'
  );
}

/**
 * Verify the Supabase JWT from the Authorization header.
 * Returns the authenticated user if valid, null if not.
 *
 * When Supabase is not configured, returns a default local user.
 */
export async function verifyAuth(
  req: IncomingMessage
): Promise<AuthUser | null> {
  // ── Dev mode: no Supabase → allow all requests ──
  if (!isSupabaseConfigured) {
    return { id: 'local-user', email: 'dev@localhost' };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  try {
    // Dynamic import to avoid loading @supabase/supabase-js when not configured
    const { supabaseAdmin } = await import('../lib/supabase.js');
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) return null;

    return {
      id: data.user.id,
      email: data.user.email ?? '',
    };
  } catch {
    // Network error or Supabase unreachable — reject
    return null;
  }
}
