-- Rollback for migrations/0047_document_snapshots.sql.
-- Drops indexes first, then the table. Idempotent.
-- WARNING: drops all finalized and draft snapshot rows. Export
-- (pg_dump --table=document_snapshots) before applying in production.

DROP INDEX IF EXISTS document_snapshots_finalized_content_unique;
DROP INDEX IF EXISTS document_snapshots_supersedes_idx;
DROP INDEX IF EXISTS document_snapshots_command_idx;
DROP INDEX IF EXISTS document_snapshots_entity_idx;
DROP TABLE IF EXISTS document_snapshots;
