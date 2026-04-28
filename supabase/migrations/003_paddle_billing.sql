-- ═══════════════════════════════════════════════════════════
-- PipeFX Paddle Billing Migration
-- Adds Paddle subscription columns to profiles and products,
-- creates paddle_events idempotency table.
-- Non-breaking: keeps legacy Stripe columns intact.
-- ═══════════════════════════════════════════════════════════

-- ── Extend profiles with Paddle subscription state ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN (
      'none', 'active', 'past_due', 'paused', 'canceled', 'trialing'
    ));

CREATE INDEX IF NOT EXISTS idx_profiles_paddle_cust
  ON public.profiles(paddle_customer_id)
  WHERE paddle_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_paddle_sub
  ON public.profiles(paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;

-- ── Extend products with Paddle catalog IDs ──
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS paddle_price_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS paddle_product_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'month'
    CHECK (billing_interval IN ('month', 'year', 'one_time'));

-- ── Paddle webhook idempotency log ──
CREATE TABLE IF NOT EXISTS public.paddle_events (
  id         TEXT PRIMARY KEY,       -- Paddle notification / event ID
  type       TEXT NOT NULL,
  data       JSONB,
  processed  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS ──
ALTER TABLE public.paddle_events ENABLE ROW LEVEL SECURITY;
-- service_role only — no public SELECT policy needed.

-- ── Seed Paddle price IDs ──
UPDATE public.products SET
  paddle_price_id = 'pri_01kq8gpgmnvxzgm5vbhqcvmsvh',
  billing_interval = 'month'
WHERE name = 'Starter Pack';

UPDATE public.products SET
  paddle_price_id = 'pri_01kq8gsa26ej1rjnzmzng215gq',
  billing_interval = 'month'
WHERE name = 'Creator Pack';

UPDATE public.products SET
  paddle_price_id = 'pri_01kq8gwf6vjt1syhah5wacv334',
  billing_interval = 'month'
WHERE name = 'Studio Pack';
