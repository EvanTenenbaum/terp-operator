import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Auth mock: bypass real PG session middleware + control getSessionUser
// ---------------------------------------------------------------------------
vi.mock('../server/auth', () => ({
  sessionMiddleware: (_req: any, _res: any, next: any) => next(),
  getSessionUser: vi.fn()
}));

// ---------------------------------------------------------------------------
// DB mock: prevent real PG pool from being created when auth/db is imported
// ---------------------------------------------------------------------------
vi.mock('../server/db', () => ({
  db: {},
  pool: {},
  pingDatabase: vi.fn().mockResolvedValue(undefined)
}));

// ---------------------------------------------------------------------------
// Sharp mock: skip real image processing inside thumbnail/HEIC code paths
// ---------------------------------------------------------------------------
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toFile: vi.fn(async (target: string) => {
      // Pretend sharp wrote the output file so downstream cleanup works
      await fsp.writeFile(target, 'fake-sharp-output');
      return {};
    })
  }))
}));

// ---------------------------------------------------------------------------
// Magic-bytes mock: control valid/invalid per test
// ---------------------------------------------------------------------------
vi.mock('../server/services/mediaValidation', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    validateMagicBytes: vi.fn()
  };
});

// ---------------------------------------------------------------------------
// Disk-space mock: keep tests independent of host disk reality
// ---------------------------------------------------------------------------
vi.mock('../server/utils/diskSpace', () => ({
  checkDiskSpace: vi.fn().mockResolvedValue(undefined)
}));

import request from 'supertest';
import { createApp } from '../server/app';
import { getSessionUser } from '../server/auth';
import { validateMagicBytes } from '../server/services/mediaValidation';

const BATCH_ID = '123e4567-e89b-12d3-a456-426614174000';

// Minimal JPEG: FF D8 FF E0 magic bytes + JFIF header padding
const JPEG_FIXTURE = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
  0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
]);

let tmpRoot: string;
let originalStoragePath: string | undefined;
let originalEnablePhotography: string | undefined;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'uploadRoute-'));
  originalStoragePath = process.env.MEDIA_STORAGE_PATH;
  process.env.MEDIA_STORAGE_PATH = tmpRoot;
  originalEnablePhotography = process.env.ENABLE_PHOTOGRAPHY;

  const fakeIo: any = { on: vi.fn(), emit: vi.fn() };
  app = createApp(() => fakeIo);

  // Default to operator user — individual tests override as needed
  vi.mocked(getSessionUser).mockResolvedValue({
    id: 'op1',
    name: 'Op',
    email: 'op@example.com',
    role: 'operator',
    workLoop: null
  });

  // Default magic bytes to valid JPEG
  vi.mocked(validateMagicBytes).mockResolvedValue({
    valid: true,
    actualType: 'image/jpeg'
  });
});

afterEach(async () => {
  if (originalStoragePath === undefined) {
    delete process.env.MEDIA_STORAGE_PATH;
  } else {
    process.env.MEDIA_STORAGE_PATH = originalStoragePath;
  }
  if (originalEnablePhotography === undefined) {
    delete process.env.ENABLE_PHOTOGRAPHY;
  } else {
    process.env.ENABLE_PHOTOGRAPHY = originalEnablePhotography;
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

describe('POST /api/upload/media', () => {
  it('returns 401 when there is no session user', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/upload/media')
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
  });

  it('returns 403 when the user is below operator role (viewer)', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce({
      id: 'v1',
      name: 'Viewer',
      email: 'v@example.com',
      role: 'viewer',
      workLoop: null
    });

    const res = await request(app)
      .post('/api/upload/media')
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Operator access required' });
  });

  it('returns 400 when batchId is missing', async () => {
    const res = await request(app)
      .post('/api/upload/media')
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 with an invalid batchId format', async () => {
    const res = await request(app)
      .post('/api/upload/media')
      .field('batchId', 'not-a-uuid')
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 for a disallowed file extension (.exe)', async () => {
    const res = await request(app)
      .post('/api/upload/media')
      .field('batchId', BATCH_ID)
      .attach('file', Buffer.from('MZ\x90\x00'), 'evil.exe');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/File type not allowed/i);
  });

  it('returns 400 when magic-bytes validation fails (mismatched type)', async () => {
    vi.mocked(validateMagicBytes).mockResolvedValueOnce({ valid: false });

    const res = await request(app)
      .post('/api/upload/media')
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/magic bytes/i);
  });

  it('returns 200 with full metadata for a valid JPEG upload', async () => {
    const res = await request(app)
      .post('/api/upload/media')
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(200);
    expect(res.body.fileId).toBeDefined();
    expect(typeof res.body.fileId).toBe('string');
    expect(res.body.filePath).toContain(BATCH_ID);
    expect(res.body.mimeType).toBe('image/jpeg');
    expect(res.body.thumbnailPath).toBeDefined();
    expect(res.body.mediumPath).toBeDefined();
    expect(res.body.originalFilename).toBe('photo.jpg');
    expect(res.body.fileSize).toBe(JPEG_FIXTURE.length);

    // Verify the uploaded file ended up under tmpRoot/<batchId>/
    const batchDir = path.join(tmpRoot, BATCH_ID);
    expect(fs.existsSync(batchDir)).toBe(true);
  });

  it('returns 503 when ENABLE_PHOTOGRAPHY=false', async () => {
    process.env.ENABLE_PHOTOGRAPHY = 'false';

    const res = await request(app)
      .post('/api/upload/media')
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Photography feature is disabled' });
  });

  it('returns 507 when disk space pre-flight fails', async () => {
    const { checkDiskSpace } = await import('../server/utils/diskSpace');
    vi.mocked(checkDiskSpace).mockRejectedValueOnce(
      new Error('Insufficient disk space.')
    );

    const res = await request(app)
      .post('/api/upload/media')
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(507);
    expect(res.body.error).toMatch(/disk space/i);
  });
});

