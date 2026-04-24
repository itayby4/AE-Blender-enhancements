# PipeFX Cloud-API — System Handoff

> **Last updated:** 2026-04-21  
> **Status:** Fully built, tested end-to-end on local dev, ready for production deployment.  
> **Branch:** Working locally on `main` — commit before deploying.

---

## 1. What This Is

The Cloud-API is a **stateless Node.js billing gateway** that sits between the PipeFX desktop app and LLM providers (Gemini, OpenAI, Anthropic). It enables "Cloud Mode" — users without their own API keys can pay with credits instead.

```
┌─────────────────────────────────────────────────────────────┐
│                PipeFX Desktop App (Tauri)                    │
│                                                              │
│   Settings: apiMode = "cloud" | "byok"                      │
│   ┌─────────────────┐     ┌──────────────────────┐         │
│   │   BYOK Mode     │     │   Cloud Mode          │         │
│   │  User's own key │     │  CloudProvider proxy   │         │
│   │  → direct call  │     │  → cloud-api gateway   │         │
│   └────────┬────────┘     └──────────┬─────────────┘         │
│            │                          │                       │
│   Provider SDK (local)       POST /ai/chat (HTTP)            │
│            │                          │                       │
│            ▼                          ▼                       │
│   Gemini/OpenAI/Claude       Cloud-API Gateway (:3002)       │
│                              ┌─────────────────────┐         │
│                              │ 1. Auth (SHA-256)    │         │
│                              │ 2. Rate Limit        │         │
│                              │ 3. Reserve Credits   │         │
│                              │ 4. Proxy → LLM       │         │
│                              │ 5. Settle / Refund   │         │
│                              └──────┬──────────────┘         │
│                                     │                        │
│                         ┌───────────┼───────────┐            │
│                         ▼           ▼           ▼            │
│                     Supabase     Gemini     OpenAI/Claude     │
│                    (billing)    (server     (server keys)     │
│                                  keys)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
apps/cloud-api/
├── .env                        # Local dev credentials (gitignored)
├── Dockerfile                  # Production container
├── package.json                # Nx targets: build, serve
├── tsconfig.app.json           # TypeScript config
└── src/
    ├── config.ts               # Env var loading + fail-fast validation
    ├── main.ts                 # HTTP server, routing, request lifecycle
    ├── lib/
    │   ├── auth.ts             # SHA-256 device token verification
    │   ├── pricing.ts          # Supabase pricing cache (5-min TTL)
    │   ├── rate-limit.ts       # In-memory sliding window (60 req/min)
    │   ├── supabase.ts         # Supabase client (service role)
    │   └── tui.ts              # Terminal dashboard (dev monitoring)
    └── services/
        ├── billing.ts          # Reserve → Settle → Refund saga
        └── proxy.ts            # Server-side LLM provider proxy
```

---

## 3. Request Lifecycle

Every `POST /ai/chat` follows this exact sequence:

```
1. CORS check         → Restrict to known origins
2. Auth               → SHA-256 hash device token, lookup in device_tokens table
3. Rate limit         → Sliding window: 60 req/min per device
4. Balance check      → profiles.credits_balance - profiles.held_credits > 0
5. Estimate & Reserve → Estimate max cost, atomically hold credits (RPC)
6. Stream proxy       → Forward to LLM provider using server-side API keys
7a. Settle            → Debit actual cost, release hold excess (RPC)
7b. Refund            → If proxy fails, release entire hold (RPC)
8. Log usage          → Insert into usage_logs with retry (idempotent)
```

### Compensating Transaction Pattern

Credits are **never lost** due to the saga pattern:

| Scenario | Hold | Debit | Net Effect |
|----------|------|-------|------------|
| LLM succeeds, 50% of estimate used | Released | Actual cost | User pays exact cost |
| LLM fails (503, timeout) | Released | None | User gets full refund |
| Client disconnects mid-stream | Released | Actual (if any usage) | Fair billing |
| Server crashes | Hold remains | None | Held credits stay locked until manual cleanup |

---

## 4. Supabase Schema

### Migration: `supabase/migrations/002_credits_and_usage.sql`

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `profiles` | User billing state | `credits_balance`, `held_credits`, `plan` |
| `credit_transactions` | Append-only ledger | `amount`, `type`, `idempotency_key` |
| `device_tokens` | Desktop ↔ cloud auth | `token_hash` (SHA-256), `expires_at`, `revoked_at` |
| `model_pricing` | Per-model USD pricing | `input_per_1m`, `output_per_1m`, `thinking_per_1m` |
| `usage_logs` | Every LLM call | `input_tokens`, `output_tokens`, `cost_usd`, `credits_debited` |
| `products` | Credit packages for sale | `credits_amount`, `price_usd`, `stripe_price_id` |
| `stripe_events` | Webhook idempotency | `id` (evt_xxx), `processed` |

