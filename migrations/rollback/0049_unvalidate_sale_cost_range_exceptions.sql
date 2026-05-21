-- Rollback companion for migrations/0049_validate_sale_cost_range_exceptions.sql
--
-- Reverses 0049 by dropping the validated constraint, restoring any backed-up
-- invalid landed_cost_basis values, re-adding the constraint as NOT VALID,
-- and dropping the backup column.
-- Compatible with 0048 rollback: if 0048 rollback was already run, the
-- constraint may already be gone, so all operations are idempotent.

-- Drop the validated constraint if it still exists.
ALTER TABLE sales_order_lines
  DROP CONSTRAINT IF EXISTS sales_order_lines_landed_cost_basis_check;

-- Restore invalid values from the backup column.
UPDATE sales_order_lines
SET landed_cost_basis = landed_cost_basis_pre49
WHERE landed_cost_basis_pre49 IS NOT NULL;

-- Re-add the constraint as NOT VALID so it matches the post-0048 state.
ALTER TABLE sales_order_lines
  ADD CONSTRAINT sales_order_lines_landed_cost_basis_check
    CHECK (
      landed_cost_basis IS NULL
      OR landed_cost_basis IN ('fixed', 'pick-low', 'pick-mid', 'pick-high', 'manual', 'override')
    ) NOT VALID;

-- Drop the backup column.
ALTER TABLE sales_order_lines
  DROP COLUMN IF EXISTS landed_cost_basis_pre49;
