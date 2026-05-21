-- Issue #64 follow-up: validate the NOT VALID constraint added in migration 0048.
-- First preserve any invalid legacy landed_cost_basis values, then normalize
-- them to NULL, then validate the constraint.

ALTER TABLE sales_order_lines
  ADD COLUMN IF NOT EXISTS landed_cost_basis_pre49 varchar(32);

UPDATE sales_order_lines
SET landed_cost_basis_pre49 = landed_cost_basis
WHERE landed_cost_basis IS NOT NULL
  AND landed_cost_basis NOT IN ('fixed', 'pick-low', 'pick-mid', 'pick-high', 'manual', 'override');

UPDATE sales_order_lines
SET landed_cost_basis = NULL
WHERE landed_cost_basis IS NOT NULL
  AND landed_cost_basis NOT IN ('fixed', 'pick-low', 'pick-mid', 'pick-high', 'manual', 'override');

ALTER TABLE sales_order_lines
  VALIDATE CONSTRAINT sales_order_lines_landed_cost_basis_check;
