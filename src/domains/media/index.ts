/**
 * Media domain — curated re-exports.
 *
 * Consumers (e.g. commandBus.runCommand switch) should import handlers from
 * this barrel rather than reaching into commands.ts directly.
 */

export {
  attachBatchPhoto,
  deleteBatchMedia,
  mintPhotoUploadToken,
  publishBatchMedia,
  revokePhotoUploadToken,
  setBatchMediaRole,
  uploadBatchMedia,
} from './commands';
