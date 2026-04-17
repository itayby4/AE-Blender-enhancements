/// <reference types="vite/client" />
/**
 * PipeFX Desktop — Supabase Client.
 *
 * This is the ONLY file that imports @supabase/supabase-js directly.
 * Everything else uses the auth-context wrapper (anti-lock-in per HANDOFF).
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
