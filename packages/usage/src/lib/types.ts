/**
 * PipeFX Usage System — Core type definitions.
 *
 * These types define the universal schema for usage tracking, cost calculation,
 * and storage. They are provider-agnostic and used by both the local backend
 * (SQLite) and the cloud-api (Supabase).
 */

/**
 * A single billable usage event — one row per LLM call.
 * The universal schema from the industry research:
 * Provider → Gateway → UsageEvent → Ledger.
 */
export interface UsageEvent {
  /** UUID v4 — primary key. */
  id: string;
  /** Deterministic idempotency key: SHA-256(userId:sessionId:requestId:roundIndex). */
  idempotencyKey: string;
  /** Supabase user ID (from auth). Anonymous for unauthenticated users. */
  userId: string;
  /** Chat session ID (groups multi-turn conversations). */
  sessionId: string;
  /** Request ID / trace ID (groups all rounds within one chat() call). */
  requestId: string;
  /** 0-indexed round within the request. */
  roundIndex: number;
  /** LLM model identifier as reported by the provider. */
  model: string;
  /** Provider: 'gemini' | 'openai' | 'anthropic'. */
  provider: string;
  /** Token counts — from the provider, never estimated. */
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  /** Cost in USD at provider rates (for reconciliation). */
  costUsd: number;
  /** Credits debited from the user's balance (0 for BYOK). */
  creditsDebited: number;
  /** Whether this was a BYOK call (user's own API key). */
  isByok: boolean;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/**
 * Model pricing entry.
 * Source of truth: Supabase `model_pricing` table (cloud).
 * Fallback: DEFAULT_PRICING constant (local/offline).
 */
export interface ModelPricing {
  model: string;
  provider: string;
  /** USD per 1M input tokens. */
  inputPer1M: number;
  /** USD per 1M output tokens. */
  outputPer1M: number;
  /** USD per 1M thinking/reasoning tokens (0 if N/A). */
  thinkingPer1M: number;
  /** USD per 1M cached input tokens (discounted rate). */
  cachedInputPer1M: number;
  isActive: boolean;
  updatedAt: string;
}

/**
 * Result of a cost calculation for a single LLM call.
 */
export interface CostResult {
  /** Total cost in USD. */
  costUsd: number;
  /** Credits = costUsd / CREDIT_VALUE_USD, rounded up (always >= 1 if costUsd > 0). */
  credits: number;
  /** Breakdown by token type. */
  breakdown: {
    inputCost: number;
    outputCost: number;
    thinkingCost: number;
    /** Negative value — savings from cached tokens. */
    cachedDiscount: number;
  };
}

/**
 * Abstract usage store interface.
 * Implemented by SQLite adapter (local) and Supabase adapter (cloud).
 */
export interface UsageStore {
  /** Record a usage event. Idempotent — duplicates are silently ignored. */
  record(event: UsageEvent): void;
  /** Get all usage events for a session, ordered by creation time. */
  getBySession(sessionId: string): UsageEvent[];
  /** Get all usage events for a request (trace), ordered by round index. */
  getByRequest(requestId: string): UsageEvent[];
  /** Get recent usage events for a user. */
  getByUser(userId: string, limit?: number): UsageEvent[];
  /** Get total credits debited for a user since a date (ISO 8601). */
  getTotalCredits(userId: string, since?: string): number;
}
