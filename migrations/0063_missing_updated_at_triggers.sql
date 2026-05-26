-- migrations/0063_missing_updated_at_triggers.sql
-- GH #337: Attach the set_updated_at trigger to 6 core operational tables
-- that have an updated_at column but no auto-update trigger.
--
-- Background:
-- Migration 0021_create_updated_at_triggers.sql defined the trigger function
-- update_updated_at_column() and attached it to brands and saved_filters.
-- The following 6 high-traffic financial and operational tables have an
-- updated_at column but rely on application-layer code to set it manually,
-- which creates drift risk when any path forgets the field.
--
-- Tables without the trigger (identified by cross-referencing schema.ts
-- updatedAt columns against all CREATE TRIGGER statements in migrations/):
--   customers        — balance, credit limit, engine state mutations
--   vendors          — terms, contact changes
--   purchase_orders  — status lifecycle (draft → ordered → received → finalized)
--   sales_orders     — status lifecycle (draft → confirmed → posted → fulfilled)
--   invoices         — payment and dispute state changes
--   payments         — unapplied_amount changes, status updates
--
-- All DROP TRIGGER ... IF EXISTS + CREATE TRIGGER pairs are idempotent.
-- The trigger function is re-declared with CREATE OR REPLACE as a safety net
-- (0021 already defines it, but this ensures the function exists even on
-- databases that were migrated in a non-standard order).

-- Ensure the trigger function exists (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- customers
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- vendors
DROP TRIGGER IF EXISTS update_vendors_updated_at ON vendors;
CREATE TRIGGER update_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- purchase_orders
DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders;
CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- sales_orders
DROP TRIGGER IF EXISTS update_sales_orders_updated_at ON sales_orders;
CREATE TRIGGER update_sales_orders_updated_at
  BEFORE UPDATE ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- invoices
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- payments
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
