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

CREATE TABLE IF NOT EXISTS customer_credit_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stance_id uuid NOT NULL REFERENCES credit_engine_stances(id) ON DELETE RESTRICT,
  score_revenue_momentum   integer NOT NULL CHECK (score_revenue_momentum BETWEEN 0 AND 100),
  score_cash_collection    integer NOT NULL CHECK (score_cash_collection BETWEEN 0 AND 100),
  score_profitability      integer NOT NULL CHECK (score_profitability BETWEEN 0 AND 100),
  score_debt_aging         integer NOT NULL CHECK (score_debt_aging BETWEEN 0 AND 100),
  score_repayment_velocity integer NOT NULL CHECK (score_repayment_velocity BETWEEN 0 AND 100),
  score_tenure_depth       integer NOT NULL CHECK (score_tenure_depth BETWEEN 0 AND 100),
  confidence_revenue_momentum   varchar(8) NOT NULL,
  confidence_cash_collection    varchar(8) NOT NULL,
  confidence_profitability      varchar(8) NOT NULL,
  confidence_debt_aging         varchar(8) NOT NULL,
  confidence_repayment_velocity varchar(8) NOT NULL,
  confidence_tenure_depth       varchar(8) NOT NULL,
  overall_score    integer NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  base_amount      numeric(12,2) NOT NULL CHECK (base_amount >= 0),
  multiplier       numeric(5,2)  NOT NULL CHECK (multiplier >= 0 AND multiplier <= 10.0),
  recommended_limit numeric(12,2) NOT NULL CHECK (recommended_limit >= 0 AND recommended_limit <= 100000000),
  engine_max_applied numeric(12,2),
  final_limit       numeric(12,2) NOT NULL CHECK (final_limit >= 0 AND final_limit <= 100000000),
  triggered_by varchar(32) NOT NULL CHECK (triggered_by IN (
    'event:postSalesOrder','event:confirmSalesOrder','event:recordPayment',
    'event:allocatePayment','event:postLedgerRow','event:voidInvoice',
    'event:reverseSalesOrder','event:disputeInvoice','event:resolveDispute',
    'event:setEngineMax','event:setStance','event:stanceEdited',
    'nightly','manualTrigger','shadowMode','bulkRevert','reconciliation'
  )),
  triggered_by_command_id uuid REFERENCES command_journal(id),
  applied boolean NOT NULL,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_credit_assessments_customer_idx
  ON customer_credit_assessments(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_credit_assessments_stance_idx
  ON customer_credit_assessments(stance_id);

CREATE TABLE IF NOT EXISTS credit_recompute_queue (
  id bigserial PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  enqueued_by varchar(64) NOT NULL,
  command_id uuid REFERENCES command_journal(id),
  attempts integer NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  last_error text,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed_terminal'))
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_recompute_queue_pending_unique
  ON credit_recompute_queue(customer_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS credit_recompute_queue_status_idx
  ON credit_recompute_queue(status, enqueued_at);

CREATE TABLE IF NOT EXISTS user_dismissed_banners (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banner_key varchar(64) NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, banner_key)
);
