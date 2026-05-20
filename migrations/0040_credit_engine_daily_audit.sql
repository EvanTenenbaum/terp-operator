-- Credit Engine Phase 9: nightly safety-net daily audit table.
--
-- One row per UTC day, written by `runNightlyCreditEngineAudit`. Operators
-- read this table for the daily safety-net summary; dashboards & alert
-- rules join against it. UPSERT keyed by `day` keeps re-runs idempotent.
--
-- The `summary` JSONB column carries the full drift + stuck queue payload
-- so the audit row is self-contained — no need to cross-join with
-- customer_credit_assessments or credit_recompute_queue at read time.

CREATE TABLE IF NOT EXISTS credit_engine_daily_audit (
  day DATE PRIMARY KEY,
  decisions_issued INTEGER NOT NULL DEFAULT 0,
  customers_drifted INTEGER NOT NULL DEFAULT 0,
  stuck_queue_items INTEGER NOT NULL DEFAULT 0,
  run_started_at TIMESTAMPTZ NOT NULL,
  run_completed_at TIMESTAMPTZ NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'
);
