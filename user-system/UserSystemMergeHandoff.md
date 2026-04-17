# PipeFX User System — Merge Guide

> How to integrate the Supabase auth system into PipeFX from a clean `main` branch.  
> All required files live in the `user-system/` folder. No code needs to be written — just copy, configure, and verify.

---

## What This Adds

- **Login/Register page** — email/password + Google OAuth, shown before the main app
- **Backend auth gate** — every HTTP request verified via Supabase JWT (401 if invalid)
- **Token injection** — all frontend API calls automatically include `Authorization: Bearer <token>`
- **Account settings tab** — profile info, display name, password change, sign out
- **Anti-lock-in** — only 2 files import `@supabase/supabase-js` directly; everything else uses a wrapper

**What stays the same:** All SQLite services, routes, memory engine, task manager, chat, skills, projects — completely untouched. Supabase is auth-only.

---

## File Inventory

The `user-system/` folder contains 14 files. Each either **replaces** an existing file or is **new**.

### New Files (copy directly — no conflicts)

| File | Purpose |
|---|---|
| `apps/backend/src/lib/supabase.ts` | Admin Supabase client for JWT verification |
| `apps/backend/src/middleware/auth.ts` | `verifyAuth()` — extracts + validates JWT from headers |
| `apps/backend/.env.example` | Backend env template |
| `apps/desktop/src/lib/supabase.ts` | Browser Supabase client singleton |
| `apps/desktop/src/lib/auth-context.tsx` | React auth context, `useAuth()` hook, `getAccessToken()` |
| `apps/desktop/src/features/auth/LoginPage.tsx` | Login/register UI |
| `apps/desktop/.env.example` | Desktop env template |

### Replacement Files (overwrite existing)

| File | What changed vs. main |
|---|---|
| `apps/backend/src/config.ts` | +3 Supabase env vars (`supabaseUrl`, `supabaseAnonKey`, `supabaseServiceKey`) |
| `apps/backend/src/main.ts` | +`verifyAuth` import, +`Authorization` in CORS headers, +auth gate before router (~15 lines) |
| `apps/desktop/src/lib/api.ts` | +`getAccessToken` import, +`Authorization: Bearer` header on every fetch |
| `apps/desktop/src/hooks/useChat.ts` | +`getAccessToken` import, +token header on SSE `/chat/stream` fetch |
| `apps/desktop/src/main.tsx` | +`AuthProvider` wrapping `<App />`, +`<Toaster />` at root level |
| `apps/desktop/src/app/app.tsx` | +`useAuth` import, +auth gate (loading spinner → login page → main app) |
| `apps/desktop/src/features/settings/SettingsPage.tsx` | +Account tab (profile, display name, password change, sign out) |

---

## Step 1: Create a Branch

```powershell
git checkout main
git pull
git checkout -b feature/user-system
```

---

## Step 2: Copy New Files

```powershell
# From workspace root — create directories first
New-Item -ItemType Directory -Force apps/backend/src/lib
New-Item -ItemType Directory -Force apps/backend/src/middleware
New-Item -ItemType Directory -Force apps/desktop/src/features/auth

# Copy new files
Copy-Item user-system/apps/backend/src/lib/supabase.ts       apps/backend/src/lib/supabase.ts
Copy-Item user-system/apps/backend/src/middleware/auth.ts     apps/backend/src/middleware/auth.ts
Copy-Item user-system/apps/desktop/src/lib/supabase.ts        apps/desktop/src/lib/supabase.ts
Copy-Item user-system/apps/desktop/src/lib/auth-context.tsx   apps/desktop/src/lib/auth-context.tsx
Copy-Item user-system/apps/desktop/src/features/auth/LoginPage.tsx apps/desktop/src/features/auth/LoginPage.tsx
```

---

## Step 3: Replace Modified Files

```powershell
# Backend
Copy-Item user-system/apps/backend/src/config.ts  apps/backend/src/config.ts -Force
Copy-Item user-system/apps/backend/src/main.ts     apps/backend/src/main.ts -Force

# Desktop
Copy-Item user-system/apps/desktop/src/lib/api.ts       apps/desktop/src/lib/api.ts -Force
Copy-Item user-system/apps/desktop/src/hooks/useChat.ts  apps/desktop/src/hooks/useChat.ts -Force
Copy-Item user-system/apps/desktop/src/main.tsx          apps/desktop/src/main.tsx -Force
Copy-Item user-system/apps/desktop/src/app/app.tsx       apps/desktop/src/app/app.tsx -Force
Copy-Item user-system/apps/desktop/src/features/settings/SettingsPage.tsx apps/desktop/src/features/settings/SettingsPage.tsx -Force
```

> **⚠ Important:** If `app.tsx` or `SettingsPage.tsx` have been modified on `main` since this user-system was created, you'll need to manually re-apply the auth changes instead of overwriting. The key changes are documented in the "Manual Patch Reference" section at the bottom.

---

## Step 4: Set Up Environment Variables

### Backend — append to `apps/backend/.env`:

```env
# Supabase Auth — grab these from: Supabase Dashboard → Settings → API
SUPABASE_URL=<your-project-url>
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

> **Never commit real values.** The service_role key bypasses RLS — treat it like a root password. Keep `.env` out of git (it's already gitignored).

### Desktop — create `apps/desktop/.env`:

```env
VITE_SUPABASE_URL=<your-project-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### Verify `.gitignore` includes:
```
.env
apps/backend/.env
apps/desktop/.env
```

---

## Step 5: Supabase Dashboard Setup

