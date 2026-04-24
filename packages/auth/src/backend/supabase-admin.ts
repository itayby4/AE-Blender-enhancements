/**
 * PipeFX Auth — Supabase Admin Client Factory.
 *
 * Creates an admin-level Supabase client for JWT verification only.
 * Uses the SERVICE_ROLE key — bypasses RLS (not that we use Supabase for data).
 * Sole purpose: `supabaseAdmin.auth.getUser(token)` inside the auth
 * middleware.
 *
 * This is the ONLY backend-side entry point into @supabase/supabase-js.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseAdminConfig {
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export function createSupabaseAdmin(
  cfg: SupabaseAdminConfig
): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabaseServiceKey);
}
