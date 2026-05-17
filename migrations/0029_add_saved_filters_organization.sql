-- Migration: Add multi-tenancy support to saved_filters table
-- Addresses SEC-CRIT-3: Multi-Tenancy Bypass

-- Add organization_id column to saved_filters
ALTER TABLE saved_filters
  ADD COLUMN organization_id UUID;

-- Backfill organization_id from users table (assuming single-org for now)
UPDATE saved_filters sf
SET organization_id = u.organization_id
FROM users u
WHERE sf.user_id = u.id;

-- Make organization_id NOT NULL after backfill
ALTER TABLE saved_filters
  ALTER COLUMN organization_id SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE saved_filters
  ADD CONSTRAINT fk_saved_filters_organization
  FOREIGN KEY (organization_id)
  REFERENCES organizations(id)
  ON DELETE CASCADE;

-- Create composite index for fast org+user lookups
CREATE INDEX idx_saved_filters_org_user
  ON saved_filters(organization_id, user_id)
  WHERE deleted_at IS NULL;

-- Drop old user_id-only index if it exists
DROP INDEX IF EXISTS idx_saved_filters_user;

-- Add unique constraint: filter names must be unique within org+user scope
ALTER TABLE saved_filters
  ADD CONSTRAINT uq_saved_filters_name_org_user
  UNIQUE (name, organization_id, user_id);

-- Add constraint: global filters can only be saved by users in the same org
-- (This is enforced at application level, but documenting the business rule)
COMMENT ON COLUMN saved_filters.organization_id IS 'Organization that owns this filter. All users can only access filters from their own organization.';
COMMENT ON COLUMN saved_filters.is_global IS 'When true, filter is visible to all users in the same organization. When false, only visible to the creating user.';
