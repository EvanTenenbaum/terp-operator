-- Product Filtering System - Phase 1, Task 1.2
-- Spec Reference: 2026-05-17-product-filtering-system-design-v2.md lines 63-92
-- Original Spec Name: 2026_05_17_002_create_saved_filters.sql

CREATE TABLE IF NOT EXISTS saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  description text,
  target_view varchar(32) NOT NULL CHECK (target_view IN ('inventory', 'items', 'purchase_orders', 'sales_orders', 'matchmaking', 'all')),
  filter_definition jsonb NOT NULL,
  schema_version int NOT NULL DEFAULT 1,
  is_global boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id),
  CONSTRAINT valid_filter_definition CHECK (jsonb_typeof(filter_definition) = 'object'),
  CONSTRAINT unique_user_filter_name UNIQUE (user_id, name, target_view)
);

CREATE INDEX IF NOT EXISTS saved_filters_user_view_idx ON saved_filters(user_id, target_view) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS saved_filters_global_idx ON saved_filters(is_global) WHERE is_global = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS saved_filters_name_idx ON saved_filters(name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS saved_filters_active_idx ON saved_filters(id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN saved_filters.schema_version IS 'Filter schema version for backward compatibility during schema evolution';
COMMENT ON CONSTRAINT unique_user_filter_name ON saved_filters IS 'User-scoped filter names - different users can have same filter name';

-- Optimize for frequent updates
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'saved_filters') THEN
    ALTER TABLE saved_filters SET (fillfactor = 90);
  END IF;
END $$;
