-- Rollback of 0046 — restore the four NOT VALID CHECK constraints from 0041.
-- Identical to the forward portion of 0041 (the ADD CONSTRAINT ... NOT VALID
-- statements), wrapped in the same idempotent IF NOT EXISTS guards.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_amount_paid_chk') THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_amount_paid_chk
      CHECK (amount_paid >= 0 AND amount_paid <= total) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_unapplied_amount_chk') THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_unapplied_amount_chk
      CHECK (unapplied_amount >= 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_qty_nonneg_chk') THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_qty_nonneg_chk
      CHECK (intake_qty >= 0 AND available_qty >= 0 AND reserved_qty >= 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_lines_qty_nonneg_chk') THEN
    ALTER TABLE purchase_order_lines
      ADD CONSTRAINT purchase_order_lines_qty_nonneg_chk
      CHECK (qty >= 0 AND received_qty >= 0) NOT VALID;
  END IF;
END $$;
