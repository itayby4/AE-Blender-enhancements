/**
 * PipeFX Cloud-API — Pricing Service.
 *
 * Fetches model pricing from Supabase and caches with TTL.
 * Falls back to hardcoded DEFAULT_PRICING from @pipefx/usage if Supabase is unreachable.
 */

import { supabase } from './supabase.js';
import { DEFAULT_PRICING } from '@pipefx/usage';
import type { ModelPricing } from '@pipefx/usage';

/** Cache TTL: 5 minutes. */
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedPricing: ModelPricing[] = DEFAULT_PRICING;
let cacheTimestamp = 0;

/**
 * Get the current pricing table, with Supabase-first + fallback.
 */
export async function getPricingTable(): Promise<ModelPricing[]> {
  const now = Date.now();

  // Return cached if fresh
  if (cacheTimestamp > 0 && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedPricing;
  }

  try {
    const { data, error } = await supabase
      .from('model_pricing')
      .select('model, provider, input_per_1m, output_per_1m, thinking_per_1m, cached_input_per_1m, is_active, updated_at')
      .eq('is_active', true);

    if (error || !data || data.length === 0) {
      console.warn('[Pricing] Failed to fetch from Supabase, using defaults:', error?.message);
      cachedPricing = DEFAULT_PRICING;
    } else {
      cachedPricing = data.map((row): ModelPricing => ({
        model: row.model as string,
        provider: row.provider as string,
        inputPer1M: Number(row.input_per_1m),
        outputPer1M: Number(row.output_per_1m),
        thinkingPer1M: Number(row.thinking_per_1m),
        cachedInputPer1M: Number(row.cached_input_per_1m),
        isActive: row.is_active as boolean,
        updatedAt: row.updated_at as string,
      }));
    }
  } catch {
    console.warn('[Pricing] Supabase unreachable, using defaults');
    cachedPricing = DEFAULT_PRICING;
  }

  cacheTimestamp = now;
  return cachedPricing;
}

/**
 * Invalidate the pricing cache (e.g., after an admin update).
 */
export function invalidatePricingCache(): void {
  cacheTimestamp = 0;
}
