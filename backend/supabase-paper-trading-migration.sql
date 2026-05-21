-- Paper trading tables for MarketIQ
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS paper_portfolios (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT      NOT NULL UNIQUE,
  cash_balance NUMERIC(15,4) NOT NULL DEFAULT 500,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT      NOT NULL,
  ticker      TEXT      NOT NULL,
  shares      NUMERIC(15,6) NOT NULL DEFAULT 0,
  avg_cost    NUMERIC(15,4) NOT NULL DEFAULT 0,
  target_price NUMERIC(15,4),
  stop_loss   NUMERIC(15,4),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

CREATE TABLE IF NOT EXISTS paper_transactions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT      NOT NULL,
  type        TEXT      NOT NULL CHECK (type IN ('buy','sell','deposit')),
  ticker      TEXT,
  shares      NUMERIC(15,6),
  price       NUMERIC(15,4),
  total       NUMERIC(15,4) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paper_cash_purchases (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              TEXT      NOT NULL,
  usd_paid             NUMERIC(10,2) NOT NULL,
  paper_cash_credited  NUMERIC(15,4) NOT NULL,
  stripe_session_id    TEXT      UNIQUE,
  status               TEXT      NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
