-- Rollback for migrations/0058_validate_not_valid_constraints.sql
--
-- Reverses the VALIDATE CONSTRAINT statements by dropping each constraint
-- and re-adding it as NOT VALID. This restores the pre-0058 state where
-- the CHECK conditions are enforced only for new writes, not verified
-- against existing rows.
--
-- Note: Validation is a one-way operation at the PostgreSQL level — there
-- is no ALTER TABLE ... UNVALIDATE CONSTRAINT. The DROP + re-add approach
-- is the closest possible reverse. Because 0058 verified that all existing
-- rows satisfy the CHECK expressions, re-adding as NOT VALID is safe (no
-- data was unvalidated — the rows were already proven clean).
--
-- Idempotent: each block drops the constraint (IF EXISTS) and re-adds only
-- if the constraint name is absent (IF NOT EXISTS guard). Re-running this
-- rollback is a no-op after the first execution.
--
-- Run order: this rollback is independent — it only touches constraints
-- and does not modify row data. Safe to run before reverting application
-- code that depends on validated constraints.

-- 1. invoices_amount_paid_chk — validated by 0058; revert to NOT VALID
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_amount_paid_chk' AND conrelid = 'invoices'::regclass) THEN
    ALTER TABLE invoices DROP CONSTRAINT invoices_amount_paid_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_amount_paid_chk') THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_amount_paid_chk
      CHECK (amount_paid >= 0 AND amount_paid <= total) NOT VALID;
  END IF;
END $$;

-- 2. payments_unapplied_amount_chk — validated by 0058; revert to NOT VALID
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_unapplied_amount_chk' AND conrelid = 'payments'::regclass) THEN
    ALTER TABLE payments DROP CONSTRAINT payments_unapplied_amount_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_unapplied_amount_chk') THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_unapplied_amount_chk
      CHECK (unapplied_amount >= 0) NOT VALID;
  END IF;
END $$;

-- 3. batches_qty_nonneg_chk — validated by 0058; revert to NOT VALID
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_qty_nonneg_chk' AND conrelid = 'batches'::regclass) THEN
    ALTER TABLE batches DROP CONSTRAINT batches_qty_nonneg_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_qty_nonneg_chk') THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_qty_nonneg_chk
      CHECK (intake_qty >= 0 AND available_qty >= 0 AND reserved_qty >= 0) NOT VALID;
  END IF;
END $$;

-- 4. purchase_order_lines_qty_nonneg_chk — validated by 0058; revert to NOT VALID
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_lines_qty_nonneg_chk' AND conrelid = 'purchase_order_lines'::regclass) THEN
    ALTER TABLE purchase_order_lines DROP CONSTRAINT purchase_order_lines_qty_nonneg_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_lines_qty_nonneg_chk') THEN
    ALTER TABLE purchase_order_lines
      ADD CONSTRAINT purchase_order_lines_qty_nonneg_chk
      CHECK (qty >= 0 AND received_qty >= 0) NOT VALID;
  END IF;
END $$;

-- 5. customers_engine_source_has_assessment — validated by 0058; revert to NOT VALID
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_engine_source_has_assessment' AND conrelid = 'customers'::regclass) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_engine_source_has_assessment;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_engine_source_has_assessment') THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_engine_source_has_assessment
      CHECK (credit_limit_source = 'manual' OR last_assessment_id IS NOT NULL) NOT VALID;
  END IF;
END $$;
