-- TER-1586: Drop dead organizations table (single-tenant product, table unused)
-- No active code queries or writes this table. All schema references were
-- FK columns (users.organization_id, saved_filters.organization_id) which are
-- null in production and are also removed by this migration.
--
-- CASCADE drops the FK constraints referencing organizations in users and
-- saved_filters before removing the table itself.

-- Drop orphaned organization_id columns from dependent tables first.
ALTER TABLE users DROP COLUMN IF EXISTS organization_id;
ALTER TABLE saved_filters DROP COLUMN IF EXISTS organization_id;

-- Drop the table itself (CASCADE is a safety net for any remaining FKs).
DROP TABLE IF EXISTS organizations CASCADE;