### Atomic RPC Functions

All credit mutations go through Postgres functions (never direct UPDATE):

| Function | Purpose | Safety |
|----------|---------|--------|
| `reserve_credits(user_id, amount)` | Hold credits pre-request | Checks `balance - held >= amount` |
| `settle_credits(user_id, reserved, actual, ...)` | Release hold + debit actual | `LEAST(actual, balance)` prevents CHECK violation |
| `release_hold(user_id, amount)` | Compensate on failure | `GREATEST(0, held - amount)` |
| `debit_credits(user_id, amount, ...)` | Direct debit (purchases) | Raises exception if insufficient |
| `credit_credits(user_id, amount, ...)` | Add credits (purchases/promos) | Always succeeds |

### Row-Level Security (RLS)

- Users see only their own data via `auth.uid()`.
- Service role (cloud-api) bypasses RLS for billing operations.
- `stripe_events` has no public policy (service role only).

---

## 5. Desktop Integration

### Mode Switching

```
apps/backend/src/utils/settings.ts  → AppSettings: apiMode, cloudApiUrl, deviceToken
apps/backend/src/routes/misc.ts     → Hot-reload agent on settings save
apps/backend/src/main.ts            → Initial agent creation reads from settings
```

### CloudProvider (`packages/providers/src/lib/llm/cloud.ts`)

Implements the `Provider` interface (same as Gemini/OpenAI/Anthropic). The agent loop doesn't know it's going through a proxy.

```typescript
class CloudProvider implements Provider {
  detectProvider(model)  // gpt* → openai, claude* → anthropic, else → gemini
  chat(params)           // POST /ai/chat, parse JSON response
  chatStream(params)     // POST /ai/chat, parse SSE stream
  continueWithToolResults(params)       // Same, with tool results
  continueWithToolResultsStream(params) // Same, streaming
}
```

### Agent Model Resolution (`packages/ai/src/lib/agent.ts`)

```typescript
function resolveProvider(config, providerOverride?) {
  if (config.cloudConfig) {
    // Cloud Mode: all models route through CloudProvider
    const modelMap = {
      'claude-opus-4.6':   'claude-opus-4-6-20260401',
      'claude-sonnet-4.6': 'claude-sonnet-4-6-20260201',
    };
    const selectedModel = providerOverride
      ? (modelMap[providerOverride] ?? providerOverride)
      : config.model;
    return { provider: new CloudProvider(config.cloudConfig), model: selectedModel };
  }
  // BYOK Mode: direct provider construction (unchanged)
}
```

### Settings UI (`apps/desktop/src/features/settings/SettingsPage.tsx`)

`ApiModeSection` component provides:
- BYOK ↔ Cloud toggle cards
- Device token input
- Cloud API URL input
- Real-time credit balance display (fetched from cloud-api `/balance`)

---

## 6. Security Hardening

The following protections are implemented:

| ID | Category | Protection |
|----|----------|-----------|
| CRIT-3 | CORS | Restricted to `tauri://localhost`, `http://localhost:1420`, `https://app.pipefx.com` |
| CRIT-5 | Input | Server-side provider resolution — never trust client's `provider` field |
| HIGH-3 | Data | Usage log insert with 2-attempt retry to prevent silent data loss |
| HIGH-5 | Streaming | Client disconnect detection, proxy abort, proper settle/refund |
| MED-4 | Streaming | `res.destroyed` check before SSE writes |
| MED-7 | Startup | Fail-fast if `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or all API keys are missing |
| LOW-1 | Headers | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` |
| INFRA-2 | Shutdown | SIGTERM/SIGINT graceful shutdown with 10s timeout |

### Payload Protection

- **Max body size**: 50 MB (generous for base64-encoded images in visual design workflows)
- **Body streaming**: Chunks are accumulated with size tracking; connection destroyed if exceeded
- **`headersSent`** guard on all JSON responses to prevent double-write crashes

### Token Security

- Device tokens are **never stored in plaintext** — only SHA-256 hashes
- Tokens are shown to the user once at creation, then forgotten by the server
- Expired and revoked tokens are rejected at query time (`WHERE revoked_at IS NULL`)

---

## 7. Environment Variables

### `apps/cloud-api/.env`

```bash
# Required
SUPABASE_URL=https://hisihmksibzepfurgiup.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# At least one required
GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional (defaults shown)
PORT=3002
RATE_LIMIT_RPM=60
MAX_TOKENS_PER_DEVICE=10
MAX_OUTPUT_ESTIMATE=8192
```

