-- Rollback for migrations/0042_photo_upload_tokens.sql (issue #73).
-- DESTRUCTIVE: drops the photo_upload_tokens table and all minted tokens.
-- Coordinate revoke + active-share-link review before running.

DROP INDEX IF EXISTS photo_upload_tokens_expires_idx;
DROP INDEX IF EXISTS photo_upload_tokens_batch_idx;
DROP TABLE IF EXISTS photo_upload_tokens;
