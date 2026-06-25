/**
 * Media domain — command payload schemas.
 *
 * Extracted from src/server/services/commandBus.ts during
 * command-registry migration.  These are pure Zod schemas with
 * zero dependencies on commandBus internals.
 */
import { z } from 'zod';

export const attachBatchPhotoPayloadSchema = z.object({
  batchId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  photoUrl: z.string().min(1),
  notes: z.string().optional(),
}).passthrough();

export const uploadBatchMediaPayloadSchema = z.object({
  batchId: z.string().uuid(),
  filePath: z.string().min(1),
  originalFilename: z.string().min(1),
  fileSize: z.coerce.number(),
  mimeType: z.string().min(1),
  mediaType: z.string().min(1),
  thumbnailPath: z.string().optional(),
  mediumPath: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

export const setBatchMediaRolePayloadSchema = z.object({
  mediaId: z.string().uuid(),
  role: z.string().min(1),
}).passthrough();

export const publishBatchMediaPayloadSchema = z.object({
  mediaId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const deleteBatchMediaPayloadSchema = z.object({
  mediaId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
}).passthrough();

export const mintPhotoUploadTokenPayloadSchema = z.object({
  batchId: z.string().uuid(),
  ttlMinutes: z.coerce.number(),
}).passthrough();

export const revokePhotoUploadTokenPayloadSchema = z.object({
  tokenId: z.string().uuid(),
}).passthrough();
