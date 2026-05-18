-- Product Filtering System - Phase 1, Task 1.1
-- Spec Reference: 2026-05-17-product-filtering-system-design-v2.md lines 30-52
-- Original Spec Name: 2026_05_17_001_create_brands.sql

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  alias varchar(80) NOT NULL DEFAULT 'Brand TBD',
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on alias only (multiple brands can have same name in different regions)
CREATE UNIQUE INDEX IF NOT EXISTS brands_alias_active_idx ON brands(alias) WHERE active = true;

-- Non-unique index for lookups during backfill
CREATE INDEX IF NOT EXISTS brands_name_idx ON brands(name);
CREATE INDEX IF NOT EXISTS brands_active_idx ON brands(active);

COMMENT ON COLUMN brands.alias IS 'Customer-facing alias to protect brand identity';
COMMENT ON TABLE brands IS 'Producer/farmer brands - separate from distributors (vendors)';
