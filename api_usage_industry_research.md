# API Usage Calculation — Industry Research

> Comprehensive analysis of how 15+ major products calculate, track, and bill AI/LLM API usage.
> Research conducted April 2026 to inform PipeFX's credit-based billing system design.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Layer 1: LLM Provider APIs — Token Reporting](#layer-1-llm-provider-apis)
3. [Layer 2: AI Gateway Proxies — Usage Metering](#layer-2-ai-gateway-proxies)
4. [Layer 3: Observability Platforms — Cost Attribution](#layer-3-observability-platforms)
5. [Layer 4: Consumer Products — Billing Models](#layer-4-consumer-products)
6. [Layer 5: Billing Infrastructure — Payment & Metering](#layer-5-billing-infrastructure)
7. [Layer 6: Framework SDKs — Developer Ergonomics](#layer-6-framework-sdks)
8. [Universal Patterns — What Everyone Does](#universal-patterns)
9. [Comparative Analysis — Billing Model Matrix](#comparative-analysis)
10. [Anti-Patterns & Cautionary Tales](#anti-patterns)
11. [Recommendations for PipeFX](#recommendations-for-pipefx)

---

## Executive Summary

After analyzing 15+ products across 6 layers of the AI billing stack, **7 universal truths** emerge:

| # | Pattern | Adopted By |
|---|---------|-----------|
| 1 | **Token counts come from the provider response, never estimated** | OpenAI, Anthropic, Google, OpenRouter, Helicone, Langfuse, Vercel AI SDK |
| 2 | **Input and output tokens are tracked separately** (different prices) | Every single product |
| 3 | **Usage is logged per-request with immutable records** | OpenRouter, LiteLLM, Portkey, Helicone, Langfuse, OpenMeter, Stripe |
| 4 | **Credits/balance is debited atomically after the LLM call completes** | Cursor, Replit, v0, OpenRouter |
| 5 | **A proxy/gateway layer is the natural point for metering** | OpenRouter, LiteLLM, Portkey, Helicone, Vercel AI Gateway |
| 6 | **Pre-authorization holds prevent overspending in concurrent scenarios** | Stripe, credit card industry pattern |
| 7 | **BYOK bypasses credits entirely** | Cursor, Antigravity, Windsurf |

> [!IMPORTANT]
> The industry has converged on a clear architecture: **Provider → Gateway/Proxy → Usage Log → Credit Ledger → Billing**. No successful product tries to estimate tokens client-side for billing purposes. The provider's reported `usage` object is always the source of truth.

---

## Layer 1: LLM Provider APIs

### How Each Provider Reports Token Usage

Every major LLM provider returns actual token counts in their API responses. This is the foundational data source for all billing systems.

#### OpenAI API

```json
// Non-streaming: usage is in the response body
{
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 18,
    "total_tokens": 60
  }
}

// Streaming: must opt-in with stream_options
{
  "stream_options": { "include_usage": true }
}
// → Final SSE chunk contains the usage object
```

**Key details:**
- Streaming does **not** include usage by default — you must set `stream_options.include_usage = true`
- The `usage` object appears only in the **final chunk** of the stream
- Includes `prompt_tokens`, `completion_tokens`, `total_tokens`
- For reasoning models, includes `completion_tokens_details.reasoning_tokens`

#### Anthropic (Claude) API

```json
// Response includes usage at the top level
{
  "usage": {
    "input_tokens": 25,
    "output_tokens": 150
  }
}

// Streaming: finalMessage() contains usage
// stream.finalMessage().usage → { input_tokens, output_tokens }
```

**Key details:**
- Always returns `input_tokens` and `output_tokens`
- Provides a free `count_tokens` endpoint (`/v1/messages/count_tokens`) for pre-flight estimation
- Some system tokens are added by Anthropic internally but are **not** billed
- Streaming: `stream.finalMessage()` contains the full usage breakdown

#### Google Gemini API

```json
// Response includes usageMetadata
{
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 25,
    "thoughtsTokenCount": 150,
    "totalTokenCount": 185
  }
}
```

**Key details:**
- Field names differ from OpenAI/Anthropic: `promptTokenCount`, `candidatesTokenCount`
- Includes `thoughtsTokenCount` for "thinking" models — this is separate from output tokens
- Streaming: metadata typically appears **only in the final chunk**
- Free `models.countTokens` method available for pre-flight estimation
- Occasional discrepancies between reported metadata and actual billing during preview phases

### Provider Comparison Table

| Feature | OpenAI | Anthropic | Google Gemini |
|---|---|---|---|
| **Usage field name** | `usage` | `usage` | `usageMetadata` |
| **Input field** | `prompt_tokens` | `input_tokens` | `promptTokenCount` |
| **Output field** | `completion_tokens` | `output_tokens` | `candidatesTokenCount` |
| **Thinking/reasoning** | `reasoning_tokens` | N/A | `thoughtsTokenCount` |
| **Streaming support** | Opt-in (`stream_options`) | `finalMessage()` | Final chunk only |
| **Free token counter** | ❌ (use `tiktoken` locally) | ✅ (`/count_tokens`) | ✅ (`countTokens`) |
| **Cached token tracking** | ✅ `cached_tokens` | ✅ (prompt caching) | ✅ (context caching) |

> [!TIP]
> **For PipeFX:** All three providers we support return actual token counts. We just need to extract them from the response objects — currently we ignore them entirely in all three provider implementations.

---

## Layer 2: AI Gateway Proxies

These products sit between your application and LLM providers, intercepting every request to meter usage.

### OpenRouter

**Architecture:** Unified API gateway routing to 200+ models across all providers.

**How it works:**
1. User deposits credits (prepaid balance denominated in USD)
2. Every API request is routed through OpenRouter's proxy
3. Response includes detailed usage metadata: token counts, cost breakdown, provider info
4. Credits are debited per-request based on **actual** provider pricing
5. Precise usage stats available asynchronously via `/generation/:id` endpoint

**Key innovations:**
- Uses **native tokenizers** for each model (not estimation) for accurate counts
- Privacy-first: logs only metadata by default, not prompt/completion text
- Immediate usage in response + async finalized counts via generation ID
- Transparent pricing: shows exact cost per request aligned to provider pricing

### LiteLLM

**Architecture:** Open-source proxy, OpenAI-compatible API for 100+ providers.

**How it works:**
1. Configure `litellm_config.yaml` with models, providers, and PostgreSQL backend
2. All requests flow through the proxy
3. Automatic token tracking + cost calculation per request
4. Cost attribution by: model, API key, user, or team
5. Built-in budget enforcement: blocks requests when limits exceeded

**Key innovations:**
- **Virtual keys** with per-key budget limits
- PostgreSQL-backed usage logging for persistence
- Built-in web UI dashboard for real-time monitoring
- Budget guardrails — can **pre-emptively block** requests before they hit the provider

### Portkey

**Architecture:** Enterprise AI gateway with 1600+ models, SOC2 compliant.

**How it works:**
1. Secure vault stores all provider API keys
2. Issues **virtual keys** to developers — they never see raw provider credentials
3. Every request logged with full telemetry (tokens, cost, latency, errors)
4. Budget limits enforceable per user, team, or department
5. RBAC (Role-Based Access Control) for enterprise governance

**Key innovations:**
- **Virtual key abstraction** — developers use Portkey keys, never raw provider keys
- Automatic retries, fallbacks, and load balancing across providers
- Semantic caching to reduce redundant LLM calls
- Real-time guardrails (50+ pre-built safety checks on inputs/outputs)

### Helicone

**Architecture:** LLM observability proxy — zero-code integration via URL swap.

**How it works:**
1. Change your OpenAI `baseURL` to `https://oai.helicone.ai/v1`
2. Add `Helicone-Auth` header with your Helicone API key
3. Every request automatically logged with token counts and costs
4. Per-user attribution via `Helicone-User-Id` header
5. Session tracking via `Helicone-Session-Id` header

**Key innovations:**
- **Zero-code integration** — just change `baseURL` and add headers
- **Per-user cost attribution** with a single header (`Helicone-User-Id`)
- Custom properties for arbitrary segmentation (`Helicone-Property-*`)
- Rate limiting enforceable per-user at the gateway level
- Session-level cost grouping for multi-turn conversations

### Gateway Proxy Comparison

| Feature | OpenRouter | LiteLLM | Portkey | Helicone |
|---|---|---|---|---|
| **Primary role** | API aggregator | Dev proxy | Enterprise gateway | Observability |
| **Self-hostable** | ❌ | ✅ (OSS) | ✅ | ✅ |
| **User attribution** | Account-level | Per virtual key | Per virtual key + RBAC | Per-request header |
| **Budget enforcement** | Account balance | Per key/user/team | Per department | Rate limiting |
| **Integration effort** | API key swap | Config + deploy | SDK or URL swap | URL swap + headers |
| **Storage backend** | Proprietary | PostgreSQL | Proprietary | Proprietary/ClickHouse |
| **Best for** | Multi-provider routing | Self-hosted proxy | Enterprise governance | Drop-in observability |

> [!IMPORTANT]
> **For PipeFX:** The gateway proxy pattern is the most relevant. Our planned `cloud-api` IS essentially a custom gateway proxy — it receives requests, checks credits, forwards to providers, logs usage, and debits credits. We're building a purpose-built version of what these tools do generically.

---

## Layer 3: Observability Platforms

### Langfuse

**Architecture:** Open-source LLM engineering platform (MIT license).

**How it tracks costs:**
1. **Automatic inference:** For known models, Langfuse calculates costs from the model name + token counts
2. **Explicit ingestion:** Alternatively, you forward the provider's `usage` object directly
3. **Trace-level aggregation:** Groups all LLM calls within a single agent "trace" (multi-step workflows)
4. **Filtering:** Dashboard shows costs by model, user, session, or custom dimension

**Key innovations for PipeFX:**
- **Trace concept:** A single user request → multiple LLM calls → single traced "interaction" with aggregated cost. This maps perfectly to PipeFX's agent tool-call loop where one user message triggers multiple LLM calls.
- **Self-hostable:** MIT license, can be deployed alongside our infrastructure
- **Evaluation integration:** Uses traces for building evaluation datasets

### OpenTelemetry (OTEL) for LLMs

An emerging industry standard approach where LLM calls are instrumented as "spans" in distributed traces:
- Each LLM call = one span with token counts as span attributes
- Spans are grouped into traces (one per user request)
- Exported to any OTEL-compatible backend (Jaeger, Datadog, etc.)
- Provides both observability AND billing data from a single source

> [!TIP]
> **For PipeFX:** The "trace" concept (one user message = many LLM calls = one billable interaction) is something we MUST implement. A billing system that only counts per-call will undercount multi-turn agent loops.

---

## Layer 4: Consumer Products

### Cursor (AI Code Editor)

**Billing model:** Subscription + credit pool + BYOK

| Aspect | Detail |
|---|---|
| **Base** | Fixed monthly fee ($20-40/mo) |
| **Included** | Monthly credit pool (dollar-denominated) |
| **Metering** | Actual token usage × model-specific pricing |
| **Model weighting** | Frontier models (Claude Opus, GPT-4) cost more credits per token |
| **Auto mode** | Cost-efficient model selection (marketed as "unlimited" for simple tasks) |
| **Overages** | Pay-as-you-go at same rates as base consumption |
| **BYOK** | ✅ Bypasses credit system; pay provider directly |
| **Enterprise** | Shared usage pools + per-member analytics |

**Key insight:** Cursor's "Auto mode" is brilliant — it routes simple requests to cheap models automatically. This removes the "fear of burning credits" anxiety while still offering frontier models when users explicitly select them.

### Windsurf (Codeium)

**Billing model:** Quota-based (post-March 2026 overhaul)

| Aspect | Detail |
|---|---|
| **Base** | Subscription tiers with daily + weekly refreshing quotas |
| **Previous** | Was credit-based, abandoned due to user confusion |
| **Metering** | Model choice + task complexity determine quota consumption |
| **Overages** | Purchasable "extra usage" at API pricing rates |
| **Key change** | Moved AWAY from credits to quotas for predictability |

**Key insight:** Windsurf **abandoned credits** in favor of quotas because users found credit consumption unpredictable. Their lesson: if you use credits, you MUST provide clear visibility into what's being consumed and why.

### GitHub Copilot

**Billing model:** Subscription with token-based guardrails (transitioning)

| Aspect | Detail |
|---|---|
| **Base** | Fixed monthly fee (Pro: $10, Pro+: $39) |
| **Current limits** | Session + weekly token caps with model multipliers |
| **Direction** | Transitioning toward formal token-based billing |
| **Crisis (Apr 2026)** | Paused new signups due to unsustainable costs from agentic workflows |
| **GitHub Models** | Separate service with formal metered billing ($0.00001/token unit) |

**Key insight:** GitHub Copilot is a cautionary tale. Fixed-price subscriptions cannot sustain agentic AI workloads where a single session can trigger dozens of LLM calls. They're being forced to transition to token-based billing.

### Replit

**Billing model:** Effort-based credits (shared pool)

| Aspect | Detail |
|---|---|
| **Base** | Subscription + monthly credit allotment |
| **Metering** | "Effort-based" — scales with task complexity |
| **Effort modes** | Economy, Power, Turbo (different credit consumption rates) |
| **Agent sessions** | Can run up to 200 minutes autonomously |
| **Pool** | Credits are SHARED across AI, compute, hosting, storage |
| **Overages** | No hard cap — overage billed to payment method |

**Key insight:** Replit's shared credit pool (AI + compute + hosting) is controversial. Users complain about AI usage eating into their deployment budget. **PipeFX should keep AI credits separate from any future compute/hosting credits.**

### v0 (Vercel)

**Billing model:** Dollar-denominated credits

| Aspect | Detail |
|---|---|
| **Base** | Free tier + paid plans with monthly credit allotment |
| **Metering** | Input tokens + output tokens × model-specific pricing |
| **Models** | Mini, Pro, Max with different per-token costs |
| **Rollover** | Unused credits roll over (expire after ~65 days) |
| **Optimization** | "Cached tokens" reduce costs for large projects |

### Bolt.new

**Billing model:** Raw token allowances

| Aspect | Detail |
|---|---|
| **Base** | Tiered plans with monthly token allocations (1M free, 10M+ paid) |
| **Metering** | Raw token count (simpler than dollar conversion) |
| **Daily caps** | Free plan has 300k tokens/day hard limit |
| **Rollover** | Tokens roll over for one month |
| **Context** | Larger projects = more tokens per message (project-aware) |

**Key insight:** Bolt.new exposes raw token counts rather than converting to credits/dollars. This is more transparent but requires users to understand what "1 million tokens" means. For a creative professional audience (PipeFX), dollar-denominated credits are likely more intuitive.

### Consumer Product Comparison

| Product | Unit | Refill | BYOK | Overages | Model-weighted |
|---|---|---|---|---|---|
| **Cursor** | $ credits | Monthly pool | ✅ | Pay-as-you-go | ✅ |
| **Windsurf** | Quotas | Daily/weekly refresh | ❌ | Purchasable | ✅ |
| **Copilot** | Token caps | Session/weekly | ❌ | Blocked | ✅ (multipliers) |
| **Replit** | Effort credits | Monthly pool | ❌ | Auto-billed | ✅ |
| **v0** | $ credits | Monthly + rollover | ❌ | Credit top-ups | ✅ |
| **Bolt.new** | Raw tokens | Monthly + rollover | ❌ | Tier upgrade | ❌ |

---

## Layer 5: Billing Infrastructure

### Stripe Billing Meters

Stripe provides native infrastructure for usage-based billing:

1. **Define Meters** — units of measure (e.g., "Input Tokens", "Output Tokens")
2. **Report Events** — `meter_events` with `customer_id`, `event_name`, `value`
3. **Flexible Pricing** — pay-as-you-go, fixed + overage, or credit packs
4. **Credit Packs** — prepaid credit balance with real-time burndown
5. **Idempotency** — built-in deduplication to prevent double-billing

**Best practices from Stripe:**
- **Batch locally, flush periodically** — don't hit Stripe API per-token
- **Use idempotency keys** on every billing event
- **Listen to webhooks** for `invoice.payment_failed`, `customer.subscription.updated`
- **Margin management** — set markup on top of raw model costs

### OpenMeter

Open-source usage metering with CloudEvents:

1. **Event ingestion** via CloudEvents spec (JSON over HTTP)
2. **Deduplication** via event `id` + `source` fields
3. **Aggregation** — SUM, COUNT, AVG over tokens grouped by model/customer
4. **Pipeline** — Kafka → ClickHouse for high-throughput event streams
5. **Portal tokens** — short-lived tokens for customer-facing usage dashboards

**Key insight for PipeFX:** OpenMeter's CloudEvents format is an excellent model for our usage logging. Each LLM call becomes an event with `subject` (user_id), `data` (tokens, model, cost), and built-in idempotency.

---

## Layer 6: Framework SDKs

### Vercel AI SDK

Provides developer-ergonomic token tracking at the framework level:

```typescript
// Server-side: streamText returns usage
const result = streamText({
  model: openai('gpt-4o'),
  prompt: '...',
  onFinish: ({ usage }) => {
    // usage.promptTokens, usage.completionTokens, usage.totalTokens
    // → Save to database for billing
  }
});

// Client-side: useChat hook
const { messages } = useChat({
  onFinish: (message, { usage }) => {
    console.log('Tokens:', usage?.totalTokens);
  },
});
```

**Key principle:** Usage data flows through the `onFinish` callback, NOT by counting stream chunks. This is because token metadata only appears in the final chunk.

> [!TIP]
> **For PipeFX:** The `onFinish` callback pattern maps directly to what we need. Each provider's `chatStream()` generator should yield a final `UsageEvent` with actual token counts.

---

## Universal Patterns

### Pattern 1: Trust the Provider, Never Estimate for Billing

Every successful billing system uses the **provider's reported token counts** as the source of truth. Client-side estimation (tiktoken, chars/4, etc.) is used only for:
- UI previews showing "this message will cost approximately..."
- Context window management (will this fit?)
- Pre-flight budget checks ("do I have enough credits for this?")

**Never** use client-side estimation for the actual debit. The provider's number is authoritative.

### Pattern 2: Separate Input and Output Token Tracking

Every product tracks input and output tokens separately because:
- Output tokens cost 2-5× more than input tokens across all providers
- Different models have vastly different pricing ratios
- Cached/repeated input tokens may be discounted
- "Thinking" tokens (Gemini, OpenAI o-series) are a third category

### Pattern 3: The Gateway/Proxy is the Metering Point

```
Application → [GATEWAY/PROXY] → Provider
                  │
                  ├── Log: user_id, model, input_tokens, output_tokens, cost
                  ├── Check: does user have sufficient credits?
                  └── Debit: atomically reduce balance
```

This is the architecture used by OpenRouter, LiteLLM, Portkey, Helicone, Vercel AI Gateway, and every major product. PipeFX's `cloud-api` IS this gateway.

### Pattern 4: Debit After Completion, Not Before

The dominant pattern is:
1. **Pre-check:** Verify user has *some* credits (not zero)
2. **Execute:** Make the LLM API call
3. **Extract:** Read actual token counts from response
4. **Debit:** Atomically deduct the calculated cost

The alternative (pre-authorization hold) is used only when:
- Extremely high-cost operations are expected
- Concurrent requests from the same user are likely
- Strict "never go negative" guarantees are required

### Pattern 5: Immutable Usage Logs (Append-Only Ledger)

Every product maintains an immutable log of every LLM call:

```sql
-- The universal usage_log schema (composite of all products)
CREATE TABLE usage_logs (
  id            UUID PRIMARY KEY,
  idempotency_key TEXT UNIQUE,    -- prevents double-billing on retries
  user_id       UUID NOT NULL,
  session_id    TEXT,              -- groups multi-turn conversations
  model         TEXT NOT NULL,
  provider      TEXT NOT NULL,     -- 'openai', 'anthropic', 'google'
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  thinking_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  cost_usd      DECIMAL(10,8),    -- actual cost at provider rates
  credits_debited INTEGER,        -- credits charged to user
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

This log is:
- **Append-only** — never updated or deleted
- **Idempotent** — duplicate idempotency keys are rejected
- **The audit trail** — reconcilable against provider bills
- **The billing source** — aggregated for invoices and dashboards

### Pattern 6: Atomic Credit Operations

```sql
-- The universal "debit credits" pattern
-- Single atomic UPDATE that CHECKS and DEBITS in one statement
UPDATE profiles
SET credit_balance = credit_balance - $cost
WHERE user_id = $user_id
  AND credit_balance >= $cost
RETURNING credit_balance;

-- If 0 rows returned → insufficient credits
```

This prevents race conditions where two concurrent requests both read the same balance, both pass the check, and both debit — resulting in a negative balance.

### Pattern 7: BYOK as the Escape Hatch

Every product that targets developers offers BYOK (Bring Your Own Key) as an alternative to credits:
- **Cursor:** Full BYOK support; bypasses credit system entirely
- **PipeFX (planned):** BYOK for free tier, credits for paid tier
- **Windsurf:** Limited BYOK
- **Copilot:** No BYOK (and suffering for it)

BYOK users are valuable because they have zero COGS (cost of goods sold) for the platform while still paying for the subscription.

---

## Comparative Analysis

### Billing Model Matrix

| Approach | Products | Pros | Cons | Best For |
|---|---|---|---|---|
| **$ Credits (prepaid)** | Cursor, v0, OpenRouter | Intuitive (dollar value), flexible model switching | Can feel "expensive" for heavy users | Products with multiple models |
| **Token Allowances** | Bolt.new, Copilot | Simple to understand, predictable | Users don't know what "1M tokens" means | Developer-focused tools |
| **Quotas (refreshing)** | Windsurf | Most predictable, low anxiety | Waste if unused, rigid | Consumer products |
| **Effort-based** | Replit | Fairest for complex tasks | Opaque, hard to predict costs | Agentic/autonomous tools |
| **Pay-per-call** | OpenAI API | Purest usage-based | Unpredictable bills | Raw API consumers |

### Token Extraction Difficulty by Provider

| Provider | Non-streaming | Streaming | Difficulty | Notes |
|---|---|---|---|---|
| **OpenAI** | `response.usage` | Requires `stream_options.include_usage` | Medium | Must opt-in for streaming |
| **Anthropic** | `response.usage` | `stream.finalMessage().usage` | Easy | Always available |
| **Google Gemini** | `response.usageMetadata` | Final chunk only | Medium | Different field names |

### Pricing Complexity by Provider

| Provider | Input Price Range | Output Price Range | Special Tokens |
|---|---|---|---|
| **Gemini Flash** | ~$0.075/1M | ~$0.30/1M | Thinking tokens (separate) |
| **Gemini Pro** | ~$1.25/1M | ~$5.00/1M | Thinking tokens |
| **GPT-4o** | ~$2.50/1M | ~$10.00/1M | Reasoning tokens |
| **Claude Sonnet** | ~$3.00/1M | ~$15.00/1M | — |
| **Claude Opus** | ~$15.00/1M | ~$75.00/1M | — |

> [!WARNING]
> These prices are approximate and change frequently. The pricing table MUST be a configurable data structure, not hardcoded constants. Every product in our research maintains a pricing table that can be updated without code changes.

---

## Anti-Patterns

### ❌ 1. Estimating tokens instead of reading provider response

Using `chars / 4` or `tiktoken` for billing is inaccurate. All providers return actual counts. Use them.

### ❌ 2. Fixed-price unlimited plans for agentic tools

GitHub Copilot's April 2026 crisis (pausing signups, restricting models) proves that flat-rate pricing cannot survive agentic workloads. One agent session can burn $5-50 in API costs.

### ❌ 3. Shared credit pools (AI + compute + hosting)

Replit's approach of pooling AI, compute, and hosting credits into one balance causes user frustration. Users feel their AI usage is "eating" their deployment budget.

### ❌ 4. Opaque "effort-based" billing

If users can't predict what a request will cost, they feel anxious and use the product less. Transparency (showing token counts and costs) increases trust and usage.

### ❌ 5. No idempotency in billing events

Without idempotency keys, network retries can double-charge users. This is a trust-destroying bug that's hard to detect.

### ❌ 6. Debiting credits before the LLM call completes

If you debit first and the call fails, you must handle refunds. It's simpler to debit after success. Use pre-authorization holds only for very expensive operations.

---

## Recommendations for PipeFX

Based on this research, here are the synthesized recommendations:

### 1. Token Extraction (Immediate)

Add token extraction to all three provider implementations:

```typescript
// Each provider's response should include:
interface UsageData {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;   // Gemini thinking models
  cachedTokens?: number;     // prompt caching
  model: string;
  provider: 'gemini' | 'openai' | 'anthropic';
}
```

- **Gemini:** Read `response.usageMetadata.promptTokenCount` + `candidatesTokenCount` + `thoughtsTokenCount`
- **OpenAI:** Read `response.usage.prompt_tokens` + `completion_tokens`. For streaming, set `stream_options.include_usage = true`
- **Anthropic:** Read `response.usage.input_tokens` + `output_tokens`. For streaming, use `stream.finalMessage().usage`

### 2. Billing Model (Strategic)

Adopt **Cursor's model** with PipeFX adaptations:

- **Free tier:** BYOK only (users provide their own API keys)
- **Paid tier:** Monthly subscription ($X/mo) includes credit pool (dollar-denominated)
- **Credits:** 1 credit = $0.0001 USD (from HANDOFF.md — this is fine)
- **Model weighting:** Different models consume credits at different rates
- **Overages:** Pay-as-you-go at same rates, or option to purchase credit packs
- **BYOK escape:** Paid users can still use BYOK for specific providers to reduce credit consumption

### 3. Architecture (Cloud API as Gateway)

The `cloud-api` should follow the **gateway proxy pattern**:

```
Desktop → cloud-api (gateway) → LLM Provider
              │
              ├── 1. Authenticate (device token → user_id)
              ├── 2. Pre-check (credit_balance > 0)
              ├── 3. Forward request to LLM provider
              ├── 4. Extract usage from response
              ├── 5. Calculate credits: (input × rate + output × rate) / 0.0001
              ├── 6. Atomic debit: UPDATE profiles SET balance = balance - cost WHERE balance >= cost
              └── 7. Append usage_log (immutable, with idempotency_key)
```

### 4. Usage Logging Schema

Follow the universal pattern identified across all products:

```sql
CREATE TABLE usage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  session_id      TEXT,
  request_id      TEXT,              -- for multi-turn grouping
  model           TEXT NOT NULL,
  provider        TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  thinking_tokens INTEGER DEFAULT 0,
  cached_tokens   INTEGER DEFAULT 0,
  cost_usd        NUMERIC(12, 8) NOT NULL,
  credits_debited INTEGER NOT NULL,
  tool_calls      INTEGER DEFAULT 0, -- number of tool call rounds
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. Pricing Table (Configurable)

```sql
CREATE TABLE model_pricing (
  model           TEXT PRIMARY KEY,
  provider        TEXT NOT NULL,
  input_per_1m    NUMERIC(10, 4) NOT NULL,  -- USD per 1M input tokens
  output_per_1m   NUMERIC(10, 4) NOT NULL,  -- USD per 1M output tokens
  thinking_per_1m NUMERIC(10, 4),           -- USD per 1M thinking tokens
  is_active       BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

This MUST be a database table, not hardcoded constants. Prices change frequently.

### 6. Multi-Turn Aggregation

The agent's tool-call loop produces multiple LLM calls per user message. Adopt Langfuse's "trace" concept:

```
User message → Trace (requestId)
  ├── LLM Call 1: initial response with tool calls    → usage_log entry
  ├── LLM Call 2: continue with tool results         → usage_log entry
  ├── LLM Call 3: continue with more tool results    → usage_log entry
  └── LLM Call 4: final text response                → usage_log entry
  
Total cost = SUM(all usage_log entries WHERE request_id = trace_id)
```

### 7. Workflow LLM Calls

Internal workflows (`analyze_project`, `auto_subtitles`, etc.) that call LLM APIs directly MUST also be instrumented. Two approaches:

- **Option A:** Route workflow LLM calls through the same provider abstraction layer
- **Option B:** Add inline usage tracking in each workflow (less ideal, harder to maintain)

### 8. Concurrency Protection

Use atomic database operations for credit debits:

```sql
-- Atomic debit that prevents negative balances
UPDATE profiles
SET credit_balance = credit_balance - $credits
WHERE id = $user_id
  AND credit_balance >= $credits
RETURNING credit_balance;
-- 0 rows affected → insufficient credits → reject request
```

For high-concurrency scenarios (multiple requests from same user simultaneously), implement a **pre-authorization hold** pattern:

```sql
-- 1. Reserve estimated max credits
UPDATE profiles SET held_credits = held_credits + $estimate WHERE id = $user_id;
-- 2. Execute LLM call
-- 3. Release hold and debit actual
UPDATE profiles SET
  held_credits = held_credits - $estimate,
  credit_balance = credit_balance - $actual_cost
WHERE id = $user_id;
```

### 9. User Transparency

From Windsurf's lesson (abandoning credits due to user confusion), we must provide:
- **Real-time credit balance** visible in the desktop app
- **Per-message cost** shown after each AI response (e.g., "Cost: 12 credits")
- **Usage history** accessible from Settings → Account
- **Cost breakdown** by model, session, and time period
- **Budget alerts** when approaching credit exhaustion

---

## Key Takeaways

1. **The industry has converged.** The architecture is clear: Provider → Gateway → Log → Ledger → Billing. We don't need to innovate on billing architecture — we need to execute it well.

2. **Token counts come from providers, always.** Our #1 technical task is extracting `usage` data from all three provider responses. This is low-hanging fruit we're currently ignoring.

3. **Dollar-denominated credits** with model-weighted pricing is the dominant and most user-friendly approach for products targeting creative professionals (our audience).

4. **BYOK must remain the free tier.** It's zero-cost to us and keeps users engaged. Upgrade incentive is convenience (not needing to manage keys) + access to premium features.

5. **Idempotency + atomic operations** are non-negotiable for a billing system. Every usage event needs a unique key, and every credit debit must be a single atomic database operation.

6. **Multi-turn is the unique challenge.** Most billing systems meter per-request. PipeFX's agent loop makes multiple requests per user message. We must aggregate per-trace, not per-call.

7. **The pricing table must be dynamic.** Provider prices change quarterly. Hardcoding prices = production incidents.
