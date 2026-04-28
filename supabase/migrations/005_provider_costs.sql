-- ═══════════════════════════════════════════════════════════
-- PipeFX — Migration 005: Provider Cost Tracking
-- ═══════════════════════════════════════════════════════════
--
-- Adds `provider_cost_usd` to `model_pricing` so we can track
-- what each generation actually costs PipeFX (the wholesale
-- price from the upstream API) vs what we charge users (credits).
--
-- This enables margin visibility directly in Supabase:
--   SELECT model, credits_flat, provider_cost_usd,
--          (credits_flat * 0.0001) AS charge_usd,
--          (credits_flat * 0.0001) - provider_cost_usd AS margin_usd
--   FROM model_pricing WHERE credits_flat IS NOT NULL;
-- ═══════════════════════════════════════════════════════════

-- Add provider cost column (NULL means "not yet measured")
ALTER TABLE public.model_pricing
  ADD COLUMN IF NOT EXISTS provider_cost_usd NUMERIC(10,6);

COMMENT ON COLUMN public.model_pricing.provider_cost_usd IS
  'Actual cost PipeFX pays per generation/1M tokens to the upstream provider (USD). Used for margin analysis.';

-- ── Seed provider costs for media models ─────────────────────
-- These are approximate per-generation costs based on current
-- provider pricing (April 2026). Update as rates change.

-- Image generation
UPDATE public.model_pricing SET provider_cost_usd = 0.003000
  WHERE model = 'gemini2'       AND provider = 'media';          -- Gemini image (very cheap)

UPDATE public.model_pricing SET provider_cost_usd = 0.020000
  WHERE model = 'gpt-image-2'  AND provider = 'media';          -- OpenAI ~$0.02/image (1024x1024)

UPDATE public.model_pricing SET provider_cost_usd = 0.008000
  WHERE model = 'seeddream45'   AND provider = 'media';          -- BytePlus SeedDream

-- Video generation
UPDATE public.model_pricing SET provider_cost_usd = 0.250000
  WHERE model = 'kling3'        AND provider = 'media';          -- Kling 3.0 (5s video)

UPDATE public.model_pricing SET provider_cost_usd = 0.200000
  WHERE model = 'seedance-2'    AND provider = 'media';          -- SeedDance Pro

UPDATE public.model_pricing SET provider_cost_usd = 0.120000
  WHERE model = 'seedance-2-fast' AND provider = 'media';       -- SeedDance Fast

-- Sound generation (ElevenLabs)
UPDATE public.model_pricing SET provider_cost_usd = 0.006000
  WHERE model = 'elevenlabs-tts'     AND provider = 'media';    -- ~1000 chars TTS

UPDATE public.model_pricing SET provider_cost_usd = 0.008000
  WHERE model = 'elevenlabs-sfx'     AND provider = 'media';    -- Sound effects

UPDATE public.model_pricing SET provider_cost_usd = 0.012000
  WHERE model = 'elevenlabs-sts'     AND provider = 'media';    -- Speech-to-speech

UPDATE public.model_pricing SET provider_cost_usd = 0.006000
  WHERE model = 'elevenlabs-isolate' AND provider = 'media';    -- Voice isolation

-- ── Seed provider costs for LLM models ───────────────────────
-- For LLMs, provider_cost_usd represents cost per 1M output tokens
-- (the dominant cost factor). Input/thinking costs are in the
-- existing per-1M columns which already reflect provider pricing.
-- Set to NULL to indicate "use the token-based columns directly".

-- ── Convenience view for margin analysis ─────────────────────
CREATE OR REPLACE VIEW public.pricing_margins AS
SELECT
  model,
  provider,
  -- For media: flat credit cost → USD charge
  credits_flat,
  CASE WHEN credits_flat IS NOT NULL
    THEN ROUND(credits_flat * 0.0001, 6)
    ELSE NULL
  END AS charge_usd,
  -- Provider cost
  provider_cost_usd,
  -- Margin
  CASE WHEN credits_flat IS NOT NULL AND provider_cost_usd IS NOT NULL
    THEN ROUND((credits_flat * 0.0001) - provider_cost_usd, 6)
    ELSE NULL
  END AS margin_usd,
  -- Margin percentage
  CASE WHEN credits_flat IS NOT NULL AND provider_cost_usd IS NOT NULL AND provider_cost_usd > 0
    THEN ROUND(((credits_flat * 0.0001) - provider_cost_usd) / provider_cost_usd * 100, 1)
    ELSE NULL
  END AS margin_pct,
  is_active,
  updated_at
FROM public.model_pricing
ORDER BY provider, model;
