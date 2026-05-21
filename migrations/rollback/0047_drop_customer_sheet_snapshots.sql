-- Rollback for migrations/0047_create_customer_sheet_snapshots.sql
--
-- Drops the customer_sheet_snapshots table and its index.
-- Idempotent (uses IF EXISTS) so re-running this rollback is a no-op.
--
-- Run order: this rollback drops data — every snapshot written by operators
-- is destroyed. Export the table contents before applying this rollback if
-- snapshot history matters.

DROP INDEX IF EXISTS customer_sheet_snapshots_customer_created_idx;
DROP TABLE IF EXISTS customer_sheet_snapshots;
