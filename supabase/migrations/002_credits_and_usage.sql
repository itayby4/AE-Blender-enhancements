-- ═══════════════════════════════════════════════════════════
-- PipeFX Credit & Usage System — Supabase Migration
-- ═══════════════════════════════════════════════════════════

-- ── profiles ──────────────────────────────────────────────
-- 1:1 with auth.users. Stores plan, credit balance, and held credits.
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  credits_balance INTEGER NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
  held_credits    INTEGER NOT NULL DEFAULT 0 CHECK (held_credits >= 0),
  stripe_customer_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── credit_transactions ───────────────────────────────────
-- Append-only ledger. Every credit movement is a row.
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id),
  amount      INTEGER NOT NULL, -- positive = credit, negative = debit
  type        TEXT NOT NULL CHECK (type IN ('purchase','debit','refund','promo','hold','release','adjustment')),
  description TEXT,
  reference   TEXT, -- e.g. stripe_session_id, usage_log_id
  idempotency_key TEXT UNIQUE, -- prevents double-processing
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ct_user ON credit_transactions(user_id, created_at);

-- ── device_tokens ─────────────────────────────────────────
-- Desktop ↔ cloud-api authentication. Hash-only storage.
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id),
  token_hash   TEXT NOT NULL UNIQUE, -- SHA-256 of the plaintext token
  name         TEXT NOT NULL DEFAULT 'My Device',
  last_used_at TIMESTAMPTZ,
  last_used_ip INET,
  expires_at   TIMESTAMPTZ, -- NULL = never expires
  revoked_at   TIMESTAMPTZ, -- NULL = active
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dt_hash ON device_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dt_user ON device_tokens(user_id);

-- ── model_pricing ─────────────────────────────────────────
-- Dynamic pricing table — updated by admin, read by cloud-api.
CREATE TABLE IF NOT EXISTS public.model_pricing (
  id              SERIAL PRIMARY KEY,
  model           TEXT NOT NULL,
  provider        TEXT NOT NULL,
  input_per_1m    NUMERIC(10,4) NOT NULL, -- USD per 1M input tokens
  output_per_1m   NUMERIC(10,4) NOT NULL, -- USD per 1M output tokens
  thinking_per_1m NUMERIC(10,4) NOT NULL DEFAULT 0,
  cached_input_per_1m NUMERIC(10,4) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(model, provider)
);

-- Seed with current pricing (April 2026)
INSERT INTO public.model_pricing (model, provider, input_per_1m, output_per_1m, thinking_per_1m, cached_input_per_1m)
VALUES
  ('gemini-3.1-pro-preview',        'gemini',    1.25,   5.0,  5.0,  0.315),
  ('gemini-3.1-flash-lite-preview',  'gemini',    0.075,  0.30, 0.30, 0.01875),
  ('gpt-5.4',                        'openai',    2.50,  10.0, 10.0,  1.25),
  ('claude-opus-4-6-20260401',       'anthropic', 15.0,  75.0,  0,    7.5),
  ('claude-sonnet-4-6-20260201',     'anthropic',  3.0,  15.0,  0,    1.5)
ON CONFLICT (model, provider) DO UPDATE SET
  input_per_1m = EXCLUDED.input_per_1m,
  output_per_1m = EXCLUDED.output_per_1m,
  thinking_per_1m = EXCLUDED.thinking_per_1m,
  cached_input_per_1m = EXCLUDED.cached_input_per_1m,
  updated_at = now();

-- ── usage_logs ────────────────────────────────────────────
-- Every LLM call, whether BYOK or cloud. One row per agent round.
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  user_id         UUID NOT NULL REFERENCES public.profiles(id),
  session_id      TEXT NOT NULL,
  request_id      TEXT NOT NULL,
  round_index     INTEGER NOT NULL DEFAULT 0,
  model           TEXT NOT NULL,
  provider        TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  thinking_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(12,8) NOT NULL DEFAULT 0,
  credits_debited INTEGER NOT NULL DEFAULT 0,
  is_byok         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ul_user      ON usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ul_session   ON usage_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_ul_request   ON usage_logs(request_id);

