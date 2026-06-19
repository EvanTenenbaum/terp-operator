-- migration: 0083_command_journal_bulk_columns
-- Phase 0 P0-7 / T-B-06: command_journal bulk columns (additive).
-- Adds bulk_group_key and bulk_sequence to support commands.runBulk
-- per docs/engineering-plans/db-migration-audit.md §4.3–§4.4.
--
-- ARCH alignment (MERCURY-ARCHITECTURE-MANIFESTO.md):
--   Add-only (ARCH-11): no DROP, no destructive change, no backfill.
--   Single-command writes through commands.run continue to record
--   bulk_group_key = NULL, bulk_sequence = NULL. Existing rows untouched.
--
-- Rollback: migrations/rollback/0083_command_journal_bulk_columns.sql.

BEGIN;

ALTER TABLE command_journal
  ADD COLUMN IF NOT EXISTS bulk_group_key uuid,
  ADD COLUMN IF NOT EXISTS bulk_sequence integer;

COMMIT;
