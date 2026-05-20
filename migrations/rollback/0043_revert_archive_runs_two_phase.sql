-- Rollback for 0043_archive_runs_two_phase.sql.
--
-- Restores the pre-refactor archive_runs invariants:
--   - csv_path / jsonl_path / pdf_path are NOT NULL again.
--   - The error column is dropped.
--
-- WARNING: any phase-1 row left behind (status='in_progress' with NULL
-- paths) will block the NOT NULL re-adds. Operators should clean those up
-- before applying this rollback. The same applies to status='failed_file_write'
-- rows, which by design carry NULL paths.

DELETE FROM archive_runs WHERE csv_path IS NULL OR jsonl_path IS NULL OR pdf_path IS NULL;

ALTER TABLE archive_runs
  ALTER COLUMN csv_path SET NOT NULL,
  ALTER COLUMN jsonl_path SET NOT NULL,
  ALTER COLUMN pdf_path SET NOT NULL,
  DROP COLUMN IF EXISTS error;
