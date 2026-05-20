-- Photo Upload Tokens (issue #73)
--
-- Per-batch tokenized share links so field photographers can upload to
-- `POST /api/upload/media` without an operator session. Manager+ users mint
-- a token with a TTL; the raw token value is returned exactly once at mint
-- time. The database stores only the sha256 hash of the token, so the
-- database can never be used to leak active tokens.
--
-- Security model:
--   - Token is UPLOAD-ONLY: this table is consulted only by the upload
--     middleware. It does not grant read/serve/delete access to media.
--   - Token is BATCH-SCOPED: each row binds the token to exactly one batch.
--     The upload middleware rejects any attempt to use a token for a
--     different batch.
--   - Token is TTL-BOUND: the upload middleware rejects expired tokens.
--   - Token is REVOCABLE: a manager can set `revoked_at` to disable the
--     token immediately.
--   - Token is AUDITED: `last_used_at` + `use_count` are bumped on every
--     successful auth (best-effort; failure does not break auth).

CREATE TABLE IF NOT EXISTS photo_upload_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  issued_by UUID NOT NULL REFERENCES users(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS photo_upload_tokens_batch_idx ON photo_upload_tokens(batch_id);
CREATE INDEX IF NOT EXISTS photo_upload_tokens_expires_idx ON photo_upload_tokens(expires_at);
