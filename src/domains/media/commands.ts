/**
 * Media domain — command handlers.
 *
 * Extracted from src/server/services/commandBus.ts in P1.MED.EXTRACT.
 *
 * NOTE: this module intentionally imports helpers, schemas, and the Payload
 * type from `@/server/services/commandBus`. commandBus.ts in turn re-imports
 * the 7 media command handlers from this module, which creates a circular
 * import. This is safe under ESM because every reference to those imported
 * bindings lives inside a function body — by the time runCommand() invokes a
 * media handler, commandBus.ts has fully evaluated and the live bindings
 * are resolved (same pattern as P1.PO / P1.PAY / P1.SAL / P1.CRED extractions).
 *
 * The 7 commands:
 *   - attachBatchPhoto         (legacy URL-attach flow)
 *   - uploadBatchMedia         (file-upload media row insert)
 *   - setBatchMediaRole        (promote/demote primary photo/video)
 *   - publishBatchMedia        (draft → published)
 *   - deleteBatchMedia         (cascade row + best-effort file cleanup)
 *   - mintPhotoUploadToken     (tokenized photographer share link)
 *   - revokePhotoUploadToken   (invalidate a share link)
 *
 * The two photo-upload-token helpers were previously named
 * `mintPhotoUploadTokenCommand` / `revokePhotoUploadTokenCommand` inside
 * commandBus.ts. They are renamed to their natural names here; the switch
 * cases in commandBus dispatch by case-string, not by the function symbol,
 * so the rename is internal and observable only to this module.
 *
 * Future cleanup (P2+): hoist the shared helpers to `@/domains/shared/...`
 * and remove the cycle entirely.
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import {
  batches,
  batchMedia,
  photographyQueue,
  photoUploadTokens,
} from '@/server/schema';
import type { Tx } from '@/server/db';

import type { CommandResult } from '../../shared/types';

// scrubDatabaseError lives in the trpc module; safe to import directly
// (no cycle through commandBus).
import { scrubDatabaseError } from '@/server/trpc';

// Filesystem media-cleanup helper; safe to import directly.
import { deleteMedia } from '@/server/services/mediaStorage';

// Helpers and the Payload type are kept in commandBus.ts for this phase
// (see header comment).
import {
  // Helpers
  requiredId,
  requiredNumber,
  requiredString,
  stringValue,
  // Types
  type Payload,
} from '@/server/services/commandBus';

// ---------------------------------------------------------------------------
// Module-internal constants
// ---------------------------------------------------------------------------

const ALLOWED_MEDIA_TYPES = new Set(['photo', 'video']);
const ALLOWED_MEDIA_ROLES = new Set(['primary_photo', 'primary_video', 'additional']);

// Photo upload tokens cap (24 hours). Mirrors the value previously defined
// inline in commandBus.ts above mintPhotoUploadTokenCommand.
const PHOTO_UPLOAD_TOKEN_MAX_TTL_MINUTES = 24 * 60;

// ---------------------------------------------------------------------------
// Legacy URL-attach flow
// ---------------------------------------------------------------------------

export async function attachBatchPhoto(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId ?? payload.id, 'batchId');
  const photoUrl = requiredString(payload.photoUrl, 'photoUrl');
  if (!/^https?:\/\/.+/.test(photoUrl)) {
    throw new Error('photoUrl must be a valid http or https URL.');
  }
  if (photoUrl.length > 2048) {
    throw new Error('photoUrl must be 2048 characters or fewer.');
  }
  await tx.update(batches).set({ photoUrl, mediaStatus: 'done', updatedAt: new Date() }).where(eq(batches.id, batchId));
  await tx.insert(photographyQueue).values({ batchId, requestedBy: userId, status: 'done', notes: stringValue(payload.notes) || null });
  return { ok: true, commandId, affectedIds: [batchId], toast: 'Batch photo attached.' };
}

// ---------------------------------------------------------------------------
// Photography Module — file-upload media commands (Phase D Tasks 13-14)
// These commands manage the batch_media table populated by the /api/upload/media
// route. They run in parallel with the legacy URL-attach flow (attachBatchPhoto).
// ---------------------------------------------------------------------------

export async function uploadBatchMedia(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId, 'batchId');
  const filePath = requiredString(payload.filePath, 'filePath');
  const originalFilename = requiredString(payload.originalFilename, 'originalFilename');
  const fileSize = requiredNumber(payload.fileSize, 'fileSize');
  if (fileSize < 0) throw new Error('fileSize must be non-negative.');
  const mimeType = requiredString(payload.mimeType, 'mimeType');
  const mediaType = requiredString(payload.mediaType, 'mediaType');
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    throw new Error(`mediaType must be one of: ${[...ALLOWED_MEDIA_TYPES].join(', ')}.`);
  }
  const thumbnailPath = stringValue(payload.thumbnailPath) || null;
  const mediumPath = stringValue(payload.mediumPath) || null;
  const notes = stringValue(payload.notes) || null;

  const [row] = await tx
    .insert(batchMedia)
    .values({
      batchId,
      filePath,
      originalFilename,
      fileSize,
      mimeType,
      thumbnailPath,
      mediumPath,
      mediaType,
      role: 'additional',
      status: 'draft',
      uploadedBy: userId,
      notes
    })
    .returning();

  return {
    ok: true,
    commandId,
    affectedIds: [row.id],
    toast: `Media uploaded (${originalFilename}).`
  };
}

export async function setBatchMediaRole(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const mediaId = requiredId(payload.mediaId, 'mediaId');
  const role = requiredString(payload.role, 'role');
  if (!ALLOWED_MEDIA_ROLES.has(role)) {
    throw new Error(`role must be one of: ${[...ALLOWED_MEDIA_ROLES].join(', ')}.`);
  }

  // Lock the target row to prevent concurrent role changes on the same row.
  const targetRows = await tx.execute(
    sql`SELECT id, batch_id, role, status FROM ${batchMedia} WHERE ${batchMedia.id} = ${mediaId} FOR UPDATE`
  );
  const target = targetRows.rows[0];
  if (!target) throw new Error('Batch media row not found.');

  // If promoting to a primary role, also lock any existing published primary
  // for the same batch+role so two concurrent ops can't both claim the slot.
  if (role === 'primary_photo' || role === 'primary_video') {
    await tx.execute(
      sql`SELECT id FROM ${batchMedia}
          WHERE batch_id = ${target.batch_id}
            AND role = ${role}
            AND status = 'published'
            AND replaced_at IS NULL
          FOR UPDATE`
    );
  }

  try {
    await tx
      .update(batchMedia)
      .set({ role, updatedAt: new Date() })
      .where(eq(batchMedia.id, mediaId))
      .returning();
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    // Defense in depth (GH #24 follow-up): even though the outer dispatcher
    // catch path scrubs DB error text before it reaches the tRPC envelope, we
    // also re-throw a scrubbed message here so any intermediate layer that
    // surfaces err.message cannot leak SQL/Drizzle internals.
    const { safeMessage } = scrubDatabaseError(err);
    const rawMessage = err instanceof Error ? err.message : String(err);
    if (code === '23505' || /unique/i.test(rawMessage)) {
      throw new Error('Another media row is already the primary for this batch. Demote it first or replace it.');
    }
    throw new Error(safeMessage);
  }

  return {
    ok: true,
    commandId,
    affectedIds: [mediaId],
    toast: `Media role set to ${role}.`
  };
}

export async function publishBatchMedia(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const mediaId = requiredId(payload.mediaId, 'mediaId');
  const now = new Date();

  const updated = await tx
    .update(batchMedia)
    .set({ status: 'published', publishedAt: now, updatedAt: now })
    .where(and(eq(batchMedia.id, mediaId), eq(batchMedia.status, 'draft')))
    .returning();

  if (!updated.length) {
    throw new Error('Batch media not found or not in draft status.');
  }

  return {
    ok: true,
    commandId,
    affectedIds: [mediaId],
    toast: 'Media published.'
  };
}

export async function deleteBatchMedia(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const mediaId = requiredId(payload.mediaId, 'mediaId');

  const rows = await tx
    .select()
    .from(batchMedia)
    .where(eq(batchMedia.id, mediaId));
  const row = rows[0];
  if (!row) throw new Error('Batch media row not found.');

  await tx.delete(batchMedia).where(eq(batchMedia.id, mediaId));

  // Best-effort: delete files; DB row is source of truth.
  try {
    await deleteMedia(row.filePath, row.thumbnailPath ?? undefined, row.mediumPath ?? undefined);
  } catch (err) {
    // non-DB error: deleteMedia is filesystem/storage I/O, so err.message is
    // safe to surface in server-side logs (no SQL text to leak).
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`[deleteBatchMedia] file cleanup failed for ${mediaId}: ${message}`);
  }

  return {
    ok: true,
    commandId,
    affectedIds: [mediaId],
    toast: 'Media deleted.'
  };
}

// ---------------------------------------------------------------------------
// Photo Upload Tokens — tokenized photographer share links (#73, #93 F1)
// ---------------------------------------------------------------------------

export async function mintPhotoUploadToken(
  tx: Tx,
  payload: Payload,
  userId: string,
  commandId: string
): Promise<CommandResult> {
  const batchId = requiredId(payload.batchId, 'batchId');
  const ttlMinutes = requiredNumber(payload.ttlMinutes, 'ttlMinutes');
  if (!Number.isInteger(ttlMinutes) || ttlMinutes <= 0) {
    throw new Error('ttlMinutes must be a positive integer.');
  }
  if (ttlMinutes > PHOTO_UPLOAD_TOKEN_MAX_TTL_MINUTES) {
    throw new Error(`ttlMinutes must be <= ${PHOTO_UPLOAD_TOKEN_MAX_TTL_MINUTES} (24 hours).`);
  }

  // Confirm the batch exists so we don't issue tokens for unknown batches.
  const [batchRow] = await tx.select({ id: batches.id }).from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batchRow) throw new Error('Batch not found.');

  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  const [inserted] = await tx
    .insert(photoUploadTokens)
    .values({
      batchId,
      tokenHash,
      issuedBy: userId,
      expiresAt
    })
    .returning();

  if (!inserted) throw new Error('Failed to mint photo upload token.');

  // Return raw token to caller via `delta`. This is the ONLY place it appears
  // outside the photographer's clipboard/URL. We intentionally do NOT put it
  // on `affectedIds`, `toast`, or any journal-visible field — the command
  // journal snapshot only records the token row id and expiry.
  return {
    ok: true,
    commandId,
    affectedIds: [inserted.id],
    toast: `Upload share link minted (expires ${expiresAt.toISOString()}).`,
    delta: {
      token: rawToken,
      tokenId: inserted.id,
      batchId,
      expiresAt: expiresAt.toISOString()
    }
  };
}

export async function revokePhotoUploadToken(
  tx: Tx,
  payload: Payload,
  commandId: string
): Promise<CommandResult> {
  const tokenId = requiredId(payload.tokenId, 'tokenId');

  const updated = await tx
    .update(photoUploadTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(photoUploadTokens.id, tokenId), sql`${photoUploadTokens.revokedAt} IS NULL`))
    .returning();

  if (!updated.length) throw new Error('Upload token not found or already revoked.');

  return {
    ok: true,
    commandId,
    affectedIds: [tokenId],
    toast: 'Upload share link revoked.'
  };
}
