-- Rollback for migrations/0060_customers_credit_fk.sql
--
-- Drops the four named FK constraints added by 0060 for the customers
-- credit engine UUID columns. Each constraint is dropped with IF EXISTS
-- so re-running this rollback is a no-op.
--
-- Constraint names (from 0060):
--   customers_stance_id_fkey
--   customers_engine_disabled_by_fkey
--   customers_last_assessment_id_fkey
--   customers_credit_limit_manual_set_by_fkey
--
-- Note: Migration 0033_credit_engine.sql originally added these columns
-- with inline REFERENCES clauses that may have created auto-generated
-- constraints. This rollback only drops the named constraints created by
-- 0060. If auto-generated constraints exist, they are unaffected.
--
-- Run order: this rollback removes constraints. Safe to run before
-- reverting application code — FK drops never break application logic
-- (they only relax enforcement).

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_stance_id_fkey;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_engine_disabled_by_fkey;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_last_assessment_id_fkey;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_credit_limit_manual_set_by_fkey;
