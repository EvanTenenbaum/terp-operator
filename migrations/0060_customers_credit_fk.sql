-- migrations/0060_customers_credit_fk.sql
-- GH #293: Ensure named FK constraints exist for customers credit engine
-- UUID columns that reference other tables.
--
-- Background:
-- Migration 0033_credit_engine.sql added these columns with inline REFERENCES
-- clauses. PostgreSQL auto-generated anonymous constraint names for them (e.g.,
-- customers_stance_id_fkey). schema.ts was left with bare uuid() columns
-- without .references() calls, meaning Drizzle does not know about these FKs.
--
-- This migration ensures named constraints exist for each FK and is idempotent:
-- each DO $$ block checks pg_constraint before adding. If the auto-generated
-- constraint from 0033 already exists under the expected name, the IF NOT EXISTS
-- guard skips the ADD CONSTRAINT and the migration completes cleanly.
--
-- Columns addressed:
--   customers.stance_id             → credit_engine_stances(id) ON DELETE SET NULL
--   customers.engine_disabled_by    → users(id) ON DELETE SET NULL
--   customers.last_assessment_id    → customer_credit_assessments(id) ON DELETE SET NULL
--   customers.credit_limit_manual_set_by → users(id) ON DELETE SET NULL
--
-- After this migration, schema.ts is updated to add .references() calls for
-- all four columns (schema.ts change ships in the same PR).

-- 1. customers.stance_id → credit_engine_stances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_stance_id_fkey'
      AND conrelid = 'customers'::regclass
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_stance_id_fkey
      FOREIGN KEY (stance_id) REFERENCES credit_engine_stances(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. customers.engine_disabled_by → users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_engine_disabled_by_fkey'
      AND conrelid = 'customers'::regclass
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_engine_disabled_by_fkey
      FOREIGN KEY (engine_disabled_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. customers.last_assessment_id → customer_credit_assessments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_last_assessment_id_fkey'
      AND conrelid = 'customers'::regclass
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_last_assessment_id_fkey
      FOREIGN KEY (last_assessment_id) REFERENCES customer_credit_assessments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. customers.credit_limit_manual_set_by → users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_credit_limit_manual_set_by_fkey'
      AND conrelid = 'customers'::regclass
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_credit_limit_manual_set_by_fkey
      FOREIGN KEY (credit_limit_manual_set_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
