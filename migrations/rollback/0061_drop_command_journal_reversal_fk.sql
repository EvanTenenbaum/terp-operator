-- Rollback for migrations/0061_command_journal_reversal_fk.sql
--
-- Drops the self-referential FK constraint added by 0061 on
-- command_journal.reversed_by_command_id.
--
-- Constraint name: command_journal_reversed_by_command_id_fkey
--
-- Idempotent (uses IF EXISTS) so re-running this rollback is a no-op.
--
-- Migration 0001_initial.sql originally created reversed_by_command_id as a
-- bare uuid column with no REFERENCES clause. Dropping this FK restores the
-- pre-0061 state where referential integrity for the column was enforced
-- only at the application layer.
--
-- Run order: safe to run before reverting application code — FK drops
-- relax enforcement without breaking existing logic.

ALTER TABLE command_journal DROP CONSTRAINT IF EXISTS command_journal_reversed_by_command_id_fkey;
