-- Credit Engine Phase 1: stances, engine config, append-only histories.
-- This migration sets up the static-config side of the engine.
-- Assessment, recompute queue, and customer column additions land in subsequent
-- file ranges (later steps in this migration).

CREATE TABLE IF NOT EXISTS credit_engine_stances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL UNIQUE,
  description text,
  weight_revenue_momentum    integer NOT NULL,
  weight_cash_collection     integer NOT NULL,
  weight_profitability       integer NOT NULL,
  weight_debt_aging          integer NOT NULL,
  weight_repayment_velocity  integer NOT NULL,
  weight_tenure_depth        integer NOT NULL,
  is_seeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_engine_stances_weights_sum CHECK (
    weight_revenue_momentum + weight_cash_collection + weight_profitability +
    weight_debt_aging + weight_repayment_velocity + weight_tenure_depth = 100
  ),
  CONSTRAINT credit_engine_stances_weights_nonneg CHECK (
    weight_revenue_momentum >= 0 AND weight_cash_collection >= 0 AND
    weight_profitability >= 0 AND weight_debt_aging >= 0 AND
    weight_repayment_velocity >= 0 AND weight_tenure_depth >= 0
  )
);

CREATE TABLE IF NOT EXISTS credit_engine_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_default_stance_id uuid NOT NULL REFERENCES credit_engine_stances(id) ON DELETE RESTRICT,
  cold_start_min_posted_invoices integer NOT NULL DEFAULT 3,
  cold_start_min_tenure_days integer NOT NULL DEFAULT 60,
  manual_override_reminder_default_days integer NOT NULL DEFAULT 60,
  manual_override_snooze_cap_days integer NOT NULL DEFAULT 365,
  shadow_mode boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS credit_engine_config_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL REFERENCES users(id),
  command_id uuid REFERENCES command_journal(id),
  pre_state jsonb NOT NULL,
  post_state jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_engine_stance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stance_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid NOT NULL REFERENCES users(id),
  command_id uuid REFERENCES command_journal(id),
  action varchar(16) NOT NULL CHECK (action IN ('create','update','delete')),
  pre_state jsonb,
  post_state jsonb,
  affected_customer_count integer
);
