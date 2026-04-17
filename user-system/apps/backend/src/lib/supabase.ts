/**
 * PipeFX Backend — Supabase Admin Client.
 *
 * Used ONLY for JWT verification (auth.getUser).
 * All application data stays in the local SQLite database.
 * This file is the only place in the backend that imports @supabase/supabase-js.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

/**
 * Admin-level Supabase client.
 * Uses the SERVICE_ROLE key — bypasses RLS (not that we use Supabase for data).
 * Only purpose: verify JWTs via `supabaseAdmin.auth.getUser(token)`.
 */
export const supabaseAdmin = createClient(
  config.supabaseUrl,
  config.supabaseServiceKey
);
