-- rollback: 0083_command_journal_bulk_columns
BEGIN;
ALTER TABLE command_journal
  DROP COLUMN IF EXISTS bulk_group_key,
  DROP COLUMN IF EXISTS bulk_sequence;
COMMIT;
