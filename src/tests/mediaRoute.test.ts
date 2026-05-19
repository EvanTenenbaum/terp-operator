import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Auth mock: bypass real PG session middleware + control getSessionUser
// ---------------------------------------------------------------------------
vi.mock('../server/auth', () => ({
  sessionMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  getSessionUser: vi.fn()
}));

// ---------------------------------------------------------------------------
// DB mock: prevent real PG pool from being created when auth/db is imported
// ---------------------------------------------------------------------------
vi.mock('../server/db', () => ({
  db: {},
  pool: { query: vi.fn() },
  pingDatabase: vi.fn().mockResolvedValue(undefined)
}));

import request from 'supertest';
import { createApp } from '../server/app';
import { pool } from '../server/db';
import { getSessionUser } from '../server/auth';

const MEDIA_ID = '11111111-1111-1111-1111-111111111111';

// Minimal JPEG bytes (FF D8 ... FF D9)
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
  0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9
]);

// 32-byte fake video buffer (used for range testing)
const VIDEO_BYTES = Buffer.from(
  '0123456789ABCDEFGHIJKLMNOPQRSTUV',
  'utf-8'
);

let tmpRoot: string;
let originalEnablePhotography: string | undefined;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mediaRoute-'));
  originalEnablePhotography = process.env.ENABLE_PHOTOGRAPHY;

  const fakeIo = { on: vi.fn(), emit: vi.fn() } as unknown as Parameters<
    typeof createApp
  >[0] extends () => infer R
    ? R
    : never;
  app = createApp(() => fakeIo);

  // Default to operator user — individual tests override as needed
  vi.mocked(getSessionUser).mockResolvedValue({
    id: 'op1',
    name: 'Op',
    email: 'op@example.com',
    role: 'operator'
  });
});

afterEach(async () => {
  if (originalEnablePhotography === undefined) {
    delete process.env.ENABLE_PHOTOGRAPHY;
  } else {
    process.env.ENABLE_PHOTOGRAPHY = originalEnablePhotography;
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

describe('GET /api/media/:id', () => {
  it('returns 401 when there is no session user', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(null);

    const res = await request(app).get(`/api/media/${MEDIA_ID}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
  });

  it('returns 403 when the user is below operator role (viewer)', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce({
      id: 'v1',
      name: 'Viewer',
      email: 'v@example.com',
      role: 'viewer'
    });

    const res = await request(app).get(`/api/media/${MEDIA_ID}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Operator access required' });
  });

  it('returns 404 when media row is not found in DB', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [],
      rowCount: 0
    } as never);

    const res = await request(app).get(`/api/media/${MEDIA_ID}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Media not found' });
  });

  it('returns 404 when row exists but file is missing on disk', async () => {
    const phantomPath = path.join(tmpRoot, 'does-not-exist.jpg');
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: MEDIA_ID,
          file_path: phantomPath,
          thumbnail_path: null,
          mime_type: 'image/jpeg'
        }
      ],
      rowCount: 1
    } as never);

    const res = await request(app).get(`/api/media/${MEDIA_ID}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'File not found on disk' });
  });

  it('returns 200 with image headers (Content-Type, inline, nosniff) for a JPEG', async () => {
    const filePath = path.join(tmpRoot, 'photo.jpg');
    await fsp.writeFile(filePath, JPEG_BYTES);
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: MEDIA_ID,
          file_path: filePath,
          thumbnail_path: null,
          mime_type: 'image/jpeg'
        }
      ],
      rowCount: 1
    } as never);

    const res = await request(app).get(`/api/media/${MEDIA_ID}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/jpeg/);
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns 200 with Content-Disposition: attachment for a video', async () => {
    const filePath = path.join(tmpRoot, 'clip.mp4');
    await fsp.writeFile(filePath, VIDEO_BYTES);
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: MEDIA_ID,
          file_path: filePath,
          thumbnail_path: null,
          mime_type: 'video/mp4'
        }
      ],
      rowCount: 1
    } as never);

    const res = await request(app).get(`/api/media/${MEDIA_ID}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^video\/mp4/);
    expect(res.headers['content-disposition']).toBe('attachment');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-length']).toBe(String(VIDEO_BYTES.length));
  });

  it('returns 503 when ENABLE_PHOTOGRAPHY=false', async () => {
    process.env.ENABLE_PHOTOGRAPHY = 'false';

    const res = await request(app).get(`/api/media/${MEDIA_ID}`);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Photography feature is disabled' });
  });

  it('returns 206 Partial Content for video with Range: bytes=0-9', async () => {
    const filePath = path.join(tmpRoot, 'clip.mp4');
    await fsp.writeFile(filePath, VIDEO_BYTES);
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [
        {
          id: MEDIA_ID,
          file_path: filePath,
          thumbnail_path: null,
          mime_type: 'video/mp4'
        }
      ],
      rowCount: 1
    } as never);

    const res = await request(app)
      .get(`/api/media/${MEDIA_ID}`)
      .set('Range', 'bytes=0-9');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(
      `bytes 0-9/${VIDEO_BYTES.length}`
    );
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-length']).toBe('10');
    expect(res.body.length).toBe(10);
    expect(res.body.toString('utf-8')).toBe('0123456789');
  });
});

describe('GET /api/media/:id/thumb', () => {
  it('returns 404 when thumbnail_path is null', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ thumbnail_path: null }],
      rowCount: 1
    } as never);

    const res = await request(app).get(`/api/media/${MEDIA_ID}/thumb`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Thumbnail not found' });
  });

  it('returns 200 when thumbnail_path is valid and file exists', async () => {
    const thumbPath = path.join(tmpRoot, 'thumb.jpg');
    await fsp.writeFile(thumbPath, JPEG_BYTES);
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ thumbnail_path: thumbPath }],
      rowCount: 1
    } as never);

    const res = await request(app).get(`/api/media/${MEDIA_ID}/thumb`);

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
