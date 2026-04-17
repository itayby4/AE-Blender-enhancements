-- =====================================================================
-- PipeFX: User profiles, credits, device tokens, usage logs
-- =====================================================================
-- This migration EXTENDS the existing ReviewNotes schema (videos/comments/
-- notes/share_notes). It does not touch or alter those tables. Safe to run
-- multiple times — every create is guarded by IF NOT EXISTS.
--
-- Credit unit: 1 credit = $0.0001 USD (10,000 credits = $1).
--   Pick this to give fine-grained token pricing while keeping integer math.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- profiles : 1-to-1 with auth.users, stores display info + credit balance
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name        TEXT,
  avatar_url          TEXT,
  stripe_customer_id  TEXT UNIQUE,
  credits_balance     BIGINT NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
  plan                TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'paid')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON profiles(stripe_customer_id);

-- ---------------------------------------------------------------------
-- credit_transactions : append-only ledger
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_transactions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        BIGINT NOT NULL, -- positive = credit, negative = debit
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  type          TEXT NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'grant', 'adjustment')),
  reference     TEXT,    -- e.g., stripe_checkout_session_id, usage_log_id
  reason        TEXT,    -- human-readable explanation
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user_id_created ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_reference ON credit_transactions(reference);

-- ---------------------------------------------------------------------
-- device_tokens : bearer tokens used by the desktop agent
-- We NEVER store the plaintext token. The server stores a sha256 hash.
-- token_prefix is a short identifier shown in the UI so users can
-- recognize which token is which ("pfx_a1b2…").
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash    TEXT UNIQUE NOT NULL,
  token_prefix  TEXT NOT NULL,
  name          TEXT NOT NULL,         -- user-chosen label, e.g. "MacBook Pro"
  last_used_at  TIMESTAMPTZ,
  last_used_ip  INET,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_hash ON device_tokens(token_hash) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- usage_logs : one row per AI call metered on the cloud API
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_logs (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token_id   UUID REFERENCES device_tokens(id) ON DELETE SET NULL,
  provider          TEXT NOT NULL,     -- 'openai' | 'gemini' | 'anthropic'
  model             TEXT NOT NULL,     -- e.g., 'gpt-4o', 'claude-3-5-sonnet'
  prompt_tokens     INT NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens INT NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens      INT GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
  credits_charged   BIGINT NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  request_id        TEXT,
  latency_ms        INT,
  status            TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'partial')),
  error_code        TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_created ON usage_logs(user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- products : credit packs purchasable via Stripe
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                TEXT PRIMARY KEY,            -- internal ID e.g. 'credits_10usd'
  stripe_price_id   TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  credits           BIGINT NOT NULL CHECK (credits > 0),
  price_cents       INT NOT NULL CHECK (price_cents > 0),
  currency          TEXT NOT NULL DEFAULT 'usd',
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- stripe_events : webhook idempotency log
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_events (
  stripe_event_id   TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  payload           JSONB NOT NULL,
  processed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- FUNCTIONS
-- =====================================================================

-- auto-create a profiles row for every new auth.users row
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- updated_at keeper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- debit_credits : atomically deduct credits, insert ledger row
-- Raises exception 'insufficient_credits' if balance would go negative.
-- Returns the new balance.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION debit_credits(
  p_user_id   UUID,
  p_amount    BIGINT,
  p_reason    TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_metadata  JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance BIGINT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive' USING HINT = 'debit_credits expects a positive amount to deduct';
  END IF;

  UPDATE profiles
     SET credits_balance = credits_balance - p_amount
   WHERE id = p_user_id
     AND credits_balance >= p_amount
   RETURNING credits_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits' USING HINT = 'User does not have enough credits';
  END IF;

  INSERT INTO credit_transactions (user_id, amount, balance_after, type, reason, reference, metadata)
  VALUES (p_user_id, -p_amount, v_new_balance, 'usage', p_reason, p_reference, p_metadata);

  RETURN v_new_balance;
END;
$$;

-- ---------------------------------------------------------------------
-- credit_credits : atomically add credits, insert ledger row
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_credits(
  p_user_id   UUID,
  p_amount    BIGINT,
  p_type      TEXT DEFAULT 'purchase',
  p_reason    TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_metadata  JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance BIGINT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;
  IF p_type NOT IN ('purchase', 'refund', 'grant', 'adjustment') THEN
    RAISE EXCEPTION 'invalid_credit_type: %', p_type;
  END IF;

  UPDATE profiles
     SET credits_balance = credits_balance + p_amount
   WHERE id = p_user_id
   RETURNING credits_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  INSERT INTO credit_transactions (user_id, amount, balance_after, type, reason, reference, metadata)
  VALUES (p_user_id, p_amount, v_new_balance, p_type, p_reason, p_reference, p_metadata);

  RETURN v_new_balance;
END;
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events       ENABLE ROW LEVEL SECURITY;

-- profiles --------------------------------------------------------------
DROP POLICY IF EXISTS "profiles: self select" ON profiles;
CREATE POLICY "profiles: self select" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile but NOT the balance/plan/stripe_customer_id.
-- Those columns are protected by a trigger below.
DROP POLICY IF EXISTS "profiles: self update" ON profiles;
CREATE POLICY "profiles: self update" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION protect_profile_privileged_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- allow service_role (bypasses RLS anyway) — this trigger catches anon/authenticated edits
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.credits_balance    IS DISTINCT FROM OLD.credits_balance    THEN
    RAISE EXCEPTION 'cannot_modify_credits_balance_from_client';
  END IF;
  IF NEW.plan               IS DISTINCT FROM OLD.plan               THEN
    RAISE EXCEPTION 'cannot_modify_plan_from_client';
  END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'cannot_modify_stripe_customer_id_from_client';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_protect_privileged ON profiles;
CREATE TRIGGER profiles_protect_privileged
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_privileged_fields();

-- credit_transactions: read-only from client
DROP POLICY IF EXISTS "credit_tx: self select" ON credit_transactions;
CREATE POLICY "credit_tx: self select" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- device_tokens: users can view their own and revoke (update revoked_at);
-- inserts happen via server API (service_role) so we never expose token_hash generation.
DROP POLICY IF EXISTS "device_tokens: self select" ON device_tokens;
CREATE POLICY "device_tokens: self select" ON device_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_tokens: self revoke" ON device_tokens;
CREATE POLICY "device_tokens: self revoke" ON device_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- usage_logs: read-only from client
DROP POLICY IF EXISTS "usage_logs: self select" ON usage_logs;
CREATE POLICY "usage_logs: self select" ON usage_logs
  FOR SELECT USING (auth.uid() = user_id);

-- products: public read of active products (no auth required)
DROP POLICY IF EXISTS "products: public read active" ON products;
CREATE POLICY "products: public read active" ON products
  FOR SELECT USING (is_active = TRUE);

-- stripe_events: service_role only (no policies needed — RLS blocks by default)

-- =====================================================================
-- BACKFILL: create profiles row for any pre-existing auth.users
-- =====================================================================
INSERT INTO profiles (id, display_name)
SELECT u.id,
       COALESCE(u.raw_user_meta_data->>'full_name',
                u.raw_user_meta_data->>'name',
                split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- =====================================================================
-- DONE
-- =====================================================================
