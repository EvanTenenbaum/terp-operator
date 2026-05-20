-- Issue #25: backfill any existing NULL reasons in command_journal.
-- Prior to this change, command_journal.reason was nullable and the Zod
-- schema (`commandInputSchema`) marked `reason` as optional. Direct-API
-- callers could (and did) journal writes with reason = NULL, breaking the
-- "every write has actor + idempotency key + reason" audit promise.
--
-- This migration is idempotent: it only updates rows that still have a NULL
-- reason. It is wrapped in a DO $$ ... $$ block with a NOT EXISTS guard so
-- re-running the migration on a database where every row already has a
-- non-NULL reason is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM command_journal WHERE reason IS NULL LIMIT 1
  ) THEN
    UPDATE command_journal
       SET reason = '(legacy: reason not recorded)'
     WHERE reason IS NULL;
  END IF;
END
$$;
