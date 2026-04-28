-- ═══════════════════════════════════════════════════════════
-- PipeFX — Migration 007: Admin-Friendly Unified Pricing Table
-- ═══════════════════════════════════════════════════════════
--
-- Reorganizes model_pricing so it works smoothly in the
-- Supabase Table Editor for both LLM and media models.
--
-- Design principles:
--   • Every row is self-explanatory (display_name, category, api_provider)
--   • pricing_type tells the admin how this model is billed
--   • provider_cost_usd is populated for ALL models (not just media)
--   • Generated columns auto-compute margins — admins just edit
--     credits_flat or provider_cost_usd and see results instantly
--   • LLM token columns (input_per_1m etc.) are kept but clearly
--     labeled via column comments and category grouping
-- ═══════════════════════════════════════════════════════════

-- ── 1. New descriptive columns ───────────────────────────────

-- pricing_type: makes it immediately clear how each model is billed
ALTER TABLE public.model_pricing
  ADD COLUMN IF NOT EXISTS pricing_type TEXT NOT NULL DEFAULT 'flat'
    CHECK (pricing_type IN ('flat', 'per_token'));

COMMENT ON COLUMN model_pricing.pricing_type IS
  'flat = fixed credits per generation (media). per_token = billed by token count (LLM).';

-- api_provider: the actual upstream API (not just gemini/openai/media)
ALTER TABLE public.model_pricing
  ADD COLUMN IF NOT EXISTS api_provider TEXT;

COMMENT ON COLUMN model_pricing.api_provider IS
  'Upstream API provider name (e.g. Google, OpenAI, Anthropic, BytePlus, Kling, ElevenLabs)';

-- notes: free-text field for admin context
ALTER TABLE public.model_pricing
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN model_pricing.notes IS
  'Admin notes — e.g. "price confirmed May 2026", "volume discount applied"';


-- ── 2. Populate new columns for ALL existing rows ────────────

-- LLM models
UPDATE model_pricing SET pricing_type = 'per_token', api_provider = 'Google',    notes = 'Token-based. Rates are per 1M tokens (USD).'
  WHERE model = 'gemini-3.1-pro-preview';
UPDATE model_pricing SET pricing_type = 'per_token', api_provider = 'Google',    notes = 'Token-based. Rates are per 1M tokens (USD).'
  WHERE model = 'gemini-3.1-flash-lite-preview';
UPDATE model_pricing SET pricing_type = 'per_token', api_provider = 'OpenAI',    notes = 'Token-based. Rates are per 1M tokens (USD).'
  WHERE model = 'gpt-5.4';
UPDATE model_pricing SET pricing_type = 'per_token', api_provider = 'Anthropic', notes = 'Token-based. Rates are per 1M tokens (USD).'
  WHERE model = 'claude-opus-4-6-20260401';
UPDATE model_pricing SET pricing_type = 'per_token', api_provider = 'Anthropic', notes = 'Token-based. Rates are per 1M tokens (USD).'
  WHERE model = 'claude-sonnet-4-6-20260201';

-- Media models
UPDATE model_pricing SET pricing_type = 'flat', api_provider = 'Google'
  WHERE model = 'gemini2'        AND provider = 'media';
UPDATE model_pricing SET pricing_type = 'flat', api_provider = 'OpenAI'
  WHERE model = 'gpt-image-2'   AND provider = 'media';
UPDATE model_pricing SET pricing_type = 'flat', api_provider = 'BytePlus'
  WHERE model = 'seeddream45'    AND provider = 'media';
UPDATE model_pricing SET pricing_type = 'flat', api_provider = 'Kling'
  WHERE model = 'kling3'         AND provider = 'media';
UPDATE model_pricing SET pricing_type = 'flat', api_provider = 'BytePlus'
  WHERE model = 'seedance-2'     AND provider = 'media';
UPDATE model_pricing SET pricing_type = 'flat', api_provider = 'BytePlus'
  WHERE model = 'seedance-2-fast' AND provider = 'media';
