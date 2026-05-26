-- migrations/0061_command_journal_reversal_fk.sql
-- GH #294: Add FK constraint for command_journal.reversed_by_command_id.
--
-- Background:
-- command_journal.reversed_by_command_id is a self-referential UUID column
-- added in migration 0001_initial.sql as a bare uuid with no REFERENCES clause.
-- This means the DB does not enforce that the referenced command actually exists,
-- nor does it handle the case where the reversing command row is deleted.
--
-- Fix: Add a named FK that references command_journal(id) ON DELETE SET NULL.
-- ON DELETE SET NULL is appropriate here: if the reversing command record is
-- somehow deleted (e.g., in a data cleanup), the original command should not
-- be deleted with it — it should simply lose its reversal link.
--
-- The migration is idempotent via a DO $$ guard.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'command_journal_reversed_by_command_id_fkey'
      AND conrelid = 'command_journal'::regclass
  ) THEN
    ALTER TABLE command_journal
      ADD CONSTRAINT command_journal_reversed_by_command_id_fkey
      FOREIGN KEY (reversed_by_command_id)
      REFERENCES command_journal(id)
      ON DELETE SET NULL;
  END IF;
END $$;
