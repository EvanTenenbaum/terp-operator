import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { requireOperator } from '../middleware/requireOperator';
import { uploadRateLimiter } from '../middleware/httpRateLimiters';
import { requirePhotographyEnabled } from '../middleware/requirePhotographyEnabled';
import { checkDiskSpace } from '../utils/diskSpace';
import { resolveBatchMediaPath } from '../utils/mediaStorage';
import {
  validateBatchIdFormat,
  sanitizeFilename,
  validateMagicBytes
} from '../services/mediaValidation';
import { convertHeicToJpeg, generateThumbnails } from '../services/mediaStorage';

const router = express.Router();

const MAX_PHOTO_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.mp4', '.mov', '.heic'];

function getMediaStoragePath(): string {
  return process.env.MEDIA_STORAGE_PATH || 'storage/media';
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        const batchId = (req.body as { batchId?: string } | undefined)?.batchId;
        if (!batchId) {
          return cb(new Error('Invalid batch ID format: batchId is required'), '');
        }
        validateBatchIdFormat(batchId);
        const dir = resolveBatchMediaPath(getMediaStoragePath(), batchId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err as Error, '');
      }
    },
    filename: (_req, file, cb) => {
      const uuid = crypto.randomUUID();
      const sanitized = sanitizeFilename(file.originalname);
      cb(null, `${uuid}_${sanitized}`);
    }
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`File type not allowed: ${ext}`));
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_VIDEO_SIZE }
});

router.post(
  '/api/upload/media',
  requirePhotographyEnabled,
  requireOperator,
  uploadRateLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        if (message.includes('File type not allowed')) {
          return res.status(400).json({ error: message });
        }
        if (message.includes('Invalid batch ID')) {
          return res.status(400).json({ error: message });
        }
        return res.status(400).json({ error: message });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const file = req.file;
    try {
      if (!file) {
        return res
          .status(400)
          .json({ error: 'No file uploaded — missing batchId or file' });
      }

      // Refine size limit by mimetype (multer enforced the 200MB ceiling)
      const isVideo = file.mimetype.startsWith('video/');
      const sizeLimit = isVideo ? MAX_VIDEO_SIZE : MAX_PHOTO_SIZE;
      if (file.size > sizeLimit) {
        await fsp.unlink(file.path).catch(() => {});
        return res.status(400).json({
          error: `File size exceeds ${isVideo ? '200MB' : '50MB'} limit`
        });
      }

      // Disk-space sanity (~1.5x for thumbnail generation headroom)
      try {
        await checkDiskSpace(getMediaStoragePath(), file.size);
      } catch (diskErr) {
        await fsp.unlink(file.path).catch(() => {});
        return res.status(507).json({
          error: diskErr instanceof Error ? diskErr.message : 'Insufficient disk space'
        });
      }

      // Magic-bytes content sniff
      const magicCheck = await validateMagicBytes(file.path);
      if (!magicCheck.valid) {
        await fsp.unlink(file.path).catch(() => {});
        return res.status(400).json({
          error: 'File type validation failed (magic bytes mismatch)'
        });
      }

      // HEIC → JPEG conversion (also unlinks the original heic)
      let finalPath = file.path;
      let finalMimeType = magicCheck.actualType ?? file.mimetype;
      if (finalMimeType === 'image/heic') {
        finalPath = await convertHeicToJpeg(file.path);
        finalMimeType = 'image/jpeg';
      }

      // Thumbnails only for images
      const fileId = crypto.randomUUID();
      let thumbnailPath: string | undefined;
      let mediumPath: string | undefined;
      if (finalMimeType.startsWith('image/')) {
        const batchId = (req.body as { batchId: string }).batchId;
        const thumbs = await generateThumbnails(finalPath, fileId, batchId);
        thumbnailPath = thumbs.thumb;
        mediumPath = thumbs.medium;
      }

      return res.json({
        fileId,
        filePath: finalPath,
        originalFilename: file.originalname,
        fileSize: file.size,
        mimeType: finalMimeType,
        thumbnailPath,
        mediumPath
      });
    } catch (error) {
      console.error('Upload route error:', error);
      if (file?.path) {
        await fsp.unlink(file.path).catch(() => {});
      }
      return res.status(500).json({ error: 'Upload failed' });
    }
  }
);

export default router;
