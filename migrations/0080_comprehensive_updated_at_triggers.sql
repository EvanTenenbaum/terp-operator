-- migrations/0076_comprehensive_updated_at_triggers.sql
-- GH #377: Add BEFORE UPDATE triggers to auto-set updated_at = NOW() for all
-- remaining tables that have an updated_at column but no trigger.
--
-- Background:
--   Migration 0021 added triggers for brands and saved_filters (2 tables).
--   Migration 0063 added triggers for customers, vendors, purchase_orders,
--     sales_orders, invoices, and payments (6 tables).
--   This migration covers all remaining tables with an updated_at column.
--
-- Uses a PL/pgSQL loop to iterate over all existing tables in the public
-- schema that have an updated_at column and lack a BEFORE UPDATE trigger,
-- so the migration is resilient to tables dropped by prior migrations
-- (e.g., organizations was dropped in 0069).

-- Ensure the trigger function exists (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to every table in the public schema that:
--   1. Has an updated_at column
--   2. Does not already have a BEFORE UPDATE trigger using update_updated_at_column()
DO $$
DECLARE
  tbl RECORD;
  trigger_count integer;
BEGIN
  FOR tbl IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
      AND t.table_name = c.table_name
      AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND c.table_name NOT IN (
        -- Tables already covered by 0021 + 0063
        'brands', 'saved_filters',
        'customers', 'vendors', 'purchase_orders', 'sales_orders', 'invoices', 'payments'
      )
    ORDER BY c.table_name
  LOOP
    -- Check if a BEFORE UPDATE trigger using this function already exists
    SELECT COUNT(*) INTO trigger_count
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = tbl.table_name
      AND trigger_name LIKE 'update_%_updated_at'
      AND action_timing = 'BEFORE'
      AND event_manipulation = 'UPDATE';

    IF trigger_count = 0 THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON %I',
        'update_' || tbl.table_name || '_updated_at',
        tbl.table_name
      );
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        'update_' || tbl.table_name || '_updated_at',
        tbl.table_name
      );
    END IF;
  END LOOP;
END;
$$;