describe('DELETE /api/upload/media/staged', () => {
  it('returns 401 when there is no session user', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(null);

    const res = await request(app)
      .delete('/api/upload/media/staged')
      .send({ filePath: path.join(tmpRoot, BATCH_ID, 'file.jpg') });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
  });

  it('returns 403 when the user is below operator role (viewer)', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce({
      id: 'v1',
      name: 'Viewer',
      email: 'v@example.com',
      role: 'viewer',
      workLoop: null
    });

    const res = await request(app)
      .delete('/api/upload/media/staged')
      .send({ filePath: path.join(tmpRoot, BATCH_ID, 'file.jpg') });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Operator access required' });
  });

  it('returns 400 when filePath is missing', async () => {
    const res = await request(app)
      .delete('/api/upload/media/staged')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('deletes the main file and optional thumbnail/medium under MEDIA_STORAGE_PATH', async () => {
    const batchDir = path.join(tmpRoot, BATCH_ID);
    await fsp.mkdir(batchDir, { recursive: true });

    const filePath = path.join(batchDir, 'file.jpg');
    const thumbnailPath = path.join(batchDir, 'thumb.jpg');
    const mediumPath = path.join(batchDir, 'medium.jpg');

    await fsp.writeFile(filePath, 'main');
    await fsp.writeFile(thumbnailPath, 'thumb');
    await fsp.writeFile(mediumPath, 'medium');

    const res = await request(app)
      .delete('/api/upload/media/staged')
      .send({ filePath, thumbnailPath, mediumPath });

    expect(res.status).toBe(200);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.existsSync(thumbnailPath)).toBe(false);
    expect(fs.existsSync(mediumPath)).toBe(false);
  });

  it('tolerates missing files so cleanup is idempotent', async () => {
    const filePath = path.join(tmpRoot, BATCH_ID, 'nonexistent.jpg');

    const res = await request(app)
      .delete('/api/upload/media/staged')
      .send({ filePath });

    expect(res.status).toBe(200);
  });

  it('returns 400 for a path outside MEDIA_STORAGE_PATH (path traversal)', async () => {
    const res = await request(app)
      .delete('/api/upload/media/staged')
      .send({ filePath: '/etc/passwd' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsafe path/i);
  });

  it('returns 400 when thumbnailPath is outside MEDIA_STORAGE_PATH even if filePath is safe', async () => {
    const batchDir = path.join(tmpRoot, BATCH_ID);
    await fsp.mkdir(batchDir, { recursive: true });
    const safeFile = path.join(batchDir, 'file.jpg');
    await fsp.writeFile(safeFile, 'main');

    const res = await request(app)
      .delete('/api/upload/media/staged')
      .send({ filePath: safeFile, thumbnailPath: '/etc/passwd' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsafe path/i);
    // Safe file should remain untouched
    expect(fs.existsSync(safeFile)).toBe(true);
  });

  it('returns 400 for a relative path that resolves outside MEDIA_STORAGE_PATH', async () => {
    const res = await request(app)
      .delete('/api/upload/media/staged')
      .send({ filePath: path.join(tmpRoot, '..', 'outside.txt') });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsafe path/i);
  });
});
