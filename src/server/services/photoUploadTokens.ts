import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from './logger';

/**
 * Photo Upload Tokens — tokenized share links for the photographer mobile
 * upload flow (issue #73). A manager+ user mints a per-batch token with a TTL;
 * field photographers paste/scan the URL and upload directly to
 * `POST /api/upload/media` using `Authorization: Bearer <token>` without
 * having an operator session.
 *
 * Security model
 * --------------
 * - Tokens are 32 random bytes (256-bit) rendered as 64 hex chars and
 *   returned to the caller exactly once at mint time. They are NEVER logged.
 * - We persist sha256(token) only; the database cannot reveal the raw token.
 * - Tokens are scoped to a single batch (verify rejects wrong-batch use).
 * - Tokens are TTL-bound (1 min .. 24 hours) and revocable by the issuer.
 * - Tokens are UPLOAD-ONLY: they cannot be used to read, list, serve, or
 *   delete media; they only authenticate `POST /api/upload/media` for the
 *   one batch they were minted for.
 */

const RAW_TOKEN_HEX_LENGTH = 64; // 32 bytes hex
const RAW_TOKEN_BYTES = 32;
const MAX_TTL_MINUTES = 24 * 60;

export interface MintUploadTokenInput {
  batchId: string;
  userId: string;
  ttlMinutes: number;
}

export interface MintUploadTokenResult {
  token: string; // raw token — returned ONCE; never persisted
  tokenId: string;
  expiresAt: Date;
}

export interface VerifyUploadTokenResult {
  tokenId: string;
  batchId: string;
  issuedBy: string;
  expiresAt: Date;
}

export interface RevokeUploadTokenInput {
  tokenId: string;
  userId: string;
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function isWellFormedRawToken(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/**
 * Mint a new upload token. Returns the RAW token exactly once; the caller is
 * responsible for transmitting it via a secure channel (e.g. a share link).
 * The DB only ever sees the sha256 hash.
 */
export async function mintUploadToken(
  pool: Pool,
  input: MintUploadTokenInput
): Promise<MintUploadTokenResult> {
  if (!Number.isFinite(input.ttlMinutes) || input.ttlMinutes <= 0) {
    throw new Error('ttlMinutes must be a positive integer.');
  }
  if (input.ttlMinutes > MAX_TTL_MINUTES) {
    throw new Error(`ttlMinutes must be <= ${MAX_TTL_MINUTES} (24 hours).`);
  }

  const rawToken = crypto.randomBytes(RAW_TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60_000);

  const result = await pool.query(
    `INSERT INTO photo_upload_tokens
       (token_hash, batch_id, issued_by, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, batch_id, issued_by, issued_at, expires_at, revoked_at, last_used_at, use_count`,
    [tokenHash, input.batchId, input.userId, expiresAt]
  );

  const row = (result as { rows: Array<{ id: string; expires_at: Date | string }> }).rows[0];
  if (!row) {
    throw new Error('Failed to mint upload token.');
  }

  return {
    token: rawToken,
    tokenId: row.id,
    expiresAt: row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at)
  };
}

/**
 * Verify a raw token presented in an Authorization: Bearer header. Returns
 * token context on success and throws otherwise. On success, the token's
 * `last_used_at` and `use_count` are updated (best-effort audit trail —
 * failure to update does not invalidate the auth result, but the update is
 * issued in the same call so it always lands on happy path).
 */
export async function verifyUploadToken(
  pool: Pool,
  rawToken: string,
  expectedBatchId: string
): Promise<VerifyUploadTokenResult> {
  if (typeof rawToken !== 'string' || !isWellFormedRawToken(rawToken)) {
    throw new Error('Invalid upload token.');
  }

  const tokenHash = hashToken(rawToken);

  const selectResult = await pool.query(
    `SELECT id, batch_id, issued_by, issued_at, expires_at, revoked_at, last_used_at, use_count
       FROM photo_upload_tokens
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );

  const row = (selectResult as {
    rows: Array<{
      id: string;
      batch_id: string;
      issued_by: string;
      expires_at: Date | string;
      revoked_at: Date | string | null;
    }>;
  }).rows[0];

  if (!row) {
    throw new Error('Invalid upload token.');
  }

  if (row.revoked_at) {
    throw new Error('Upload token revoked.');
  }

  const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  if (expiresAt.getTime() <= Date.now()) {
    throw new Error('Upload token expired.');
  }

  if (row.batch_id !== expectedBatchId) {
    throw new Error('Upload token does not match this batch.');
  }

  // Audit trail bump — best effort. If this update fails we don't fail the
  // auth check, but DO surface the error for observability.
  try {
    await pool.query(
      `UPDATE photo_upload_tokens
          SET last_used_at = now(),
              use_count    = use_count + 1
        WHERE id = $1`,
      [row.id]
    );
  } catch (err) {
    // Audit bump failed; auth itself stays valid.
    logger.error('Audit bump failed', {
      module: 'photoUploadTokens',
      tokenId: row.id,
      error: err instanceof Error ? err.message : String(err)
    });
  }

  return {
    tokenId: row.id,
    batchId: row.batch_id,
    issuedBy: row.issued_by,
    expiresAt
  };
}

/**
 * Revoke an upload token by id. Only the issuer (or any manager) should be
 * calling this — the caller (commandBus) enforces the role check.
 */
export async function revokeUploadToken(
  pool: Pool,
  input: RevokeUploadTokenInput
): Promise<void> {
  const result = await pool.query(
    `UPDATE photo_upload_tokens
        SET revoked_at = now()
      WHERE id = $1
        AND revoked_at IS NULL
      RETURNING id`,
    [input.tokenId]
  );

  const row = (result as { rows: Array<{ id: string }> }).rows[0];
  if (!row) {
    throw new Error('Upload token not found or already revoked.');
  }
}
