-- migrations/0058_validate_not_valid_constraints.sql
-- GH #292: Validate CHECK constraints that were added as NOT VALID and never
-- explicitly validated.
--
-- Background:
-- PostgreSQL's NOT VALID modifier lets you add a CHECK constraint without
-- scanning existing rows (near-instant DDL). Future writes are checked
-- immediately, but existing rows are grandfathered until an explicit
-- VALIDATE CONSTRAINT command scans the table. Until validation runs, the
-- planner cannot use the constraint for query optimization, and data integrity
-- for pre-constraint rows is unverified.
--
-- Constraints targeted by this migration (found by searching all *.sql files
-- in migrations/ for "NOT VALID"):
--
--   1. invoices.invoices_amount_paid_chk
--      CHECK (amount_paid >= 0 AND amount_paid <= total)
--      Added: 0041_money_invariants.sql; dropped: 0046; re-added: 0055.
--      Risk: staging seed has rounding-sensitive rows. If any row has
--      amount_paid > total (even by $0.01) validation will fail and this
--      migration will roll back — preserving the NOT VALID state.
--      A rollback here is SAFE: the constraint continues to protect new
--      writes; only existing rows are not yet verified.
--
--   2. payments.payments_unapplied_amount_chk
--      CHECK (unapplied_amount >= 0)
--      Added: 0041; dropped: 0046; re-added: 0055.
--
--   3. batches.batches_qty_nonneg_chk
--      CHECK (intake_qty >= 0 AND available_qty >= 0 AND reserved_qty >= 0)
--      Added: 0041; dropped: 0046; re-added: 0055.
--
--   4. purchase_order_lines.purchase_order_lines_qty_nonneg_chk
--      CHECK (qty >= 0 AND received_qty >= 0)
--      Added: 0041; dropped: 0046; re-added: 0055.
--
--   5. customers.customers_engine_source_has_assessment
--      CHECK (credit_limit_source = 'manual' OR last_assessment_id IS NOT NULL)
--      Added: 0033_credit_engine.sql.
--
-- NOT included (already validated by a prior migration):
--   sales_order_lines.sales_order_lines_landed_cost_basis_check
--     → validated by 0049_validate_sale_cost_range_exceptions.sql
--
-- Each VALIDATE CONSTRAINT is wrapped in a DO $$ block that skips silently if
-- the constraint does not exist (e.g., on a DB that never ran the re-add
-- migration). The validation itself is NOT inside a separate DO block — it is
-- run as a plain DDL statement so that a violation causes the migration
-- transaction to roll back cleanly, leaving the constraint as NOT VALID.
--
-- If validation fails on any of these, investigate the offending rows:
--   SELECT * FROM <table> WHERE NOT (<check expression>);
-- Clean or null-out bad rows, then re-run the migration.

-- 1. invoices — amount_paid must be in [0, total]
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_amount_paid_chk'
      AND conrelid = 'invoices'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE invoices VALIDATE CONSTRAINT invoices_amount_paid_chk;
  END IF;
END $$;

-- 2. payments — unapplied_amount must be >= 0
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_unapplied_amount_chk'
      AND conrelid = 'payments'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE payments VALIDATE CONSTRAINT payments_unapplied_amount_chk;
  END IF;
END $$;

-- 3. batches — qty fields must be non-negative
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'batches_qty_nonneg_chk'
      AND conrelid = 'batches'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE batches VALIDATE CONSTRAINT batches_qty_nonneg_chk;
  END IF;
END $$;

-- 4. purchase_order_lines — qty fields must be non-negative
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_order_lines_qty_nonneg_chk'
      AND conrelid = 'purchase_order_lines'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE purchase_order_lines VALIDATE CONSTRAINT purchase_order_lines_qty_nonneg_chk;
  END IF;
END $$;

-- 5. customers — engine source requires assessment
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_engine_source_has_assessment'
      AND conrelid = 'customers'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE customers VALIDATE CONSTRAINT customers_engine_source_has_assessment;
  END IF;
END $$;
