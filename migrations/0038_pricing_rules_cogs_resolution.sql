-- TERP Operator: customer/default pricing rules + COGS range resolution
-- Adds per-customer pricing rule, per-line landed-COGS resolution tracking,
-- and a system_settings table seeded with the default pricing rule.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS pricing_rule jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sales_order_lines
  ADD COLUMN IF NOT EXISTS unit_cost_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS landed_cost_basis varchar(32);

CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key varchar(80) NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings (key, value)
VALUES ('pricing.defaults', '{"default":{"basis":"percent","amount":0.30}}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Pre-resolve any lines whose source batch has no priceRange (fixed-cost batch),
-- so existing orders are not blocked by the new resolution gate.
UPDATE sales_order_lines sol
SET unit_cost_resolved = true,
    landed_cost_basis  = 'fixed'
FROM batches b
WHERE sol.batch_id = b.id
  AND (b.price_range IS NULL OR b.price_range = '')
  AND sol.unit_cost_resolved = false;

UPDATE sales_order_lines
SET unit_cost_resolved = true,
    landed_cost_basis  = 'fixed'
WHERE batch_id IS NULL
  AND unit_cost_resolved = false;
