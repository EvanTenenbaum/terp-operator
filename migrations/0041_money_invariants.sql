-- Money + inventory invariants — promote application-layer guards into
-- storage-layer CHECK constraints (GitHub issue #18, slice 1).
--
-- WHY:
-- Today these invariants live only in application code (services, route
-- handlers). Any path that writes to these tables outside the validated code
-- path — a hand-run UPDATE during incident triage, a buggy backfill job,
-- a stale denorm — can silently corrupt money or inventory. CHECK
-- constraints make Postgres refuse the bad write at the storage layer, so
-- drift surfaces immediately instead of compounding.
--
-- The invariants being promoted:
--   invoices.amount_paid           >= 0 AND <= total
--   payments.unapplied_amount      >= 0
--   batches.intake_qty             >= 0
--   batches.available_qty          >= 0
--   batches.reserved_qty           >= 0
--   purchase_order_lines.qty       >= 0
--   purchase_order_lines.received_qty >= 0
--
-- PRE-FLIGHT STRATEGY — NOT VALID + manual VALIDATE:
-- A plain `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` takes an
-- ACCESS EXCLUSIVE lock for the duration of a full table scan AND fails
-- atomically if any existing row violates. Production may carry legacy
-- drift (e.g. a stale `amount_paid` denorm from before payment allocation
-- was fixed). To avoid an outage and to surface drift safely, we add each
-- constraint with NOT VALID:
--   * NOT VALID is metadata-only and near-instant; no table scan.
--   * Future INSERT/UPDATE writes are checked from the moment the
--     constraint exists. New drift cannot land.
--   * Existing rows are NOT scanned. Pre-existing violators remain
--     in place until VALIDATE is run.
--
-- AFTER deploying this migration, an operator should audit existing data
-- for violations and then run VALIDATE manually. The exact statements:
--
--   ALTER TABLE invoices             VALIDATE CONSTRAINT invoices_amount_paid_chk;
--   ALTER TABLE payments             VALIDATE CONSTRAINT payments_unapplied_amount_chk;
--   ALTER TABLE batches              VALIDATE CONSTRAINT batches_qty_nonneg_chk;
--   ALTER TABLE purchase_order_lines VALIDATE CONSTRAINT purchase_order_lines_qty_nonneg_chk;
--
-- VALIDATE takes a ShareUpdateExclusive lock (does NOT block reads or
-- writes, only other DDL on the same table) and scans every row. If any
-- row violates, VALIDATE fails — that's the intended signal: clean up the
-- offending rows first, then re-run. Suggested audit queries before
-- VALIDATE:
--
--   SELECT id, amount_paid, total FROM invoices
--     WHERE amount_paid < 0 OR amount_paid > total;
--   SELECT id, unapplied_amount FROM payments WHERE unapplied_amount < 0;
--   SELECT id, intake_qty, available_qty, reserved_qty FROM batches
--     WHERE intake_qty < 0 OR available_qty < 0 OR reserved_qty < 0;
--   SELECT id, qty, received_qty FROM purchase_order_lines
--     WHERE qty < 0 OR received_qty < 0;
--
-- Each ADD CONSTRAINT below is wrapped in an idempotent guard so re-running
-- this migration is a no-op.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_amount_paid_chk'
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_amount_paid_chk
      CHECK (amount_paid >= 0 AND amount_paid <= total) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_unapplied_amount_chk'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_unapplied_amount_chk
      CHECK (unapplied_amount >= 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'batches_qty_nonneg_chk'
  ) THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_qty_nonneg_chk
      CHECK (intake_qty >= 0 AND available_qty >= 0 AND reserved_qty >= 0) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_lines_qty_nonneg_chk'
  ) THEN
    ALTER TABLE purchase_order_lines
      ADD CONSTRAINT purchase_order_lines_qty_nonneg_chk
      CHECK (qty >= 0 AND received_qty >= 0) NOT VALID;
  END IF;
END $$;
