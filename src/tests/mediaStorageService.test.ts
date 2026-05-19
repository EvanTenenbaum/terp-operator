import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

vi.mock('sharp', () => {
  return {
    default: vi.fn(() => ({
      rotate: vi.fn().mockReturnThis(),
      resize: vi.fn().mockReturnThis(),
      jpeg: vi.fn().mockReturnThis(),
      toFile: vi.fn().mockResolvedValue({})
    }))
  };
});

import sharp from 'sharp';
import {
  uploadMedia,
  deleteMedia,
  generateThumbnails,
  convertHeicToJpeg
} from '../server/services/mediaStorage';

const BATCH_ID = '123e4567-e89b-12d3-a456-426614174000';

let tmpRoot: string;
let originalStoragePath: string | undefined;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mediaStorageService-'));
  originalStoragePath = process.env.MEDIA_STORAGE_PATH;
  process.env.MEDIA_STORAGE_PATH = tmpRoot;
});

afterEach(async () => {
  if (originalStoragePath === undefined) {
    delete process.env.MEDIA_STORAGE_PATH;
  } else {
    process.env.MEDIA_STORAGE_PATH = originalStoragePath;
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

describe('mediaStorage service', () => {
  describe('uploadMedia', () => {
    it('saves file metadata and returns filePath/fileSize/mimeType', async () => {
      const filePath = path.join(tmpRoot, 'photo-1.jpg');
      await fsp.writeFile(filePath, 'fake-jpeg-bytes');

      const result = await uploadMedia(
        {
          path: filePath,
          originalname: 'original.jpg',
          size: 15,
          mimetype: 'image/jpeg'
        },
        BATCH_ID
      );

      expect(result.filePath).toBe(filePath);
      expect(result.fileSize).toBe(15);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('generates thumbnail and medium paths for image/jpeg input', async () => {
      const filePath = path.join(tmpRoot, 'photo-2.jpg');
      await fsp.writeFile(filePath, 'fake-jpeg-bytes');

      const result = await uploadMedia(
        {
          path: filePath,
          originalname: 'original.jpg',
          size: 15,
          mimetype: 'image/jpeg'
        },
        BATCH_ID
      );

      expect(result.thumbnailPath).toBeDefined();
      expect(result.mediumPath).toBeDefined();
      expect(result.thumbnailPath).toMatch(/_thumb\.jpg$/);
      expect(result.mediumPath).toMatch(/_medium\.jpg$/);
    });

    it('skips thumbnail generation for video/mp4 input', async () => {
      const filePath = path.join(tmpRoot, 'video-1.mp4');
      await fsp.writeFile(filePath, 'fake-mp4-bytes');

      const result = await uploadMedia(
        {
          path: filePath,
          originalname: 'original.mp4',
          size: 14,
          mimetype: 'video/mp4'
        },
        BATCH_ID
      );

      expect(result.thumbnailPath).toBeUndefined();
      expect(result.mediumPath).toBeUndefined();
      expect(sharp).not.toHaveBeenCalled();
    });
  });

  describe('deleteMedia', () => {
    it('deletes the main file and thumb + medium when provided', async () => {
      const mainPath = path.join(tmpRoot, 'main.jpg');
      const thumbPath = path.join(tmpRoot, 'main_thumb.jpg');
      const mediumPath = path.join(tmpRoot, 'main_medium.jpg');
      await fsp.writeFile(mainPath, 'main');
      await fsp.writeFile(thumbPath, 'thumb');
      await fsp.writeFile(mediumPath, 'medium');

      await deleteMedia(mainPath, thumbPath, mediumPath);

      expect(fs.existsSync(mainPath)).toBe(false);
      expect(fs.existsSync(thumbPath)).toBe(false);
      expect(fs.existsSync(mediumPath)).toBe(false);
    });

    it('does not throw if files do not exist (best-effort)', async () => {
      const ghost = path.join(tmpRoot, 'ghost.jpg');
      await expect(deleteMedia(ghost)).resolves.toBeUndefined();
      await expect(
        deleteMedia(ghost, path.join(tmpRoot, 'ghost_thumb.jpg'), path.join(tmpRoot, 'ghost_medium.jpg'))
      ).resolves.toBeUndefined();
    });
  });

  describe('generateThumbnails', () => {
    it('returns paths containing _thumb.jpg and _medium.jpg', async () => {
      const srcPath = path.join(tmpRoot, 'source.jpg');
      await fsp.writeFile(srcPath, 'src');

      const result = await generateThumbnails(srcPath, 'media-xyz', BATCH_ID);

      expect(result.thumb).toMatch(/_thumb\.jpg$/);
      expect(result.medium).toMatch(/_medium\.jpg$/);
    });

    it('thumb path includes batchId and mediaId', async () => {
      const srcPath = path.join(tmpRoot, 'source.jpg');
      await fsp.writeFile(srcPath, 'src');

      const result = await generateThumbnails(srcPath, 'media-xyz', BATCH_ID);

      expect(result.thumb).toContain(BATCH_ID);
      expect(result.thumb).toContain('media-xyz');
    });

    it('medium path includes batchId and mediaId', async () => {
      const srcPath = path.join(tmpRoot, 'source.jpg');
      await fsp.writeFile(srcPath, 'src');

      const result = await generateThumbnails(srcPath, 'media-xyz', BATCH_ID);

      expect(result.medium).toContain(BATCH_ID);
      expect(result.medium).toContain('media-xyz');
    });
  });

  describe('convertHeicToJpeg', () => {
    it('returns a .jpg path', async () => {
      const heicPath = path.join(tmpRoot, 'image.heic');
      await fsp.writeFile(heicPath, 'heic-bytes');

      const result = await convertHeicToJpeg(heicPath);

      expect(result.endsWith('.jpg')).toBe(true);
      expect(path.basename(result)).toBe('image.jpg');
    });

    it('deletes the original .heic file after conversion', async () => {
      const heicPath = path.join(tmpRoot, 'photo.heic');
      await fsp.writeFile(heicPath, 'heic-bytes');

      await convertHeicToJpeg(heicPath);

      expect(fs.existsSync(heicPath)).toBe(false);
    });
  });
});
