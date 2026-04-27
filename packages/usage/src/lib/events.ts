/**
 * PipeFX Usage System — Usage event creation & idempotency.
 *
 * Creates UsageEvent objects with deterministic idempotency keys.
 * The key ensures that retrying the same request never causes double-billing.
 */

import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import type { UsageData } from '@pipefx/llm-providers';
import type { UsageEvent, CostResult } from './types.js';

/**
 * Generate a deterministic idempotency key.
 *
 * Same (userId, sessionId, requestId, roundIndex) → same key.
 * The usage_events table has a UNIQUE constraint on this key, so
 * `INSERT OR IGNORE` / `ON CONFLICT DO NOTHING` silently drops retries.
 *
 * Uses SHA-256 truncated to 32 hex chars (128 bits) — collision-resistant
 * enough for our scale while keeping the key compact.
 */
export function generateIdempotencyKey(
  userId: string,
  sessionId: string,
  requestId: string,
  roundIndex: number
): string {
  const input = `${userId}:${sessionId}:${requestId}:${roundIndex}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

/**
 * Create a UsageEvent from a provider's UsageData + cost calculation result.
 *
 * This is the factory function that every metering point calls:
 * - apps/backend chat route (BYOK mode)
 * - apps/cloud-api billing service (cloud mode)
 * - apps/backend workflow tools (direct LLM calls)
 */
export function createUsageEvent(params: {
  userId: string;
  sessionId: string;
  requestId: string;
  roundIndex: number;
  usage: UsageData;
  cost: CostResult;
  isByok: boolean;
}): UsageEvent {
  return {
    id: randomUUID(),
    idempotencyKey: generateIdempotencyKey(
      params.userId,
      params.sessionId,
      params.requestId,
      params.roundIndex
    ),
    userId: params.userId,
    sessionId: params.sessionId,
    requestId: params.requestId,
    roundIndex: params.roundIndex,
    model: params.usage.model,
    provider: params.usage.provider,
    inputTokens: params.usage.inputTokens,
    outputTokens: params.usage.outputTokens,
    thinkingTokens: params.usage.thinkingTokens,
    cachedTokens: params.usage.cachedTokens,
    costUsd: params.cost.costUsd,
    creditsDebited: params.isByok ? 0 : params.cost.credits,
    isByok: params.isByok,
    createdAt: new Date().toISOString(),
  };
}
