-- ═══════════════════════════════════════════════════════════
-- PipeFX — Migration 004: Unified Pricing (LLM + Media Gen)
-- ═══════════════════════════════════════════════════════════
--
-- Adds a `credits_flat` column to `model_pricing` so we can store
-- flat-rate credit costs for media generation models alongside
-- existing token-based LLM pricing. Media rows use `credits_flat`;
-- LLM rows use the existing `input_per_1m` / `output_per_1m` columns.
--
-- The `provider` column is relaxed to accept 'media' alongside
-- 'gemini', 'openai', 'anthropic'.
-- ═══════════════════════════════════════════════════════════

-- Add the flat-rate credits column (NULL for LLM rows that use token pricing)
ALTER TABLE public.model_pricing
  ADD COLUMN IF NOT EXISTS credits_flat INTEGER;

COMMENT ON COLUMN public.model_pricing.credits_flat IS
  'Flat credit cost per generation. Used for media gen models. NULL for token-priced LLM models.';

-- ── Seed media generation pricing ────────────────────────────
-- 1 credit = $0.0001 USD.  So 200 credits = $0.02.

INSERT INTO public.model_pricing
  (model, provider, input_per_1m, output_per_1m, thinking_per_1m, cached_input_per_1m, credits_flat)
VALUES
  -- Image generation
  ('gemini2',            'media',  0, 0, 0, 0,  100),   -- ~$0.01
  ('gpt-image-2',       'media',  0, 0, 0, 0,  400),   -- ~$0.04
  ('seeddream45',        'media',  0, 0, 0, 0,  200),   -- ~$0.02

  -- Video generation
  ('kling3',             'media',  0, 0, 0, 0, 5000),   -- ~$0.50
  ('seedance-2',         'media',  0, 0, 0, 0, 5000),   -- ~$0.50
  ('seedance-2-fast',    'media',  0, 0, 0, 0, 3000),   -- ~$0.30

  -- Sound generation (ElevenLabs)
  ('elevenlabs-tts',     'media',  0, 0, 0, 0,  200),   -- ~$0.02
  ('elevenlabs-sfx',     'media',  0, 0, 0, 0,  200),   -- ~$0.02
  ('elevenlabs-sts',     'media',  0, 0, 0, 0,  300),   -- ~$0.03
  ('elevenlabs-isolate', 'media',  0, 0, 0, 0,  200)    -- ~$0.02
ON CONFLICT (model, provider) DO UPDATE SET
  credits_flat = EXCLUDED.credits_flat,
  updated_at = now();
