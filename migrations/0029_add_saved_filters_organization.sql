-- Migration: Add multi-tenancy support to saved_filters table
-- Addresses SEC-CRIT-3: Multi-Tenancy Bypass

-- Add organization_id column to saved_filters
DO $$ BEGIN
  ALTER TABLE saved_filters ADD COLUMN IF NOT EXISTS organization_id UUID;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- Backfill organization_id from users table (assuming single-org for now)
UPDATE saved_filters sf
SET organization_id = u.organization_id
FROM users u
WHERE sf.user_id = u.id
  AND sf.organization_id IS NULL;

-- Make organization_id NOT NULL after backfill
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='saved_filters' AND column_name='organization_id' AND is_nullable='YES'
  ) THEN
    ALTER TABLE saved_filters ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- Add foreign key constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_saved_filters_organization'
  ) THEN
    ALTER TABLE saved_filters
      ADD CONSTRAINT fk_saved_filters_organization
      FOREIGN KEY (organization_id)
      REFERENCES organizations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Create composite index for fast org+user lookups
CREATE INDEX IF NOT EXISTS idx_saved_filters_org_user
  ON saved_filters(organization_id, user_id)
  WHERE deleted_at IS NULL;

-- Drop old user_id-only index if it exists
DROP INDEX IF EXISTS idx_saved_filters_user;

-- Add unique constraint: filter names must be unique within org+user scope
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_saved_filters_name_org_user'
  ) THEN
    ALTER TABLE saved_filters
      ADD CONSTRAINT uq_saved_filters_name_org_user
      UNIQUE (name, organization_id, user_id);
  END IF;
END $$;

-- Add constraint: global filters can only be saved by users in the same org
-- (This is enforced at application level, but documenting the business rule)
COMMENT ON COLUMN saved_filters.organization_id IS 'Organization that owns this filter. All users can only access filters from their own organization.';
COMMENT ON COLUMN saved_filters.is_global IS 'When true, filter is visible to all users in the same organization. When false, only visible to the creating user.';
