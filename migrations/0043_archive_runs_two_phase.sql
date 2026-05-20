-- Archive Runs Two-Phase (issue #19 slice 3, EDGE-04)
--
-- `archivePeriod` previously performed PDF / CSV / JSONL file writes INSIDE
-- the wrapping db.transaction() block. A hung or failed file write held row
-- locks on `archive_runs`, `batches`, and `sales_orders` open until the
-- write resolved — blocking other writers. Worse, a successful tx commit
-- followed by a failed file write left the DB inconsistent with disk: the
-- `archive_runs` row said "archived" with file paths, but no files existed.
--
-- The refactor splits the work into two phases:
--   1. DB phase (inside the transaction): insert an `archive_runs` row with
--      status='in_progress' and capture batch/journal snapshots. NO file
--      writes. The csv_path / jsonl_path / pdf_path columns are NOT YET
--      known, so they must be nullable for the duration of phase 1.
--   2. File phase (after tx commit): generate the three files, then UPDATE
--      the row to status='archived' with the resolved paths. If any file
--      write fails post-commit, UPDATE the row to status='failed_file_write'
--      with the captured error message in the new `error` column. This
--      leaves the partial state identifiable for operator retry.
--
-- This migration:
--   - Drops NOT NULL on the three path columns so phase-1 rows can carry
--     NULL paths.
--   - Adds an `error` column to capture the post-commit-write failure
--     reason. The column is text, nullable, and never read by the hot
--     command bus path — only by recovery / admin queries.

ALTER TABLE archive_runs
  ALTER COLUMN csv_path DROP NOT NULL,
  ALTER COLUMN jsonl_path DROP NOT NULL,
  ALTER COLUMN pdf_path DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS error TEXT;
