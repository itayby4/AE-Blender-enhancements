-- ═══════════════════════════════════════════════════════════
-- PipeFX — Migration 008: Rebuild model_pricing with
-- proper column order + auto-computed LLM costs
-- ═══════════════════════════════════════════════════════════
--
-- PostgreSQL doesn't support column reordering, so we recreate
-- the table with the ideal admin-facing layout.
--
-- Also adds a trigger so LLM rows auto-compute provider_cost_usd
-- from the per-1M token rates whenever they change.
-- ═══════════════════════════════════════════════════════════

-- ── 0. Drop everything that depends on the old table ─────────
DROP VIEW IF EXISTS public.pricing_margins CASCADE;
DROP VIEW IF EXISTS public.live_cost_analytics CASCADE;
DROP VIEW IF EXISTS public.daily_cost_breakdown CASCADE;
DROP TRIGGER IF EXISTS trg_model_pricing_updated ON public.model_pricing;
DROP POLICY IF EXISTS mp_select ON public.model_pricing;

-- ── 1. Rename old table ──────────────────────────────────────
ALTER TABLE public.model_pricing RENAME TO model_pricing_old;

-- ── 2. Create new table with clean column order ──────────────
CREATE TABLE public.model_pricing (
  id                  SERIAL PRIMARY KEY,

  -- ─── Identity (who is this?) ───
  display_name        TEXT,
  category            TEXT,                -- image | video | sound | llm
  api_provider        TEXT,                -- Google, OpenAI, Anthropic, BytePlus, Kling, ElevenLabs
  model               TEXT NOT NULL,       -- API identifier (used in code)
  provider            TEXT NOT NULL,       -- Code key: gemini | openai | anthropic | media
  pricing_type        TEXT NOT NULL DEFAULT 'flat'
                        CHECK (pricing_type IN ('flat', 'per_token')),
  is_active           BOOLEAN NOT NULL DEFAULT true,

  -- ─── Media pricing (flat-rate) ───
  credits_flat        INTEGER,             -- 🎯 What we charge (in credits). 1 credit = $0.0001
  charge_usd          NUMERIC(10,6) GENERATED ALWAYS AS (credits_flat * 0.0001) STORED,

  -- ─── Costs & margins ───
  provider_cost_usd   NUMERIC(10,6),       -- 📊 What the upstream API charges us (USD per request)
  margin_usd          NUMERIC(10,6) GENERATED ALWAYS AS (
                        CASE WHEN credits_flat IS NOT NULL AND provider_cost_usd IS NOT NULL
                          THEN (credits_flat * 0.0001) - provider_cost_usd
                          ELSE NULL END
                      ) STORED,
  margin_pct          NUMERIC(5,1) GENERATED ALWAYS AS (
                        CASE WHEN credits_flat IS NOT NULL AND provider_cost_usd IS NOT NULL
                          AND provider_cost_usd > 0
                          THEN ((credits_flat * 0.0001) - provider_cost_usd)
                               / provider_cost_usd * 100
                          ELSE NULL END
                      ) STORED,

  -- ─── LLM pricing (per-token) ───
  input_per_1m        NUMERIC(10,4) NOT NULL DEFAULT 0,
  output_per_1m       NUMERIC(10,4) NOT NULL DEFAULT 0,
  thinking_per_1m     NUMERIC(10,4) NOT NULL DEFAULT 0,
  cached_input_per_1m NUMERIC(10,4) NOT NULL DEFAULT 0,

  -- ─── Meta ───
  notes               TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(model, provider)
);

-- ── 3. Copy data from old table ──────────────────────────────
INSERT INTO public.model_pricing (
  id, display_name, category, api_provider, model, provider, pricing_type, is_active,
  credits_flat, provider_cost_usd,
  input_per_1m, output_per_1m, thinking_per_1m, cached_input_per_1m,
  notes, updated_at
)
SELECT
  id,
  display_name,
  category,
  api_provider,
  model,
  provider,
  COALESCE(pricing_type, CASE WHEN credits_flat IS NOT NULL THEN 'flat' ELSE 'per_token' END),
  is_active,
  credits_flat,
  provider_cost_usd,
  input_per_1m,
  output_per_1m,
  thinking_per_1m,
  cached_input_per_1m,
  notes,
  updated_at
FROM public.model_pricing_old;

-- Reset the sequence to continue from the max id
SELECT setval('model_pricing_id_seq', COALESCE((SELECT MAX(id) FROM model_pricing), 0) + 1);

-- ── 4. Drop old table ────────────────────────────────────────
DROP TABLE public.model_pricing_old;


-- ── 5. Auto-compute provider_cost_usd for LLM rows ──────────
-- When an admin edits input_per_1m or output_per_1m, this trigger
-- auto-calculates provider_cost_usd based on a typical request:
--   800 input + 1500 output + 200 thinking tokens
-- Media rows are left alone (admin sets provider_cost_usd manually).

