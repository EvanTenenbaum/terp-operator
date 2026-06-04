-- migrations/0075_financial_fk_on_delete_restrict.sql
-- GH #376: Add ON DELETE RESTRICT to financial foreign keys.
--
-- Rationale:
-- Multiple financial tables have ON DELETE SET NULL on their parent-entity
-- foreign keys. Removing a customer, sales order, purchase order, or vendor
-- that still has linked invoices, payments, batches, purchase receipts, or
-- vendor bills would silently orphan financial records. An orphaned invoice
-- without a customer, a payment without a customer, or a batch without a
-- purchase order cannot be meaningfully reconciled, audited, or reported.
-- RESTRICT forces callers to explicitly handle the association before
-- deletion (reassign, archive, etc.).
--
-- This migration extends the pattern established in migration 0059 (which
-- covered purchase_orders.vendor_id and sales_orders.customer_id).
--
-- Tables affected:
--   invoices        → customers, sales_orders
--   payments        → customers
--   batches         → purchase_orders, purchase_order_lines
--   purchase_receipts → purchase_orders, vendors
--   vendor_bills    → purchase_orders, purchase_receipts, vendors
--
-- Constraint names are the PostgreSQL auto-generated names confirmed
-- against the live database. Each block follows the idempotent
-- DROP IF EXISTS + DO $$ guard pattern so the migration is safe to re-run.

-- ---------------------------------------------------------------------------
-- invoices: customer_id and order_id
-- ---------------------------------------------------------------------------

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_customer_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_customer_id_fkey'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_order_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_order_id_fkey'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- payments: customer_id
-- ---------------------------------------------------------------------------

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_customer_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_customer_id_fkey'
      AND conrelid = 'payments'::regclass
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- batches: purchase_order_id and purchase_order_line_id
-- ---------------------------------------------------------------------------

ALTER TABLE batches
  DROP CONSTRAINT IF EXISTS batches_purchase_order_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'batches_purchase_order_id_fkey'
      AND conrelid = 'batches'::regclass
  ) THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_purchase_order_id_fkey
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE batches
  DROP CONSTRAINT IF EXISTS batches_purchase_order_line_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'batches_purchase_order_line_id_fkey'
      AND conrelid = 'batches'::regclass
  ) THEN
    ALTER TABLE batches
      ADD CONSTRAINT batches_purchase_order_line_id_fkey
      FOREIGN KEY (purchase_order_line_id) REFERENCES purchase_order_lines(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- purchase_receipts: purchase_order_id and vendor_id
-- ---------------------------------------------------------------------------

ALTER TABLE purchase_receipts
  DROP CONSTRAINT IF EXISTS purchase_receipts_purchase_order_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_receipts_purchase_order_id_fkey'
      AND conrelid = 'purchase_receipts'::regclass
  ) THEN
    ALTER TABLE purchase_receipts
      ADD CONSTRAINT purchase_receipts_purchase_order_id_fkey
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE purchase_receipts
  DROP CONSTRAINT IF EXISTS purchase_receipts_vendor_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_receipts_vendor_id_fkey'
      AND conrelid = 'purchase_receipts'::regclass
  ) THEN
    ALTER TABLE purchase_receipts
      ADD CONSTRAINT purchase_receipts_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- vendor_bills: purchase_order_id, purchase_receipt_id, and vendor_id
-- ---------------------------------------------------------------------------

ALTER TABLE vendor_bills
  DROP CONSTRAINT IF EXISTS vendor_bills_purchase_order_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vendor_bills_purchase_order_id_fkey'
      AND conrelid = 'vendor_bills'::regclass
  ) THEN
    ALTER TABLE vendor_bills
      ADD CONSTRAINT vendor_bills_purchase_order_id_fkey
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE vendor_bills
  DROP CONSTRAINT IF EXISTS vendor_bills_purchase_receipt_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vendor_bills_purchase_receipt_id_fkey'
      AND conrelid = 'vendor_bills'::regclass
  ) THEN
    ALTER TABLE vendor_bills
      ADD CONSTRAINT vendor_bills_purchase_receipt_id_fkey
      FOREIGN KEY (purchase_receipt_id) REFERENCES purchase_receipts(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE vendor_bills
  DROP CONSTRAINT IF EXISTS vendor_bills_vendor_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vendor_bills_vendor_id_fkey'
      AND conrelid = 'vendor_bills'::regclass
  ) THEN
    ALTER TABLE vendor_bills
      ADD CONSTRAINT vendor_bills_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;
  END IF;
END $$;
