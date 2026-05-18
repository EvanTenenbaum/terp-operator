-- Product Filtering System - Phase 1 Fix: Add audit trail to brands table
-- Identified by: Adversarial Security Review (Critical Issue #1)

-- Add audit fields to brands table
DO $$ BEGIN
  ALTER TABLE brands ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
  ALTER TABLE brands ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);
  ALTER TABLE brands ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
  ALTER TABLE brands ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id);
END $$;

-- Create index for soft delete queries
CREATE INDEX IF NOT EXISTS brands_active_not_deleted_idx ON brands(id) WHERE deleted_at IS NULL AND active = true;

COMMENT ON COLUMN brands.created_by IS 'User who created this brand entry';
COMMENT ON COLUMN brands.updated_by IS 'User who last updated this brand';
COMMENT ON COLUMN brands.deleted_by IS 'User who soft-deleted this brand';
