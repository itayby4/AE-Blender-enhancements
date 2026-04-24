/// <reference types="vite/client" />
/**
 * PipeFX Auth — Supabase Browser Client.
 *
 * This is the ONLY file that imports @supabase/supabase-js for the
 * browser runtime. Everything else should go through `useAuth()` or
 * the dedicated helpers exported from `@pipefx/auth/ui`.
 *
 * Exposed via `@pipefx/auth/ui` as an escape hatch for code paths
 * that still need raw client access (e.g. profile updates in
 * SettingsPage). Prefer adding a typed helper here over widening
 * the export surface further.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth features will be disabled. Copy .env.example to .env and fill in your Supabase credentials.'
  );
}

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-key'
);