### `apps/desktop/.env` (existing)

```bash
VITE_SUPABASE_URL=https://hisihmksibzepfurgiup.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### `apps/backend/.env` (existing)

```bash
# Standard BYOK keys (unchanged)
GEMINI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 8. Running Locally

### All three services

```powershell
# Terminal 1: Cloud-API with TUI dashboard
pnpm nx serve cloud-api

# Terminal 2: Backend
pnpm nx serve backend

# Terminal 3: Desktop (Tauri)
pnpm nx serve desktop
```

### Test endpoints

```powershell
# Health check
Invoke-RestMethod http://localhost:3002/health

# Pricing table
Invoke-RestMethod http://localhost:3002/pricing

# Balance (authenticated)
Invoke-RestMethod http://localhost:3002/balance -Headers @{ Authorization = "Bearer test-dev-token-123" }
```

### TUI Dashboard

The cloud-api includes a rich terminal UI that displays:
- **Startup banner**: Server URL, Supabase status, provider availability
- **Per-request log**: Method, path, auth status, rate limit, billing events, LLM proxy metrics
- **Provider badges**: Color-coded (Gemini=blue, OpenAI=green, Claude=yellow)
- **Stats summary**: Every 10 requests — uptime, totals, sparkline RPM, provider breakdown

---

## 9. Deployment

### Railway (recommended)

```bash
# The Dockerfile is ready at apps/cloud-api/Dockerfile
# Deploy steps:
# 1. Create a Railway project
# 2. Connect the repo
# 3. Set root directory to apps/cloud-api
# 4. Set env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, etc.)
# 5. Deploy
```

### Production Checklist

- [ ] Set `ALLOWED_ORIGINS` to include your production domain
- [ ] Ensure `model_pricing` table has up-to-date prices
- [ ] Create device tokens for beta testers via Supabase SQL editor
- [ ] Seed test credits via: `UPDATE profiles SET credits_balance = 100000 WHERE id = '...'`
- [ ] Monitor `credit_transactions` and `usage_logs` tables
- [ ] Set up Stripe webhook for credit purchases (not yet implemented)

---

## 10. Known Limitations & Future Work

| Item | Status | Notes |
|------|--------|-------|
| Stripe payment integration | Not started | `products` and `stripe_events` tables are ready |
| Usage dashboard (desktop) | Not started | Data exists in `usage_logs`; needs frontend |
| Reconciliation query | Not started | Verify `credits_balance = SUM(credit_transactions.amount)` |
| Multi-region deployment | Not started | Cloud-API is stateless — just deploy to multiple regions |
| Production logging | Partial | TUI is dev-only; add structured JSON logging for production |
| Crash recovery (held credits) | Manual | If server crashes during a request, `held_credits` stays locked — needs a periodic sweeper |
| Token rotation UI | Not started | Users can create/revoke tokens in Supabase; needs desktop UI |

---

## 11. Testing Device Token

For local development, a test token was created:

```
Plaintext: test-dev-token-123
User:      06701a3e-993c-4a6e-9a8d-98f55fbe1c19
Credits:   100,000 (seeded manually)
```

To create new tokens, run in Supabase SQL editor:

```sql
INSERT INTO public.device_tokens (user_id, token_hash, name)
VALUES (
  'YOUR_USER_UUID',
  encode(sha256('your-secret-token'::bytea), 'hex'),
  'Device Name'
);
```

---

## 12. Key Design Decisions

1. **Thin proxy, not a full backend**: The cloud-api only handles auth + billing + LLM forwarding. The agent loop, MCP connectors, and tool execution all remain on the desktop. This keeps latency low and avoids duplicating the agent architecture.

2. **Server-side provider resolution**: The `provider` field sent by the client is ignored. The server derives it from the model name (`resolveProviderFromModel`). This prevents a malicious client from sending `provider: cheapModel` with `model: expensiveModel` to game billing.

3. **Atomic RPC for all credit mutations**: No direct `UPDATE profiles SET credits_balance = ...` anywhere. All mutations go through Postgres functions that use row-level locking and atomic operations. The `settle_credits` function uses `LEAST(actual, balance)` to prevent the CHECK constraint from failing (which would leak the hold and give free usage).

4. **Idempotency on everything**: Every billing transaction has an idempotency key (`userId:sessionId:requestId:roundIndex`). Both the `credit_transactions` and `usage_logs` tables have `UNIQUE(idempotency_key)` constraints, so retries are safe.

5. **SSE streaming, not WebSocket**: The cloud-api uses Server-Sent Events for the LLM proxy, matching how the providers already work. This keeps the protocol simple and HTTP-based.
