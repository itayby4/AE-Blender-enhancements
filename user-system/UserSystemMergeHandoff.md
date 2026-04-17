# PipeFX User System — Merge Handoff Guide

> This guide explains exactly how to merge the `user-system/` staging folder into the main codebase. Every step is surgical and reversible. Read the whole guide before starting.

**Estimated time:** 30–45 minutes  
**Risk level:** Low — the new code is additive. Existing SQLite services and routes are untouched.

---

## Prerequisites

Before merging, you need:

1. **`.env` files populated** — see Step 0 below
2. **Supabase Auth providers configured** — see Step 0 below
3. **The main codebase on a clean git branch** — `git checkout -b feature/user-system`

---

## Step 0: Environment Setup (do this first)

### Backend `.env`

Open `apps/backend/.env` and add these three lines:

```env
SUPABASE_URL=https://hisihmksibzepfurgiup.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpc2lobWtzaWJ6ZXBmdXJnaXVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTIxOTQsImV4cCI6MjA5MTk4ODE5NH0.I7SYO4N-BBHhVw_YhkOHzXBagbNZ0vQuukaRijbDpDk
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpc2lobWtzaWJ6ZXBmdXJnaXVwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQxMjE5NCwiZXhwIjoyMDkxOTg4MTk0fQ.nANXPuKOM0nR8RgjWUCF9DxTX_Dp8ompTFYiZx9V_tg
```

### Desktop `.env`

Create `apps/desktop/.env` (new file):

```env
VITE_SUPABASE_URL=https://hisihmksibzepfurgiup.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhpc2lobWtzaWJ6ZXBmdXJnaXVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTIxOTQsImV4cCI6MjA5MTk4ODE5NH0.I7SYO4N-BBHhVw_YhkOHzXBagbNZ0vQuukaRijbDpDk
```

### Supabase Dashboard: Enable Google OAuth

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → your project
2. Authentication → Providers → Google
3. Enable Google provider
4. Add your Google OAuth credentials (Client ID + Secret from Google Cloud Console)
5. Under **URL Configuration** → **Redirect URLs**, add: `http://localhost:5173` (for dev) and your production URL

> The desktop app uses `window.location.origin` as the redirect. For Tauri production builds, this will be updated to use a deep link — see the "Future: Tauri Deep Link" section at the bottom.

---

## Step 1: Copy New Files

These are entirely new files — just copy them in:

| Source (in `user-system/`) | Destination |
|---|---|
| `apps/backend/src/lib/supabase.ts` | `apps/backend/src/lib/supabase.ts` |
| `apps/backend/src/middleware/auth.ts` | `apps/backend/src/middleware/auth.ts` |
| `apps/desktop/src/lib/supabase.ts` | `apps/desktop/src/lib/supabase.ts` |
| `apps/desktop/src/lib/auth-context.tsx` | `apps/desktop/src/lib/auth-context.tsx` |
| `apps/desktop/src/features/auth/LoginPage.tsx` | `apps/desktop/src/features/auth/LoginPage.tsx` |

```powershell
# From the workspace root:
Copy-Item user-system/apps/backend/src/lib/supabase.ts apps/backend/src/lib/supabase.ts
Copy-Item user-system/apps/backend/src/middleware/auth.ts apps/backend/src/middleware/auth.ts
New-Item -ItemType Directory -Force apps/desktop/src/features/auth
Copy-Item user-system/apps/desktop/src/lib/supabase.ts apps/desktop/src/lib/supabase.ts
Copy-Item user-system/apps/desktop/src/lib/auth-context.tsx apps/desktop/src/lib/auth-context.tsx
Copy-Item user-system/apps/desktop/src/features/auth/LoginPage.tsx apps/desktop/src/features/auth/LoginPage.tsx
```

---

## Step 2: Replace Modified Files

These files have been fully rewritten with the new auth additions:

| Source (in `user-system/`) | Destination | What changed |
|---|---|---|
| `apps/backend/src/config.ts` | `apps/backend/src/config.ts` | +3 Supabase env vars |
| `apps/backend/src/main.ts` | `apps/backend/src/main.ts` | +Auth gate (15 lines), +Authorization in CORS |
| `apps/desktop/src/lib/api.ts` | `apps/desktop/src/lib/api.ts` | +Token injection on every fetch |
| `apps/desktop/src/hooks/useChat.ts` | `apps/desktop/src/hooks/useChat.ts` | +Token injection on SSE fetch |
| `apps/desktop/src/main.tsx` | `apps/desktop/src/main.tsx` | +AuthProvider wrapper |

```powershell
Copy-Item user-system/apps/backend/src/config.ts apps/backend/src/config.ts
Copy-Item user-system/apps/backend/src/main.ts apps/backend/src/main.ts
Copy-Item user-system/apps/desktop/src/lib/api.ts apps/desktop/src/lib/api.ts
Copy-Item user-system/apps/desktop/src/hooks/useChat.ts apps/desktop/src/hooks/useChat.ts
Copy-Item user-system/apps/desktop/src/main.tsx apps/desktop/src/main.tsx
```

---

## Step 3: Patch `app.tsx` — Add Auth Gate

Open `apps/desktop/src/app/app.tsx` and make these two targeted edits:

### 3a. Add imports at the top (after existing imports)

Find the last import line and add after it:

```typescript
import { useAuth } from '../lib/auth-context.js';
import { LoginPage } from '../features/auth/LoginPage.js';
```

### 3b. Add auth gate at the top of the `App` component function

Find the `export function App()` or `export const App = () => {` line.
Inside the function body, **before** any existing `useState`/`useEffect` calls, add:

