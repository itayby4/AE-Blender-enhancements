/// <reference types="vite/client" />
/**
 * PipeFX Desktop — Supabase Client.
 *
 * This is the ONLY file that imports @supabase/supabase-js directly.
 * Everything else uses the auth-context wrapper (anti-lock-in per HANDOFF).
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth features will be disabled. Copy .env.example to .env and fill in your Supabase credentials.'
  );
}

// Use placeholder URL when not configured — the SDK needs a valid URL shape.
// Auth calls will fail gracefully but the app won't crash.
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-key'
);