CREATE OR REPLACE FUNCTION public.auto_compute_pricing()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-update provider_cost_usd for LLM (per_token) models
  IF NEW.pricing_type = 'per_token' THEN
    NEW.provider_cost_usd := ROUND(
      (800.0  / 1000000 * NEW.input_per_1m) +
      (1500.0 / 1000000 * NEW.output_per_1m) +
      (200.0  / 1000000 * NEW.thinking_per_1m),
    6);
  END IF;

  -- Always bump updated_at
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_model_pricing_auto
  BEFORE INSERT OR UPDATE ON public.model_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_compute_pricing();

-- Force-recalculate LLM rows now
UPDATE model_pricing SET input_per_1m = input_per_1m
  WHERE pricing_type = 'per_token';


-- ── 6. Re-create RLS + policies ──────────────────────────────
ALTER TABLE public.model_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY mp_select ON public.model_pricing FOR SELECT USING (true);


-- ── 7. Re-create analytics views ─────────────────────────────

CREATE OR REPLACE VIEW public.live_cost_analytics AS
SELECT
  ul.model, ul.provider,
  COUNT(*) AS total_generations,
  SUM(ul.credits_debited) AS total_credits_charged,
  ROUND(SUM(ul.credits_debited) * 0.0001, 4) AS total_revenue_usd,
  ROUND(SUM(ul.provider_cost_usd), 4) AS total_provider_cost_usd,
  ROUND(AVG(ul.credits_debited) * 0.0001, 6) AS avg_charge_usd,
  ROUND(AVG(ul.provider_cost_usd), 6) AS avg_provider_cost_usd,
  ROUND(SUM(ul.credits_debited) * 0.0001 - SUM(ul.provider_cost_usd), 4) AS total_margin_usd,
  CASE WHEN SUM(ul.provider_cost_usd) > 0
    THEN ROUND((SUM(ul.credits_debited) * 0.0001 - SUM(ul.provider_cost_usd))
         / SUM(ul.provider_cost_usd) * 100, 1)
    ELSE NULL END AS margin_pct,
  MIN(ul.created_at) AS first_generation,
  MAX(ul.created_at) AS last_generation
FROM public.usage_logs ul
WHERE ul.is_byok = false
GROUP BY ul.model, ul.provider
ORDER BY total_provider_cost_usd DESC;

CREATE OR REPLACE VIEW public.daily_cost_breakdown AS
SELECT
  DATE(ul.created_at) AS day, ul.model, ul.provider,
  COUNT(*) AS generations,
  ROUND(SUM(ul.credits_debited) * 0.0001, 4) AS revenue_usd,
  ROUND(SUM(ul.provider_cost_usd), 4) AS cost_usd,
  ROUND(SUM(ul.credits_debited) * 0.0001 - SUM(ul.provider_cost_usd), 4) AS margin_usd
FROM public.usage_logs ul
WHERE ul.is_byok = false
GROUP BY DATE(ul.created_at), ul.model, ul.provider
ORDER BY day DESC, cost_usd DESC;

-- Lock down admin views
REVOKE ALL ON public.live_cost_analytics FROM anon, authenticated;
REVOKE ALL ON public.daily_cost_breakdown FROM anon, authenticated;


-- ── 8. Column comments (visible on hover in Table Editor) ────
COMMENT ON COLUMN model_pricing.display_name IS 'Human-readable model name';
COMMENT ON COLUMN model_pricing.category IS 'image | video | sound | llm';
COMMENT ON COLUMN model_pricing.api_provider IS 'Upstream company: Google, OpenAI, Anthropic, BytePlus, Kling, ElevenLabs';
COMMENT ON COLUMN model_pricing.model IS '⚠️ API identifier — do not rename without updating code';
COMMENT ON COLUMN model_pricing.provider IS '⚠️ Code key — do not rename (gemini | openai | anthropic | media)';
COMMENT ON COLUMN model_pricing.pricing_type IS 'flat = fixed credits/gen (media). per_token = billed by token count (LLM)';
COMMENT ON COLUMN model_pricing.credits_flat IS '🎯 MEDIA: Credits per generation. Edit this to change price. (1 credit = $0.0001)';
COMMENT ON COLUMN model_pricing.charge_usd IS '💰 Auto: what we charge in USD (= credits_flat × $0.0001)';
COMMENT ON COLUMN model_pricing.provider_cost_usd IS '📊 Cost per request from upstream API. Auto for LLMs, manual for media.';
COMMENT ON COLUMN model_pricing.margin_usd IS '📈 Auto: charge_usd − provider_cost_usd';
COMMENT ON COLUMN model_pricing.margin_pct IS '📈 Auto: margin as % of provider cost';
COMMENT ON COLUMN model_pricing.input_per_1m IS '🤖 LLM: USD per 1M input tokens (edit → provider_cost auto-updates)';
COMMENT ON COLUMN model_pricing.output_per_1m IS '🤖 LLM: USD per 1M output tokens (edit → provider_cost auto-updates)';
COMMENT ON COLUMN model_pricing.thinking_per_1m IS '🤖 LLM: USD per 1M thinking tokens';
COMMENT ON COLUMN model_pricing.cached_input_per_1m IS '🤖 LLM: USD per 1M cached input tokens';
COMMENT ON COLUMN model_pricing.notes IS 'Admin notes';
COMMENT ON COLUMN model_pricing.is_active IS 'Toggle off to disable without deleting';
