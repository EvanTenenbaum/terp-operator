-- CAP-030: Pricing Rules Chain Manager (TER-1558)
-- Replaces flat pricingRule JSONB on customers + systemSettings pricing.defaults
-- with an ordered, clause-based pricing_rule_entries table.

CREATE TABLE pricing_rule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('global', 'customer')),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL,
  name VARCHAR(120),
  conditions JSONB,
  action_basis VARCHAR(20) NOT NULL CHECK (action_basis IN ('percent', 'dollar')),
  action_amount NUMERIC(12, 4) NOT NULL CHECK (action_amount >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  migration_source VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique priority per scope+customer (only live rows)
CREATE UNIQUE INDEX pricing_rule_entries_global_priority_unique
  ON pricing_rule_entries (priority)
  WHERE scope = 'global' AND deleted_at IS NULL;

CREATE UNIQUE INDEX pricing_rule_entries_customer_priority_unique
  ON pricing_rule_entries (customer_id, priority)
  WHERE scope = 'customer' AND deleted_at IS NULL;

-- Query index for resolver
CREATE INDEX pricing_rule_entries_lookup_idx
  ON pricing_rule_entries (scope, customer_id, active, priority)
  WHERE deleted_at IS NULL;

CREATE INDEX pricing_rule_entries_customer_id_idx
  ON pricing_rule_entries (customer_id)
  WHERE deleted_at IS NULL;

-- Feature flag: false = use old JSONB path; true = use new resolver
-- Flipped to true only after migration parity check passes
INSERT INTO system_settings (key, value)
VALUES ('pricing.useChainResolver', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
