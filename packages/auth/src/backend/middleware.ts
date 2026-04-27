/**
 * PipeFX Auth — Backend Middleware.
 *
 * Verifies Supabase JWTs from the Authorization header. Mounted once
 * in the backend HTTP pipeline before routing — acts as a top-level gate.
 *
 * When Supabase is NOT configured, auth is BYPASSED and a default
 * local-user identity is used so development without Supabase
 * credentials keeps working.
 *
 * Usage:
 *
 *   const verifyAuth = createAuthMiddleware({
 *     supabaseUrl: config.supabaseUrl,
 *     supabaseServiceKey: config.supabaseServiceKey,
 *   });
 *
 *   // …per-request
 *   const authUser = await verifyAuth(req);
 *   if (!authUser) return res.writeHead(401).end();
 */

import type { IncomingMessage } from 'node:http';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdmin } from './supabase-admin.js';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthMiddlewareConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export type AuthMiddleware = (
  req: IncomingMessage
) => Promise<AuthUser | null>;

/**
 * Build the request-verifier. The returned function is safe to call
 * per-request; it captures a lazily-created admin client when Supabase
 * is configured.
 */
export function createAuthMiddleware(cfg: AuthMiddlewareConfig): AuthMiddleware {
  const isConfigured = !!cfg.supabaseUrl && !!cfg.supabaseServiceKey;

  if (!isConfigured) {
    console.warn(
      '[Auth] Supabase not configured — auth is BYPASSED. All requests use local-user identity.'
    );
    return async () => ({ id: 'local-user', email: 'dev@localhost' });
  }

  // Admin client is created once, reused per request.
  let adminClient: SupabaseClient | null = null;
  const getAdmin = () => {
    if (!adminClient) {
      adminClient = createSupabaseAdmin({
        supabaseUrl: cfg.supabaseUrl,
        supabaseServiceKey: cfg.supabaseServiceKey,
      });
    }
    return adminClient;
  };

  return async (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);

    try {
      const { data, error } = await getAdmin().auth.getUser(token);
      if (error || !data.user) return null;

      return {
        id: data.user.id,
        email: data.user.email ?? '',
      };
    } catch {
      // Network error or Supabase unreachable — reject.
      return null;
    }
  };
}
