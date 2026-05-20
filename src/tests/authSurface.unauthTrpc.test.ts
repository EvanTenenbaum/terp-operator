import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TEST-05 / TEST-A3 (#20 slice 4): Unauthenticated `/trpc/commands.run`
 * regression test.
 *
 * The auth surface contract is: any request to the protected tRPC mutation
 * `commands.run` MUST be rejected with HTTP 401 when no session user is
 * present. Additionally:
 *   1. The rejection envelope MUST NOT leak SQL fragments in the visible
 *      `message` (regression for #24 / DYN-H1 — error envelope scrubbing).
 *   2. The rejection envelope MUST NOT leak stack traces when running in
 *      production (regression for #92 — production stack-trace suppression).
 *      tRPC v10's default formatter captures `isDev` at `initTRPC.create()`
 *      time, so this test uses `vi.resetModules` + an isolated import to
 *      exercise the production code path.
 *
 * Uses supertest against the real express app (constructed via `createApp`)
 * so the full middleware chain (session -> tRPC -> protected procedure) is
 * exercised. Auth + DB are mocked so we can deterministically simulate the
 * "no session" condition without a real Postgres pool.
 */

// ---------------------------------------------------------------------------
// Auth mock: bypass real PG session middleware and force getSessionUser to
// return null so the protectedProcedure guard fires.
// ---------------------------------------------------------------------------
vi.mock('../server/auth', () => ({
  sessionMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  getSessionUser: vi.fn().mockResolvedValue(null)
}));

// ---------------------------------------------------------------------------
// DB mock: prevent real PG pool from being created when auth/db is imported.
// ---------------------------------------------------------------------------
vi.mock('../server/db', () => ({
  db: {},
  pool: { query: vi.fn() },
  pingDatabase: vi.fn().mockResolvedValue(undefined)
}));

import request from 'supertest';
import { createApp } from '../server/app';
import { getSessionUser } from '../server/auth';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue(null);

  const fakeIo = { on: vi.fn(), emit: vi.fn() } as unknown as Parameters<
    typeof createApp
  >[0] extends () => infer R
    ? R
    : never;
  app = createApp(() => fakeIo);
});

describe('POST /trpc/commands.run (unauthenticated)', () => {
  it('rejects a valid command payload with 401 when no session user is present', async () => {
    // tRPC v10 mutation HTTP shape: POST /trpc/<procedure> with JSON body
    // wrapped in a `json` field when using superjson transformer.
    const res = await request(app)
      .post('/trpc/commands.run')
      .set('content-type', 'application/json')
      .send({
        json: {
          name: 'createBatch',
          idempotencyKey: 'idem-test-unauth-12345678',
          reason: 'unauth-surface regression probe',
          payload: {}
        }
      });

    expect(res.status).toBe(401);
  });

  it('returns a tRPC envelope tagged UNAUTHORIZED, not an opaque 500', async () => {
    const res = await request(app)
      .post('/trpc/commands.run')
      .set('content-type', 'application/json')
      .send({
        json: {
          name: 'createBatch',
          idempotencyKey: 'idem-test-unauth-12345678',
          reason: 'envelope-shape probe',
          payload: {}
        }
      });

    expect(res.status).toBe(401);
    // tRPC v10 envelope shape: { error: { json: { code, data: { code, httpStatus, ... } } } }
    expect(res.body?.error?.json?.data?.code).toBe('UNAUTHORIZED');
    expect(res.body?.error?.json?.data?.httpStatus).toBe(401);
  });

  it('does not leak SQL fragments or DB error markers in the error envelope message', async () => {
    const res = await request(app)
      .post('/trpc/commands.run')
      .set('content-type', 'application/json')
      .send({
        json: {
          name: 'createBatch',
          idempotencyKey: 'idem-test-unauth-12345678',
          reason: 'sql-leak probe',
          payload: {}
        }
      });

    const body = JSON.stringify(res.body ?? {});
    // No SQL keywords should leak through the envelope at all (matches the
    // scrubber's SQL_LEAK_REGEX in src/server/trpc.ts).
    expect(body).not.toMatch(/insert\s+into/i);
    expect(body).not.toMatch(/select\s+.+\s+from/i);
    expect(body).not.toMatch(/update\s+.+\s+set/i);
    expect(body).not.toMatch(/delete\s+from/i);
    expect(body).not.toMatch(/duplicate\s+key/i);
    expect(body).not.toMatch(/unique\s+constraint/i);
    expect(body).not.toMatch(/relation\s+"/i);
    expect(body).not.toMatch(/on\s+conflict/i);
    // No Postgres-style 5-char SQLSTATE codes in the JSON envelope's `code`
    // field (e.g. 23505, 42P01). The JSON-RPC code `-32001` is intentionally
    // excluded because it lives as a negative integer, not a quoted string.
    expect(body).not.toMatch(/"code":"[0-9][0-9A-Z]{4}"/);
  });

  it('does not leak stack traces in the error envelope when NODE_ENV=production', async () => {
    // tRPC v10 captures `isDev` at `initTRPC.create()` time, so to test the
    // production code path we have to load everything fresh inside an
    // isolated module context with NODE_ENV preset.
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSessionSecret = process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'production';
    // env.ts refuses to load in prod without a non-default SESSION_SECRET.
    process.env.SESSION_SECRET = 'unit-test-prod-secret-not-real-12345';
    try {
      await vi.resetModules();
      vi.doMock('../server/auth', () => ({
        sessionMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
        getSessionUser: vi.fn().mockResolvedValue(null)
      }));
      vi.doMock('../server/db', () => ({
        db: {},
        pool: { query: vi.fn() },
        pingDatabase: vi.fn().mockResolvedValue(undefined)
      }));

      const { createApp: prodCreateApp } = await import('../server/app');
      const fakeIo = { on: vi.fn(), emit: vi.fn() } as unknown as Parameters<
        typeof prodCreateApp
      >[0] extends () => infer R
        ? R
        : never;
      const prodApp = prodCreateApp(() => fakeIo);

      const res = await request(prodApp)
        .post('/trpc/commands.run')
        .set('content-type', 'application/json')
        .send({
          json: {
            name: 'createBatch',
            idempotencyKey: 'idem-test-unauth-12345678',
            reason: 'stack-leak probe',
            payload: {}
          }
        });

      expect(res.status).toBe(401);
      // tRPC's default errorFormatter only includes `stack` when NODE_ENV !==
      // 'production'. In prod, the envelope must NOT carry a stack field.
      expect(res.body?.error?.json?.data?.stack).toBeUndefined();
      const body = JSON.stringify(res.body ?? {});
      // Filename:line:column patterns are stack artefacts.
      expect(body).not.toMatch(/\.(ts|js):\d+:\d+/);
      // Node internal frames are stack artefacts.
      expect(body).not.toMatch(/node:internal\//);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalSessionSecret === undefined) {
        delete process.env.SESSION_SECRET;
      } else {
        process.env.SESSION_SECRET = originalSessionSecret;
      }
      vi.doUnmock('../server/auth');
      vi.doUnmock('../server/db');
      await vi.resetModules();
    }
  });

  it('returns 401 even when the body is missing/empty', async () => {
    const res = await request(app)
      .post('/trpc/commands.run')
      .set('content-type', 'application/json')
      .send({});

    // The protected procedure guard runs before input parsing succeeds,
    // so an empty body still results in UNAUTHORIZED (401) rather than
    // BAD_REQUEST (400). Either way, an unauthenticated caller must not
    // receive 2xx.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(200);
    // 401 is the documented contract; 400 would indicate the auth gate is
    // running *after* input validation, which is a regression.
    expect(res.status).toBe(401);
  });
});