-- ── products ──────────────────────────────────────────────
-- Credit packages for purchase via Stripe.
CREATE TABLE IF NOT EXISTS public.products (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  credits_amount  INTEGER NOT NULL,
  price_usd       NUMERIC(8,2) NOT NULL,
  stripe_price_id TEXT UNIQUE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed starter packages (prices must match Paddle config and desktop UI)
INSERT INTO public.products (name, description, credits_amount, price_usd)
VALUES
  ('Starter Pack',  '100K credits',  100000,  10.00),
  ('Creator Pack',  '300K credits',  300000,  30.00),
  ('Studio Pack',   '700K credits',  700000, 100.00)
ON CONFLICT DO NOTHING;

-- ── stripe_events ─────────────────────────────────────────
-- Idempotency log for Stripe webhooks.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id         TEXT PRIMARY KEY, -- Stripe event ID (evt_xxx)
  type       TEXT NOT NULL,
  data       JSONB,
  processed  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- Atomic Credit Operations (RPC Functions)
-- ═══════════════════════════════════════════════════════════

-- Debit credits atomically. Raises exception if insufficient.
CREATE OR REPLACE FUNCTION public.debit_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.profiles
  SET credits_balance = credits_balance - p_amount,
      updated_at = now()
  WHERE id = p_user_id
    AND credits_balance >= p_amount
  RETURNING credits_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits'
      USING DETAIL = format('user %s tried to debit %s credits', p_user_id, p_amount);
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, reference, idempotency_key)
  VALUES (p_user_id, -p_amount, 'debit', p_description, p_reference, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Credit (add) credits atomically.
CREATE OR REPLACE FUNCTION public.credit_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT DEFAULT 'purchase',
  p_description TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.profiles
  SET credits_balance = credits_balance + p_amount,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING credits_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, reference, idempotency_key)
  VALUES (p_user_id, p_amount, p_type, p_description, p_reference, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reserve credits for a pending request.
CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.profiles
  SET held_credits = held_credits + p_amount,
      updated_at = now()
  WHERE id = p_user_id
    AND (credits_balance - held_credits) >= p_amount;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Settle a reservation: release hold and debit actual amount.
-- Safety: debits MIN(p_actual, credits_balance) so the CHECK constraint
-- never fires. If balance < p_actual the user is debited to zero and the
-- ledger records the capped amount. This prevents the exploit where a
-- CHECK failure causes the hold to be released while the LLM response
-- was already streamed — effectively free usage.
CREATE OR REPLACE FUNCTION public.settle_credits(
  p_user_id UUID,
  p_reserved INTEGER,
  p_actual INTEGER,
  p_description TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
  v_current_balance INTEGER;
  v_debit INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Lock the row and read current balance
  SELECT credits_balance INTO v_current_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Debit the lesser of actual cost and available balance (never go negative)
  v_debit := LEAST(p_actual, v_current_balance);

  UPDATE public.profiles
  SET held_credits = GREATEST(0, held_credits - p_reserved),
      credits_balance = credits_balance - v_debit,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING credits_balance INTO v_new_balance;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, reference, idempotency_key)
  VALUES (p_user_id, -v_debit, 'debit',
    CASE WHEN v_debit < p_actual
      THEN COALESCE(p_description, '') || ' [capped: requested=' || p_actual || ' debited=' || v_debit || ']'
      ELSE p_description
    END,
    p_reference, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Release a hold without debiting (for failed requests).
CREATE OR REPLACE FUNCTION public.release_hold(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET held_credits = GREATEST(0, held_credits - p_amount),
      updated_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════
-- Row-Level Security
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- profiles: users see only their own
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    credits_balance = (SELECT credits_balance FROM public.profiles WHERE id = auth.uid())
    AND held_credits = (SELECT held_credits FROM public.profiles WHERE id = auth.uid())
    AND plan = (SELECT plan FROM public.profiles WHERE id = auth.uid())
  );

-- credit_transactions: users see only their own, cannot insert directly
CREATE POLICY ct_select ON public.credit_transactions FOR SELECT USING (user_id = auth.uid());

-- device_tokens: users see and manage their own
CREATE POLICY dt_select ON public.device_tokens FOR SELECT USING (user_id = auth.uid());
CREATE POLICY dt_update ON public.device_tokens FOR UPDATE USING (user_id = auth.uid());

-- usage_logs: users see only their own
CREATE POLICY ul_select ON public.usage_logs FOR SELECT USING (user_id = auth.uid());

-- model_pricing: public read
CREATE POLICY mp_select ON public.model_pricing FOR SELECT USING (true);

-- products: public read
CREATE POLICY prod_select ON public.products FOR SELECT USING (true);

-- stripe_events: service_role only (no public policy)
