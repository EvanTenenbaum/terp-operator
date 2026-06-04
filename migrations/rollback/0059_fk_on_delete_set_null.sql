-- Rollback for migrations/0059_fk_on_delete_restrict.sql
--
-- Reverses the FK ON DELETE action change from RESTRICT back to SET NULL
-- for purchase_orders.vendor_id and sales_orders.customer_id.
--
-- PostgreSQL requires DROP + re-add to change the ON DELETE action. Each
-- block drops the constraint (IF EXISTS) and re-adds with ON DELETE SET NULL
-- (guarded by IF NOT EXISTS). Re-running this rollback is a no-op.
--
-- Run order: this rollback relaxes constraints (SET NULL is less restrictive
-- than RESTRICT), so it is safe to run before reverting application code
-- that may rely on RESTRICT semantics.

-- 1. purchase_orders.vendor_id: RESTRICT → SET NULL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_vendor_id_fkey' AND conrelid = 'purchase_orders'::regclass) THEN
    ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_vendor_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_vendor_id_fkey') THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. sales_orders.customer_id: RESTRICT → SET NULL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_customer_id_fkey' AND conrelid = 'sales_orders'::regclass) THEN
    ALTER TABLE sales_orders DROP CONSTRAINT sales_orders_customer_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_customer_id_fkey') THEN
    ALTER TABLE sales_orders
      ADD CONSTRAINT sales_orders_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;