Go to [supabase.com/dashboard](https://supabase.com/dashboard) → your project.

1. **Authentication → Providers → Email:**
   - Ensure email provider is enabled
   - **Disable "Confirm email"** for development (avoids rate limit issues)

2. **Authentication → Providers → Google** (optional):
   - Enable Google provider
   - Add Google OAuth credentials (from Google Cloud Console)

3. **Authentication → URL Configuration → Redirect URLs:**
   - Add: `http://localhost:4200`
   - Add: `http://localhost:5173`
   - Add your production URL when deployed

---

## Step 6: Install Dependencies

`@supabase/supabase-js` should already be in both `package.json` files. If not:

```powershell
cd apps/backend && pnpm add @supabase/supabase-js && cd ../..
cd apps/desktop && pnpm add @supabase/supabase-js && cd ../..
```

---

## Step 7: Build & Verify

```powershell
pnpm nx run-many -t build lint typecheck -p @pipefx/backend
pnpm nx run-many -t build lint typecheck -p @pipefx/desktop
```

Expected: zero new errors.

---

## Step 8: Test

```powershell
pnpm nx serve backend
pnpm nx serve desktop   # in a second terminal
```

| Test | Expected Result |
|---|---|
| Open app (not signed in) | Login screen with PipeFX logo |
| Click "Sign up", create account | Success toast, auto-login |
| Sign in with email/password | Main PipeFX app loads |
| Use chat, skills, projects | Everything works identically |
| Settings → Account tab | Shows email, display name, password change, sign out |
| Click "Sign Out" | Returns to login screen |
| Close & reopen app | Still signed in (session persists) |
| `curl http://localhost:3001/api/projects` | Returns 401 (no auth header) |

---

## Step 9: Commit

```powershell
git add -A
git commit -m "feat: add Supabase auth gate + login UI + account settings"
```

---

## What Was NOT Changed

These files are identical to `main` — zero modifications:

- `apps/backend/src/router.ts`
- `apps/backend/src/routes/*.ts` (all 7 route handlers)
- `apps/backend/src/services/memory/*.ts` (all SQLite service files)
- `apps/backend/src/utils/settings.ts`
- `apps/desktop/src/hooks/useChatHistory.ts`
- `apps/desktop/src/hooks/useTaskStream.ts`
- All other feature components (ChatPanel, ProjectBrain, SkillsPage, etc.)

---

## Manual Patch Reference

If `app.tsx` or `SettingsPage.tsx` have diverged from the versions in `user-system/` — for example, if new features were added on `main` after this user-system was created — apply these changes manually instead of overwriting:

### app.tsx — 2 edits

**Edit 1: Add imports** (after the last existing import):
```typescript
import { useAuth } from '../lib/auth-context.js';
import { LoginPage } from '../features/auth/LoginPage.js';
```

**Edit 2: Add auth gate** (first thing inside `export function App() {`, before any `useState`):
```typescript
// ── Auth Gate ──
const { user, isLoading } = useAuth();

if (isLoading) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
if (!user) {
  return <LoginPage />;
}
```

### SettingsPage.tsx — 3 edits

**Edit 1: Add imports** (at the top):
```typescript
import { useCallback } from 'react';  // add to existing react import
import { User, LogOut, Mail, Lock, Check } from 'lucide-react';  // add to existing lucide import
import { useAuth } from '../../lib/auth-context.js';
import { supabase } from '../../lib/supabase.js';
import { toast } from 'sonner';
```

**Edit 2: Add Account to the Tab type and tabs array:**
```typescript
type Tab = 'account' | 'appearance' | 'api-keys' | 'about';
// Default tab:
const [activeTab, setActiveTab] = useState<Tab>('account');
// In the tabs array, add as first entry:
{ id: 'account', label: 'Account', icon: User },
```

**Edit 3: Add Account tab content** (before the Appearance tab in the JSX):
```tsx
{activeTab === 'account' && (
  <AccountTab />
)}
```

**Edit 4: Add the `AccountTab` component** at the bottom of the file (the full component is in the `user-system/` version).

### main.tsx — 2 edits

**Edit 1: Add imports:**
```typescript
import { AuthProvider } from './lib/auth-context';
import { Toaster } from './components/ui/sonner';
```

**Edit 2: Wrap App:**
```tsx
<AuthProvider>
  <App />
  <Toaster />
</AuthProvider>
```

---

## Architecture Notes

- **Anti-lock-in:** Only `lib/supabase.ts` (2 files) imports `@supabase/supabase-js`. The rest of the app uses the `auth-context.tsx` wrapper. Swapping to Auth.js / Clerk / etc. only requires changing these 2 files.
- **Supabase is auth-only.** No project data, knowledge, sessions, or settings are stored in Supabase.
- **SQLite remains the data layer.** All local data is unchanged.

## Future: Tauri Deep Link for Google OAuth

For production Tauri builds, Google OAuth needs a `pipefx://auth/callback` deep link instead of `window.location.origin`. This requires `tauri-plugin-deep-link`. See implementation notes in `HANDOFF.md`.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `Missing VITE_SUPABASE_URL` | Create `apps/desktop/.env` with the Vite env vars |
| Backend 401 on all requests | Check `apps/backend/.env` has `SUPABASE_SERVICE_ROLE_KEY` |
| `createClient is not a function` | Run `pnpm install` |
| Google OAuth doesn't return | Configure redirect URL in Supabase Dashboard |
| Login screen skipped | Ensure `<AuthProvider>` wraps `<App />` in `main.tsx` |
| Toasts don't appear on login | Ensure `<Toaster />` is in `main.tsx` (not inside App) |
| "Email rate limit exceeded" | Disable email confirmation in Supabase Dashboard, or wait 1 hour |
| Password too short error | Supabase requires minimum 6 characters |
