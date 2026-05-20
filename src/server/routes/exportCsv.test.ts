import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Auth mock: bypass real PG session middleware + control getSessionUser.
// ---------------------------------------------------------------------------
vi.mock('../auth', () => ({
  sessionMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  getSessionUser: vi.fn()
}));

// ---------------------------------------------------------------------------
// DB mock: provide a controllable `pool.query` and silence pingDatabase so the
// app boots without a real Postgres. Hoisted because `vi.mock` runs before
// module imports.
// ---------------------------------------------------------------------------
const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock('../db', () => ({
  pool: { query: poolQuery },
  db: {},
  pingDatabase: vi.fn().mockResolvedValue(undefined)
}));

import request from 'supertest';
import { createApp } from '../app';
import { getSessionUser } from '../auth';

/**
 * Issue #35 — FE-M1: GET /api/export/:view.csv used to return JSON
 * (`{result:{data:{json:{filename, csv}}}}`) via the tRPC envelope, so
 * pasting the URL into a browser dumped JSON instead of triggering a CSV
 * download. The new HTTP handler returns the raw CSV with `Content-Type:
 * text/csv` and `Content-Disposition: attachment; filename="..."`.
 */

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  vi.clearAllMocks();
  const fakeIo: unknown = { on: vi.fn(), emit: vi.fn() };
  app = createApp(() => fakeIo as never);
  vi.mocked(getSessionUser).mockResolvedValue({
    id: 'op1',
    name: 'Op',
    email: 'op@example.com',
    role: 'operator'
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/export/:view.csv — FE-M1', () => {
  it('returns text/csv (not JSON) when the operator is authenticated', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'abc',
          label: 'Inventory value',
          value: '0',
          definition: '',
          severity: 'neutral',
          createdAt: '2025-01-01'
        }
      ]
    });

    const res = await request(app).get('/api/export/reports.csv');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv\b/);
  });

  it('sets a Content-Disposition attachment header with a dated filename', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/export/reports.csv');

    expect(res.status).toBe(200);
    const disposition = res.headers['content-disposition'];
    expect(disposition).toBeDefined();
    expect(disposition).toMatch(/^attachment;\s*filename="terp-reports-\d{4}-\d{2}-\d{2}\.csv"$/);
  });

  it('returns the raw CSV body (no JSON envelope)', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'abc',
          label: 'Inventory value',
          value: '123',
          definition: 'def',
          severity: 'neutral',
          createdAt: '2025-01-01'
        }
      ]
    });

    const res = await request(app).get('/api/export/reports.csv');

    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/^\s*[{[]/); // not JSON
    // Header row first, then the data row.
    const lines = res.text.split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('label');
    expect(lines[1]).toContain('abc');
    expect(lines[1]).toContain('Inventory value');
  });

  it('returns 401 when the caller is not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce(null);

    const res = await request(app).get('/api/export/reports.csv');

    expect(res.status).toBe(401);
  });

  it('returns 403 for a viewer (operator role required)', async () => {
    vi.mocked(getSessionUser).mockResolvedValueOnce({
      id: 'v1',
      name: 'Viewer',
      email: 'v@x',
      role: 'viewer'
    });

    const res = await request(app).get('/api/export/reports.csv');

    expect(res.status).toBe(403);
  });

  it('rejects an unknown view with 400', async () => {
    const res = await request(app).get('/api/export/not-a-view.csv');

    expect(res.status).toBe(400);
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