```typescript
const { user, isLoading } = useAuth();

// Auth gate — show login screen until user is authenticated
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

### 3c. (Optional) Add user email display in TitleBar

In the TitleBar area of `app.tsx`, you can display the user's email and a sign-out button. Find where the TitleBar component is rendered and add a prop or inline element for the user info. Example:

```typescript
// Import signOut from useAuth above
const { user, isLoading, signOut } = useAuth();

// Then in the JSX where TitleBar is rendered, pass user info:
// <TitleBar ... userEmail={user.email} onSignOut={signOut} />
// (Update TitleBar.tsx to accept and render these props)
```

> This is optional for the initial merge. The app works without it — users can sign out from Settings.

---

## Step 4: Patch `SettingsPage.tsx` — Add Account Tab

Open `apps/desktop/src/features/settings/SettingsPage.tsx`.

### 4a. Add import

```typescript
import { useAuth } from '../../lib/auth-context.js';
```

### 4b. Add inside the component

```typescript
const { user, signOut } = useAuth();
```

### 4c. Add an Account section/tab

Find the tabs/sections in SettingsPage and add a new "Account" section:

```tsx
{/* Account section */}
<div className="space-y-3">
  <h3 className="text-sm font-semibold text-foreground">Account</h3>
  <div className="rounded-lg border border-border bg-muted/10 p-4">
    <p className="text-sm text-muted-foreground">Signed in as</p>
    <p className="text-sm font-medium text-foreground mt-0.5">{user?.email}</p>
  </div>
  <button
    onClick={signOut}
    className="w-full h-9 rounded-lg border border-destructive/50 text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors"
  >
    Sign Out
  </button>
</div>
```

---

## Step 5: Verify the `.gitignore`

Make sure these are in `.gitignore` (they almost certainly already are):

```
.env
*.env
apps/backend/.env
apps/desktop/.env
```

---

## Step 6: Build & Verify

```powershell
# From workspace root:
pnpm nx run-many -t build lint typecheck -p @pipefx/backend
pnpm nx run-many -t build lint typecheck -p @pipefx/desktop
```

Expected: **zero new errors**. The SQLite services and routes are untouched, so only the new auth files will be type-checked.

---

## Step 7: Manual End-to-End Test

1. **Start backend** — `pnpm nx serve backend`
2. **Start desktop** — `pnpm nx serve desktop`

Test sequence:

| Action | Expected |
|---|---|
| Open app (not signed in) | Login screen appears |
| Submit form without credentials | "Please enter both email and password" toast |
| Register with email/password | "Check your email to confirm" toast (or auto-login) |
| Sign in with valid credentials | Main PipeFX app loads |
| Use chat, switch projects, use skills | Everything works as before |
| Close and reopen app | Still signed in (session persists) |
| Click Sign Out in Settings | Back to login screen |
| Send request without auth (curl test) | 401 response from backend |

### Curl test for backend auth gate:

```powershell
# Should return 401:
curl http://localhost:3001/api/projects

# Should return project list:
$token = "your-supabase-jwt-here"
curl -H "Authorization: Bearer $token" http://localhost:3001/api/projects
```

---

## What Was NOT Changed

The following are **completely untouched** — verify by diff after merge:

- `apps/backend/src/router.ts`
- `apps/backend/src/routes/*.ts` (all 7 route files)
- `apps/backend/src/services/memory/*.ts` (all 11 SQLite service files)
- `apps/backend/src/utils/settings.ts`
- `apps/desktop/src/hooks/useChatHistory.ts`
- `apps/desktop/src/hooks/useTaskStream.ts`
- `apps/desktop/src/hooks/usePretext.ts`
- All feature components (`ChatPanel`, `ProjectBrain`, `SkillsPage`, etc.)

---

## Future: Tauri Deep Link for Google OAuth (Post-Merge)

For production Tauri builds, the Google OAuth redirect needs to use a deep link (`pipefx://auth/callback`) instead of `window.location.origin`. This requires:

1. **Add `tauri-plugin-deep-link`** to `apps/desktop/src-tauri/Cargo.toml`:
   ```toml
   tauri-plugin-deep-link = { git = "https://github.com/tauri-apps/plugins-workspace" }
   ```

2. **Register protocol** in `apps/desktop/src-tauri/tauri.conf.json`:
   ```json
   "plugins": {
     "deep-link": {
       "desktop": {
         "schemes": ["pipefx"]
       }
     }
   }
   ```

3. **Update `signInWithGoogle`** in `auth-context.tsx`:
   ```typescript
   redirectTo: 'pipefx://auth/callback'
   ```

4. **Listen for deep link** in `auth-context.tsx` using `@tauri-apps/plugin-deep-link`:
   ```typescript
   import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
   
   onOpenUrl(async (urls) => {
     const url = urls[0];
     if (url.startsWith('pipefx://auth/callback')) {
       // Extract tokens from hash fragment and set session
       const hash = new URL(url.replace('pipefx://', 'http://localhost/')).hash;
       const params = new URLSearchParams(hash.slice(1));
       await supabase.auth.setSession({
         access_token: params.get('access_token')!,
         refresh_token: params.get('refresh_token')!,
       });
     }
   });
   ```

This is intentionally deferred — email/password auth works without any of this.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `Missing VITE_SUPABASE_URL` console error | Create `apps/desktop/.env` with the env vars |
| Backend returns 401 for all requests after merge | Check `apps/backend/.env` has `SUPABASE_SERVICE_ROLE_KEY` |
| `createClient is not a function` | Run `pnpm install` — `@supabase/supabase-js` should already be in both package.json files |
| Google OAuth opens browser but doesn't return | Ensure redirect URL is configured in Supabase Dashboard |
| Login screen doesn't appear (goes straight to app) | `AuthProvider` not wrapping `App` in `main.tsx` — recheck Step 2 |
