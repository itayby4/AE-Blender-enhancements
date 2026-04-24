/**
 * PipeFX Cloud-API — Billing Service.
 *
 * Implements the Reserve → Execute → Settle/Refund saga pattern.
 * All credit mutations happen atomically via Supabase RPC functions.
 */

import { supabase } from '../lib/supabase.js';
import { calculateCost, generateIdempotencyKey, CREDIT_VALUE_USD } from '@pipefx/usage';
import type { UsageData } from '@pipefx/providers';
import type { ModelPricing } from '@pipefx/usage';
import { config } from '../config.js';

export class InsufficientCreditsError extends Error {
  constructor(userId: string) {
    super(`Insufficient credits for user ${userId}`);
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Estimate the worst-case credit cost before an LLM call.
 * Uses maxOutputTokensEstimate as a ceiling for output tokens.
 */
export function estimateMaxCredits(
  inputTokens: number,
  pricingTable: ModelPricing[],
  model: string,
  provider: string
): number {
  const pricing = pricingTable.find(
    (p) => p.model === model && p.provider === provider
  );

  const effectivePricing = pricing ?? pricingTable.reduce(
    (max, p) => (p.outputPer1M > max.outputPer1M ? p : max),
    pricingTable[0]
  );

  if (!effectivePricing) {
    return Math.ceil(50_000 * CREDIT_VALUE_USD);
  }

  const inputCostUsd = (inputTokens / 1_000_000) * effectivePricing.inputPer1M;
  const outputCostUsd =
    (config.maxOutputTokensEstimate / 1_000_000) * effectivePricing.outputPer1M;
  const totalUsd = inputCostUsd + outputCostUsd;

  return Math.ceil(totalUsd / CREDIT_VALUE_USD);
}

/**
 * Reserve credits before an LLM call.
 */
export async function reserveCredits(
  userId: string,
  amount: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc('reserve_credits', {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    console.error('[Billing] reserve_credits RPC error:', error.message);
    return false;
  }

  return data === true;
}

/**
 * Settle a reservation after a successful LLM call.
 */
export async function settleCredits(params: {
  userId: string;
  reservedCredits: number;
  usage: UsageData;
  pricingTable: ModelPricing[];
  sessionId: string;
  requestId: string;
  roundIndex: number;
}): Promise<{ creditsDebited: number; costUsd: number }> {
  const cost = calculateCost(params.usage, params.pricingTable);

  const idempotencyKey = generateIdempotencyKey(
    params.userId,
    params.sessionId,
    params.requestId,
    params.roundIndex
  );

  const { error } = await supabase.rpc('settle_credits', {
    p_user_id: params.userId,
    p_reserved: params.reservedCredits,
    p_actual: cost.credits,
    p_description: `${params.usage.provider}/${params.usage.model} round ${params.roundIndex}`,
    p_reference: params.requestId,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    console.error('[Billing] settle_credits RPC error:', error.message);
    await releaseHold(params.userId, params.reservedCredits);
    throw new Error(`Billing settlement failed: ${error.message}`);
  }

  // Log to usage_logs — awaited with retry to prevent silent data loss (HIGH-3)
  const usagePayload = {
    idempotency_key: idempotencyKey,
    user_id: params.userId,
    session_id: params.sessionId,
    request_id: params.requestId,
    round_index: params.roundIndex,
    model: params.usage.model,
    provider: params.usage.provider,
    input_tokens: params.usage.inputTokens,
    output_tokens: params.usage.outputTokens,
    thinking_tokens: params.usage.thinkingTokens ?? 0,
    cached_tokens: params.usage.cachedTokens ?? 0,
    cost_usd: cost.costUsd,
    credits_debited: cost.credits,
    is_byok: false,
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error: logErr } = await supabase
      .from('usage_logs')
      .insert(usagePayload);

    if (!logErr || logErr.message.includes('duplicate')) break;

    if (attempt === 2) {
      console.error(
        `[Billing] WARNING: usage_logs insert failed after 2 attempts (data may be lost):`,
        logErr.message,
        JSON.stringify({ idempotencyKey, userId: params.userId, credits: cost.credits })
      );
    }
  }

  return { creditsDebited: cost.credits, costUsd: cost.costUsd };
}

/**
 * Release a credit hold (compensating transaction for failed requests).
 */
export async function releaseHold(
  userId: string,
  amount: number
): Promise<void> {
  const { error } = await supabase.rpc('release_hold', {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    console.error('[Billing] release_hold RPC error:', error.message);
  }
}

/**
 * Get user's current credit balance.
 */
export async function getUserBalance(
  userId: string
): Promise<{ balance: number; held: number } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('credits_balance, held_credits')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  return {
    balance: data.credits_balance as number,
    held: data.held_credits as number,
  };
}
