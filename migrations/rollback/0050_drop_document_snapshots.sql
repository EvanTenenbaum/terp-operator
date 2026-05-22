-- Rollback of 0047_document_snapshots.sql.
DROP INDEX IF EXISTS document_snapshots_active_unique;
DROP INDEX IF EXISTS document_snapshots_type_subject_version_unique;
DROP INDEX IF EXISTS document_snapshots_status_type_idx;
DROP INDEX IF EXISTS document_snapshots_subject_version_idx;
DROP INDEX IF EXISTS document_snapshots_type_subject_idx;
DROP TABLE IF EXISTS document_snapshots;
