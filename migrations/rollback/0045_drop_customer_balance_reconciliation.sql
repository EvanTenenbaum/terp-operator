-- Rollback for migrations/0045_customer_balance_reconciliation.sql
--
-- Drops the audit table (and its two indexes implicitly) created by 0045.
-- Idempotent (uses IF EXISTS) so re-running this rollback is a no-op.
--
-- Run order: this rollback drops data — every row written by prior nightly
-- runs is destroyed. Operators should export the table contents (or take a
-- pg_dump snapshot of the table) before applying this rollback if the audit
-- history matters.

DROP INDEX IF EXISTS customer_balance_recon_run_idx;
DROP INDEX IF EXISTS customer_balance_recon_customer_idx;
DROP TABLE IF EXISTS customer_balance_reconciliation;
