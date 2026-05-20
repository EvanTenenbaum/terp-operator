-- Rollback for migrations/0041_money_invariants.sql
--
-- Drops the four NOT VALID CHECK constraints added by 0041. Idempotent
-- (uses IF EXISTS) so re-running this rollback is a no-op.
--
-- Run order: this rollback is independent — it only drops constraints, it
-- does not touch row data. Safe to run before reverting the application
-- code that depended on the constraints (constraint-relaxing rollbacks
-- never break application code).

ALTER TABLE invoices             DROP CONSTRAINT IF EXISTS invoices_amount_paid_chk;
ALTER TABLE payments             DROP CONSTRAINT IF EXISTS payments_unapplied_amount_chk;
ALTER TABLE batches              DROP CONSTRAINT IF EXISTS batches_qty_nonneg_chk;
ALTER TABLE purchase_order_lines DROP CONSTRAINT IF EXISTS purchase_order_lines_qty_nonneg_chk;
