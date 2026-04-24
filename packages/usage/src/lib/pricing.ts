/**
 * PipeFX Usage System — Cost calculation engine.
 *
 * Takes raw token counts from a provider response and a pricing table,
 * returns the cost in USD and credits. Never hardcodes prices inline —
 * always references a pricing table (which can be overridden at runtime
 * with Supabase model_pricing data).
 */

import type { UsageData } from '@pipefx/providers';
import type { ModelPricing, CostResult } from './types.js';

/** 1 credit = $0.0001 USD. 10,000 credits = $1. */
export const CREDIT_VALUE_USD = 0.0001;

/**
 * Default pricing table — shipped with the package as a fallback.
 * In production, the cloud-api fetches fresh pricing from Supabase's
 * `model_pricing` table and passes it as the second argument.
 *
 * Updated April 2026.
 */
export const DEFAULT_PRICING: ModelPricing[] = [
  // ── Gemini ──
  {
    model: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    inputPer1M: 1.25,
    outputPer1M: 5.0,
    thinkingPer1M: 5.0,
    cachedInputPer1M: 0.315,
    isActive: true,
    updatedAt: '2026-04-21',
  },
  {
    model: 'gemini-3.1-flash-lite-preview',
    provider: 'gemini',
    inputPer1M: 0.075,
    outputPer1M: 0.30,
    thinkingPer1M: 0.30,
    cachedInputPer1M: 0.01875,
    isActive: true,
    updatedAt: '2026-04-21',
  },
  // ── OpenAI ──
  {
    model: 'gpt-5.4',
    provider: 'openai',
    inputPer1M: 2.50,
    outputPer1M: 10.0,
    thinkingPer1M: 10.0,
    cachedInputPer1M: 1.25,
    isActive: true,
    updatedAt: '2026-04-21',
  },
  // ── Anthropic ──
  {
    model: 'claude-opus-4-6-20260401',
    provider: 'anthropic',
    inputPer1M: 15.0,
    outputPer1M: 75.0,
    thinkingPer1M: 0,
    cachedInputPer1M: 7.5,
    isActive: true,
    updatedAt: '2026-04-21',
  },
  {
    model: 'claude-sonnet-4-6-20260201',
    provider: 'anthropic',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    thinkingPer1M: 0,
    cachedInputPer1M: 1.5,
    isActive: true,
    updatedAt: '2026-04-21',
  },
];

/**
 * Calculate the cost of a single LLM call.
 *
 * Pricing resolution:
 * 1. Exact model match (e.g. "gemini-3.1-pro-preview")
 * 2. Provider fallback (most expensive active model for that provider — safe default)
 * 3. Global fallback (most expensive model overall)
 *
 * This "most expensive fallback" strategy ensures we never under-bill.
 */
export function calculateCost(
  usage: UsageData,
  pricingTable: ModelPricing[] = DEFAULT_PRICING
): CostResult {
  // 1. Exact model + provider match
  let pricing = pricingTable.find(
    (p) => p.model === usage.model && p.provider === usage.provider && p.isActive
  );

  // 2. Provider fallback — most expensive for that provider
  if (!pricing) {
    pricing = pricingTable
      .filter((p) => p.provider === usage.provider && p.isActive)
      .sort((a, b) => b.outputPer1M - a.outputPer1M)[0];
  }

  // 3. Global fallback — most expensive overall
  if (!pricing) {
    pricing = [...pricingTable]
      .filter((p) => p.isActive)
      .sort((a, b) => b.outputPer1M - a.outputPer1M)[0];
  }

  // If we still don't have pricing (empty table), return zero cost
  if (!pricing) {
    return {
      costUsd: 0,
      credits: 0,
      breakdown: {
        inputCost: 0,
        outputCost: 0,
        thinkingCost: 0,
        cachedDiscount: 0,
      },
    };
  }

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPer1M;
  const thinkingCost =
    (usage.thinkingTokens / 1_000_000) *
    (pricing.thinkingPer1M || pricing.outputPer1M);

  // Cached tokens are already counted in inputTokens; the discount is the
  // difference between full and cached rates for those tokens.
  const cachedDiscount =
    usage.cachedTokens > 0
      ? -(
          (usage.cachedTokens / 1_000_000) *
          (pricing.inputPer1M - pricing.cachedInputPer1M)
        )
      : 0;

  const costUsd = Math.max(
    0,
    inputCost + outputCost + thinkingCost + cachedDiscount
  );
  const credits = costUsd > 0 ? Math.ceil(costUsd / CREDIT_VALUE_USD) : 0;

  return {
    costUsd,
    credits,
    breakdown: { inputCost, outputCost, thinkingCost, cachedDiscount },
  };
}
