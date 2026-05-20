import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateBatchIdFormat,
  sanitizeFilename,
  validateMagicBytes
} from '../server/services/mediaValidation';

vi.mock('file-type', () => ({
  fileTypeFromFile: vi.fn()
}));

import { fileTypeFromFile } from 'file-type';

describe('mediaValidation', () => {
  describe('validateBatchIdFormat', () => {
    it('accepts a valid UUID', () => {
      expect(() => validateBatchIdFormat('123e4567-e89b-12d3-a456-426614174000')).not.toThrow();
    });

    it('rejects invalid UUID', () => {
      expect(() => validateBatchIdFormat('not-a-uuid')).toThrow(/Invalid batch ID format/);
    });

    it('rejects path traversal attempts', () => {
      expect(() => validateBatchIdFormat('../etc/passwd')).toThrow(/Invalid batch ID format/);
    });
  });

  describe('sanitizeFilename', () => {
    it('preserves alphanumeric characters', () => {
      expect(sanitizeFilename('photo123.jpg')).toBe('photo123.jpg');
    });

    it('replaces special characters with underscores', () => {
      expect(sanitizeFilename('my photo!@#.jpg')).toBe('my_photo___.jpg');
    });

    it('prevents path traversal', () => {
      expect(sanitizeFilename('../../etc/passwd.jpg')).toBe('______etc_passwd.jpg');
    });

    it('preserves extension', () => {
      expect(sanitizeFilename('test.mp4')).toBe('test.mp4');
    });

    it('truncates long base names', () => {
      const longName = 'a'.repeat(200) + '.jpg';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(104);
    });
  });

  describe('validateMagicBytes', () => {
    beforeEach(() => {
      vi.mocked(fileTypeFromFile).mockReset();
    });

    it('accepts JPEG by mime', async () => {
      vi.mocked(fileTypeFromFile).mockResolvedValue({ mime: 'image/jpeg', ext: 'jpg' } as any);
      const result = await validateMagicBytes('/any/path.jpg');
      expect(result.valid).toBe(true);
      expect(result.actualType).toBe('image/jpeg');
    });

    it('accepts PNG, HEIC, MP4, QuickTime', async () => {
      for (const mime of ['image/png', 'image/heic', 'video/mp4', 'video/quicktime']) {
        vi.mocked(fileTypeFromFile).mockResolvedValueOnce({ mime, ext: mime.split('/')[1] } as any);
        const result = await validateMagicBytes(`/any/path.${mime}`);
        expect(result.valid).toBe(true);
        expect(result.actualType).toBe(mime);
      }
    });

    it('rejects unrecognized files (file-type returned undefined)', async () => {
      vi.mocked(fileTypeFromFile).mockResolvedValue(undefined as any);
      const result = await validateMagicBytes('/any/path.exe');
      expect(result.valid).toBe(false);
    });

    it('rejects disallowed mime types (e.g., gif)', async () => {
      vi.mocked(fileTypeFromFile).mockResolvedValue({ mime: 'image/gif', ext: 'gif' } as any);
      const result = await validateMagicBytes('/any/path.gif');
      expect(result.valid).toBe(false);
    });

    it('rejects when file-type throws (file unreadable)', async () => {
      vi.mocked(fileTypeFromFile).mockRejectedValue(new Error('ENOENT'));
      const result = await validateMagicBytes('/no/such/file');
      expect(result.valid).toBe(false);
    });
  });
});
