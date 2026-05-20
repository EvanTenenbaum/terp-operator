-- Issue #18 slice 4 — nightly customers.balance reconciliation audit table.
--
-- Safety-net for the denormalized `customers.balance` column. The column is
-- a projection of `client_ledger_entries.amount` but does not (yet) carry a
-- SQL-level invariant CHECK that ties the two together. This table is the
-- output of `reconcileCustomerBalances` (src/server/services/balanceReconciliation.ts),
-- invoked once per night by the operator's scheduler (DigitalOcean App
-- Platform scheduled job, k8s CronJob, etc.).
--
-- Schema:
--   - `run_id`   — UUID grouping all rows from a single nightly invocation.
--                  A new run_id is generated per invocation so re-runs do not
--                  collide and the operator can audit "the 2026-05-20 02:00
--                  run" as a self-contained snapshot.
--   - `expected` — the authoritative SUM(client_ledger_entries.amount) for
--                  the customer at scan time.
--   - `actual`   — the denormalized `customers.balance` value at scan time.
--   - `drift`    — `expected - actual`. Stored in NUMERIC(14,2) (one digit
--                  wider than customers.balance NUMERIC(12,2)) so a runaway
--                  drift does not overflow the audit row itself.
--   - `detected_at` — wall-clock timestamp of detection. Defaults to now() so
--                  the application can omit it on insert.
--
-- Only customers whose absolute drift exceeds `CUSTOMER_BALANCE_DRIFT_THRESHOLD`
-- (default $0.01) get a row. No-drift customers are intentionally NOT written
-- so the table stays small even after years of nightly runs.

CREATE TABLE IF NOT EXISTS customer_balance_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  expected NUMERIC(14,2) NOT NULL,
  actual NUMERIC(14,2) NOT NULL,
  drift NUMERIC(14,2) NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer history lookup: "show me every reconciliation row for customer X,
-- newest first." Operator dashboards drill down by customer.
CREATE INDEX IF NOT EXISTS customer_balance_recon_customer_idx
  ON customer_balance_reconciliation (customer_id, detected_at DESC);

-- Run summary lookup: "show me every drifted customer in the 2026-05-20 run."
-- Cron post-processors and ad-hoc queries filter by run_id.
CREATE INDEX IF NOT EXISTS customer_balance_recon_run_idx
  ON customer_balance_reconciliation (run_id);
