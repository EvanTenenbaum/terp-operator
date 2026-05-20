-- Rollback for migrations/0044_users_work_loop.sql (issue #21 slice 1).
--
-- DESTRUCTIVE: drops the `work_loop` column on `users`. Any explicit lane
-- assignments made post-deploy are lost. After rollback, the client falls
-- back to legacyWorkLoopFromSubstring on email/name — the same behaviour the
-- system had pre-#21-slice-1, so no operator loses navigation, but anyone
-- whose lane was set explicitly via the column (rather than implied by their
-- email/name) will revert to whatever the substring heuristic infers.

ALTER TABLE users DROP COLUMN IF EXISTS work_loop;
