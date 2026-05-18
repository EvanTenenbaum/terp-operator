-- Create organizations table for multi-tenancy support
-- This migration must run before 0029_add_saved_filters_organization.sql

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add organization_id to users table
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT;
END $$;

-- For fresh DBs, create a default organization and assign all users to it
DO $$
DECLARE
  default_org_id uuid;
BEGIN
  -- Create default organization if it doesn't exist
  INSERT INTO organizations (name)
  VALUES ('Default Organization')
  ON CONFLICT DO NOTHING
  RETURNING id INTO default_org_id;

  -- If the insert didn't return an id (conflict), get the existing one
  IF default_org_id IS NULL THEN
    SELECT id INTO default_org_id FROM organizations LIMIT 1;
  END IF;

  -- Assign users with NULL organization_id to the default org
  IF default_org_id IS NOT NULL THEN
    UPDATE users SET organization_id = default_org_id WHERE organization_id IS NULL;
  END IF;
END $$;

-- Create index for organization lookups
CREATE INDEX IF NOT EXISTS users_organization_idx ON users(organization_id);

COMMENT ON TABLE organizations IS 'Multi-tenant organization table - users belong to organizations';
COMMENT ON COLUMN users.organization_id IS 'Organization that owns this user account';
