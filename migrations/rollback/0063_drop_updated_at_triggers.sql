-- Rollback for migrations/0063_missing_updated_at_triggers.sql
--
-- Drops the six updated_at triggers added by 0063 on core operational
-- tables. The trigger function (update_updated_at_column()) is preserved
-- because it is still used by brands and saved_filters (migration 0021).
--
-- Tables affected:
--   customers, vendors, purchase_orders, sales_orders, invoices, payments
--
-- Idempotent: DROP TRIGGER IF EXISTS makes re-runs a no-op.
--
-- Run order: safe to run before reverting application code — missing
-- auto-updated timestamps are a data-quality regression, not a hard
-- application break.

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
DROP TRIGGER IF EXISTS update_vendors_updated_at ON vendors;
DROP TRIGGER IF EXISTS update_purchase_orders_updated_at ON purchase_orders;
DROP TRIGGER IF EXISTS update_sales_orders_updated_at ON sales_orders;
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
