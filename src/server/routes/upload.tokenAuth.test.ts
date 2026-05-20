import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Auth mock: bypass real PG session middleware + control getSessionUser
// ---------------------------------------------------------------------------
vi.mock('../auth', () => ({
  sessionMiddleware: (_req: any, _res: any, next: any) => next(),
  getSessionUser: vi.fn()
}));

// ---------------------------------------------------------------------------
// DB mock: prevent real PG pool from being created when auth/db is imported.
// The upload route's token-auth path auto-registers a batch_media row via
// `db.insert(...).values(...).returning()`, so we mock a fluent chain that
// returns a fake row.
// ---------------------------------------------------------------------------
const mockReturning = vi.fn(async () => [{ id: 'media-row-id' }]);
vi.mock('../db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: mockReturning
      }))
    }))
  },
  pool: {},
  pingDatabase: vi.fn().mockResolvedValue(undefined)
}));

// ---------------------------------------------------------------------------
// Token service mock — we test the upload route's integration with it, not
// the service itself (that has its own dedicated unit tests).
// ---------------------------------------------------------------------------
vi.mock('../services/photoUploadTokens', () => ({
  verifyUploadToken: vi.fn()
}));

// ---------------------------------------------------------------------------
// Sharp mock
// ---------------------------------------------------------------------------
vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toFile: vi.fn(async (target: string) => {
      await fsp.writeFile(target, 'fake-sharp-output');
      return {};
    })
  }))
}));

// ---------------------------------------------------------------------------
// Magic-bytes mock
// ---------------------------------------------------------------------------
vi.mock('../services/mediaValidation', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    validateMagicBytes: vi.fn()
  };
});

// ---------------------------------------------------------------------------
// Disk-space mock
// ---------------------------------------------------------------------------
vi.mock('../utils/diskSpace', () => ({
  checkDiskSpace: vi.fn().mockResolvedValue(undefined)
}));

import request from 'supertest';
import { createApp } from '../app';
import { getSessionUser } from '../auth';
import { validateMagicBytes } from '../services/mediaValidation';
import { verifyUploadToken } from '../services/photoUploadTokens';

const BATCH_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_BATCH_ID = '99999999-9999-9999-9999-999999999999';

const JPEG_FIXTURE = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
  0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
]);

const RAW_TOKEN = crypto.randomBytes(32).toString('hex');

let tmpRoot: string;
let originalStoragePath: string | undefined;
let originalEnablePhotography: string | undefined;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'uploadTokenAuth-'));
  originalStoragePath = process.env.MEDIA_STORAGE_PATH;
  process.env.MEDIA_STORAGE_PATH = tmpRoot;
  originalEnablePhotography = process.env.ENABLE_PHOTOGRAPHY;

  const fakeIo: any = { on: vi.fn(), emit: vi.fn() };
  app = createApp(() => fakeIo);

  // Default: no session user (the share-link flow shouldn't depend on a session)
  vi.mocked(getSessionUser).mockResolvedValue(null);

  vi.mocked(validateMagicBytes).mockResolvedValue({ valid: true, actualType: 'image/jpeg' });
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

describe('POST /api/upload/media — share-token auth', () => {
  it('returns 401 with no session AND no bearer token', async () => {
    const res = await request(app)
      .post('/api/upload/media')
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(401);
    expect(verifyUploadToken).not.toHaveBeenCalled();
  });

  it('accepts upload via valid bearer token matching the batch (no session needed)', async () => {
    vi.mocked(verifyUploadToken).mockResolvedValueOnce({
      tokenId: '11111111-1111-1111-1111-111111111111',
      batchId: BATCH_ID,
      issuedBy: '33333333-3333-3333-3333-333333333333',
      expiresAt: new Date(Date.now() + 60_000)
    });

    const res = await request(app)
      .post(`/api/upload/media?batchId=${BATCH_ID}`)
      .set('Authorization', `Bearer ${RAW_TOKEN}`)
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(200);
    expect(res.body.fileId).toBeDefined();
    // The token-auth flow auto-registers the batch_media row server-side, so
    // the response includes the mediaId. The photographer client uses it to
    // render the preview (no tRPC session needed).
    expect(res.body.mediaId).toBe('media-row-id');
    expect(verifyUploadToken).toHaveBeenCalledWith(
      expect.anything(),
      RAW_TOKEN,
      BATCH_ID
    );
  });

  it('returns 401 when bearer token is expired', async () => {
    vi.mocked(verifyUploadToken).mockRejectedValueOnce(
      new Error('Upload token expired')
    );

    const res = await request(app)
      .post(`/api/upload/media?batchId=${BATCH_ID}`)
      .set('Authorization', `Bearer ${RAW_TOKEN}`)
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired|invalid|authentication/i);
  });

  it('returns 403 when bearer token is for a different batch', async () => {
    vi.mocked(verifyUploadToken).mockRejectedValueOnce(
      new Error('Upload token does not match this batch')
    );

    const res = await request(app)
      .post(`/api/upload/media?batchId=${OTHER_BATCH_ID}`)
      .set('Authorization', `Bearer ${RAW_TOKEN}`)
      .field('batchId', OTHER_BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/batch|forbidden/i);
  });

  it('returns 401 when bearer token is revoked', async () => {
    vi.mocked(verifyUploadToken).mockRejectedValueOnce(
      new Error('Upload token revoked')
    );

    const res = await request(app)
      .post(`/api/upload/media?batchId=${BATCH_ID}`)
      .set('Authorization', `Bearer ${RAW_TOKEN}`)
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/revoked|invalid|authentication/i);
  });

  it('returns 401 when bearer token is unknown', async () => {
    vi.mocked(verifyUploadToken).mockRejectedValueOnce(
      new Error('Invalid upload token')
    );

    const res = await request(app)
      .post(`/api/upload/media?batchId=${BATCH_ID}`)
      .set('Authorization', `Bearer ${RAW_TOKEN}`)
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(401);
  });

  it('preserves the existing session-auth path when a session user is present and no bearer is supplied', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce({
      id: 'op1',
      name: 'Op',
      email: 'op@example.com',
      role: 'operator',
      workLoop: null
    });

    const res = await request(app)
      .post('/api/upload/media')
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    expect(res.status).toBe(200);
    expect(verifyUploadToken).not.toHaveBeenCalled();
  });

  it('does not log the raw bearer token in any response body', async () => {
    vi.mocked(verifyUploadToken).mockRejectedValueOnce(
      new Error(`Invalid upload token ${RAW_TOKEN}`)
    );

    const res = await request(app)
      .post(`/api/upload/media?batchId=${BATCH_ID}`)
      .set('Authorization', `Bearer ${RAW_TOKEN}`)
      .field('batchId', BATCH_ID)
      .attach('file', JPEG_FIXTURE, 'photo.jpg');

    // Even if the upstream error included the raw token, the response must not echo it.
    expect(JSON.stringify(res.body)).not.toContain(RAW_TOKEN);
  });
});
