/**
 * Media domain — characterization tests.
 *
 * Most media handlers validate inputs before any DB access, so we can test
 * error paths without needing a real database.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  getDb: vi.fn(),
}));

describe('media domain barrel', () => {
  let Media: Record<string, unknown>;

  beforeAll(async () => {
    Media = (await import('../index')) as unknown as Record<string, unknown>;
  });

  const expected = [
    'attachBatchPhoto', 'deleteBatchMedia', 'mintPhotoUploadToken',
    'publishBatchMedia', 'revokePhotoUploadToken', 'setBatchMediaRole', 'uploadBatchMedia',
  ];

  for (const name of expected) {
    it(`exports ${name}`, () => {
      expect(Media).toHaveProperty(name);
      expect(typeof Media[name]).toBe('function');
    });
  }
});

describe('media domain — attachBatchPhoto pre-DB validation', () => {
  it('rejects invalid photoUrl', async () => {
    const mod = await import('../commands');
    const mockTx = {} as any;
    await expect(
      mod.attachBatchPhoto(mockTx, {
        batchId: '00000000-0000-0000-0000-000000000000',
        photoUrl: 'not-a-url',
      }, 'user-1', 'cmd-1')
    ).rejects.toThrow('photoUrl must be a valid http or https URL');
  });

  it('rejects excessively long photoUrl', async () => {
    const mod = await import('../commands');
    const mockTx = {} as any;
    const longUrl = 'https://example.com/' + 'a'.repeat(2100);
    await expect(
      mod.attachBatchPhoto(mockTx, {
        batchId: '00000000-0000-0000-0000-000000000000',
        photoUrl: longUrl,
      }, 'user-1', 'cmd-1')
    ).rejects.toThrow('photoUrl must be 2048 characters or fewer');
  });
});

describe('media domain — uploadBatchMedia pre-DB validation', () => {
  it('validates mediaType enum', async () => {
    const mod = await import('../commands');
    const mockTx = {} as any;
    await expect(
      mod.uploadBatchMedia(mockTx, {
        batchId: '00000000-0000-0000-0000-000000000000',
        filePath: '/tmp/test.jpg',
        originalFilename: 'test.jpg',
        fileSize: 1000,
        mimeType: 'image/jpeg',
        mediaType: 'invalid-type',
      }, 'user-1', 'cmd-1')
    ).rejects.toThrow('mediaType must be one of');
  });

  it('rejects negative fileSize', async () => {
    const mod = await import('../commands');
    const mockTx = {} as any;
    await expect(
      mod.uploadBatchMedia(mockTx, {
        batchId: '00000000-0000-0000-0000-000000000000',
        filePath: '/tmp/test.jpg',
        originalFilename: 'test.jpg',
        fileSize: -1,
        mimeType: 'image/jpeg',
        mediaType: 'photo',
      }, 'user-1', 'cmd-1')
    ).rejects.toThrow('fileSize must be non-negative');
  });
});

describe('media domain — setBatchMediaRole pre-DB validation', () => {
  it('validates role enum', async () => {
    const mod = await import('../commands');
    const mockTx = {} as any;
    await expect(
      mod.setBatchMediaRole(mockTx, {
        mediaId: '00000000-0000-0000-0000-000000000000',
        role: 'not-a-role',
      }, 'cmd-1')
    ).rejects.toThrow('role must be one of');
  });
});

describe('media domain — mintPhotoUploadToken pre-DB validation', () => {
  it('requires positive ttlMinutes', async () => {
    const mod = await import('../commands');
    const mockTx = {} as any;
    await expect(
      mod.mintPhotoUploadToken(mockTx, {
        batchId: '00000000-0000-0000-0000-000000000000',
        ttlMinutes: 0,
      }, 'user-1', 'cmd-1')
    ).rejects.toThrow('ttlMinutes must be a positive integer');
  });

  it('caps ttlMinutes at 24 hours', async () => {
    const mod = await import('../commands');
    const mockTx = {} as any;
    await expect(
      mod.mintPhotoUploadToken(mockTx, {
        batchId: '00000000-0000-0000-0000-000000000000',
        ttlMinutes: 9999,
      }, 'user-1', 'cmd-1')
    ).rejects.toThrow('ttlMinutes must be <=');
  });
});
