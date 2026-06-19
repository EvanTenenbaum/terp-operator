-- migration: 0084_command_journal_bulk_index
-- Phase 0 P0-7 / T-B-06: composite index on (bulk_group_key, bulk_sequence)
-- for queries.bulkGroup (run-bulk spec §5.3). Uses CONCURRENTLY so writes
-- against command_journal are not blocked during index creation.
--
-- Runner contract (migrations/README.md, migrate.ts isConcurrentMigration()):
-- when a file contains the word CONCURRENTLY the entire file runs in auto-commit
-- mode (no BEGIN/COMMIT wrapper). This file contains ONLY the concurrent
-- statement. The ALTER TABLE was shipped in 0083.
--
-- Rollback: migrations/rollback/0084_command_journal_bulk_index.sql.

CREATE INDEX CONCURRENTLY IF NOT EXISTS command_journal_bulk_group_seq_idx
  ON command_journal (bulk_group_key, bulk_sequence);