UPDATE model_pricing SET pricing_type = 'flat', api_provider = 'ElevenLabs'
  WHERE model = 'elevenlabs-tts'     AND provider = 'media';
UPDATE model_pricing SET pricing_type = 'flat', api_provider = 'ElevenLabs'
  WHERE model = 'elevenlabs-sfx'     AND provider = 'media';
UPDATE model_pricing SET pricing_type = 'flat', api_provider = 'ElevenLabs'
  WHERE model = 'elevenlabs-sts'     AND provider = 'media';
UPDATE model_pricing SET pricing_type = 'flat', api_provider = 'ElevenLabs'
  WHERE model = 'elevenlabs-isolate' AND provider = 'media';


-- ── 3. Populate provider_cost_usd for LLM models ────────────
-- For LLMs, provider_cost_usd = estimated cost of a "typical" request.
-- Formula: (800 input + 1500 output tokens) using the model's per-1M rates.
-- This gives admins a quick comparison point against media models.

UPDATE model_pricing SET provider_cost_usd = ROUND(
  (800.0 / 1000000 * input_per_1m) + (1500.0 / 1000000 * output_per_1m), 6
) WHERE pricing_type = 'per_token' AND provider_cost_usd IS NULL;


-- ── 4. Refresh column comments for clarity ───────────────────

COMMENT ON COLUMN model_pricing.id IS 'Auto-increment row ID';
COMMENT ON COLUMN model_pricing.model IS 'Model identifier used in API requests (do not change without updating code)';
COMMENT ON COLUMN model_pricing.provider IS 'Code-facing provider key: gemini | openai | anthropic | media';
COMMENT ON COLUMN model_pricing.display_name IS 'Human-readable model name (shown to admins and users)';
COMMENT ON COLUMN model_pricing.category IS 'image | video | sound | llm';
COMMENT ON COLUMN model_pricing.api_provider IS 'Upstream API company: Google, OpenAI, Anthropic, BytePlus, Kling, ElevenLabs';
COMMENT ON COLUMN model_pricing.pricing_type IS 'flat = fixed credits per generation. per_token = billed by token count.';

COMMENT ON COLUMN model_pricing.credits_flat IS '🎯 MEDIA ONLY: Credits charged per generation. 1 credit = $0.0001. Edit this to change pricing.';
COMMENT ON COLUMN model_pricing.charge_usd IS '💰 Auto-computed: what we charge (credits_flat × $0.0001)';
COMMENT ON COLUMN model_pricing.provider_cost_usd IS '📊 What the upstream API charges us per request (USD). Edit this when provider prices change.';
COMMENT ON COLUMN model_pricing.margin_usd IS '📈 Auto-computed: charge_usd − provider_cost_usd';
COMMENT ON COLUMN model_pricing.margin_pct IS '📈 Auto-computed: margin as % of provider cost';

COMMENT ON COLUMN model_pricing.input_per_1m IS '🤖 LLM ONLY: Provider cost per 1M input tokens (USD)';
COMMENT ON COLUMN model_pricing.output_per_1m IS '🤖 LLM ONLY: Provider cost per 1M output tokens (USD)';
COMMENT ON COLUMN model_pricing.thinking_per_1m IS '🤖 LLM ONLY: Provider cost per 1M thinking tokens (USD)';
COMMENT ON COLUMN model_pricing.cached_input_per_1m IS '🤖 LLM ONLY: Provider cost per 1M cached input tokens (USD)';

COMMENT ON COLUMN model_pricing.is_active IS 'Toggle OFF to disable a model without deleting it';
COMMENT ON COLUMN model_pricing.updated_at IS 'Last time this row was modified';
COMMENT ON COLUMN model_pricing.notes IS 'Admin notes (e.g. "confirmed May 2026", "volume discount")';


-- ── 5. Auto-update updated_at on any row change ─────────────

CREATE OR REPLACE FUNCTION public.update_model_pricing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_model_pricing_updated ON public.model_pricing;
CREATE TRIGGER trg_model_pricing_updated
  BEFORE UPDATE ON public.model_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_model_pricing_timestamp();
