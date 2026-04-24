export {
  AuthProvider,
  useAuth,
  getAccessToken,
  type AuthUser,
} from './auth-context.js';

// Raw browser client — exposed as an escape hatch for callers that
// still need Supabase primitives (e.g. profile updates). Prefer adding
// typed helpers next to auth-context.tsx instead of reaching for this.
export { supabase } from './supabase.js';
