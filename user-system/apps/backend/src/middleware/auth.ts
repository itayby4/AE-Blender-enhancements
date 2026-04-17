/**
 * PipeFX Backend — Auth Middleware.
 *
 * Verifies Supabase JWTs from the Authorization header.
 * Called once in main.ts before routing — acts as a top-level gate.
 * If the token is invalid or missing, the request is rejected with 401.
 */

import type { IncomingMessage } from 'http';
import { supabaseAdmin } from '../lib/supabase.js';

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Verify the Supabase JWT from the Authorization header.
 * Returns the authenticated user if valid, null if not.
 *
 * Usage in main.ts:
 * ```
 * const user = await verifyAuth(req);
 * if (!user) { res.writeHead(401); res.end(...); return; }
 * ```
 */
export async function verifyAuth(
  req: IncomingMessage
): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  try {
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
