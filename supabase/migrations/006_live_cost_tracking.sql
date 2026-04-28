-- ═══════════════════════════════════════════════════════════
-- PipeFX — Migration 006: Live Provider Cost Tracking
-- ═══════════════════════════════════════════════════════════
--
-- Tracks actual provider cost per generation in usage_logs,
-- enabling real-time margin analysis from live production data.
-- ═══════════════════════════════════════════════════════════

-- ── 1. Add provider cost column to usage_logs ────────────────
ALTER TABLE public.usage_logs
  ADD COLUMN IF NOT EXISTS provider_cost_usd NUMERIC(12,8) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.usage_logs.provider_cost_usd IS
  'Actual cost PipeFX paid to the upstream provider for this request (USD).';

-- ── 2. Live cost analytics view ──────────────────────────────
-- Aggregates real usage_logs data to show actual costs, revenue,
-- and margins per model — updated in real-time from production.

CREATE OR REPLACE VIEW public.live_cost_analytics AS
SELECT
  ul.model,
  ul.provider,
  COUNT(*)                                         AS total_generations,
  -- What we charged users (credits → USD)
  SUM(ul.credits_debited)                          AS total_credits_charged,
  ROUND(SUM(ul.credits_debited) * 0.0001, 4)       AS total_revenue_usd,
  -- What providers charged us
  ROUND(SUM(ul.provider_cost_usd), 4)              AS total_provider_cost_usd,
  -- Per-generation averages
  ROUND(AVG(ul.credits_debited) * 0.0001, 6)       AS avg_charge_usd,
  ROUND(AVG(ul.provider_cost_usd), 6)              AS avg_provider_cost_usd,
  -- Margin
  ROUND(SUM(ul.credits_debited) * 0.0001
        - SUM(ul.provider_cost_usd), 4)            AS total_margin_usd,
  CASE WHEN SUM(ul.provider_cost_usd) > 0
    THEN ROUND(
      (SUM(ul.credits_debited) * 0.0001 - SUM(ul.provider_cost_usd))
      / SUM(ul.provider_cost_usd) * 100, 1)
    ELSE NULL
  END                                              AS margin_pct,
  -- Time range
  MIN(ul.created_at)                               AS first_generation,
  MAX(ul.created_at)                               AS last_generation
FROM public.usage_logs ul
WHERE ul.is_byok = false   -- only cloud-mode (we only pay for these)
GROUP BY ul.model, ul.provider
ORDER BY total_provider_cost_usd DESC;

-- ── 3. Daily cost breakdown view ─────────────────────────────
-- Same data but broken down by day for trend analysis.

CREATE OR REPLACE VIEW public.daily_cost_breakdown AS
SELECT
  DATE(ul.created_at)                              AS day,
  ul.model,
  ul.provider,
  COUNT(*)                                         AS generations,
  ROUND(SUM(ul.credits_debited) * 0.0001, 4)       AS revenue_usd,
  ROUND(SUM(ul.provider_cost_usd), 4)              AS cost_usd,
  ROUND(SUM(ul.credits_debited) * 0.0001
        - SUM(ul.provider_cost_usd), 4)            AS margin_usd
FROM public.usage_logs ul
WHERE ul.is_byok = false
GROUP BY DATE(ul.created_at), ul.model, ul.provider
ORDER BY day DESC, cost_usd DESC;
