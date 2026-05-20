import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

/**
 * TEST-05 / TEST-A3 (#20 slice 4): Anonymous socket.io regression test.
 *
 * The auth surface contract is: an anonymous socket.io client (no session
 * cookie, no token) MUST NOT successfully establish an authenticated
 * connection. The server-side gate lives in `src/server/sockets.ts` as an
 * `io.use(...)` middleware that calls the session middleware then checks
 * `getSessionUser(req)`; if no user, it returns `next(new Error(...))`,
 * which causes the client to emit `connect_error` and never receive a
 * `connect` event.
 *
 * The original audit (ARCH-05) flagged that anonymous connections were not
 * rejected. The fix landed in src/server/sockets.ts; this test is the
 * regression artefact: it FAILS if the gate is removed or weakened.
 *
 * Auth + DB are mocked so we can deterministically simulate "no session"
 * without a Postgres pool. We spin up a real HTTP server + socket.io server
 * on an ephemeral port and connect a real socket.io-client to it.
 */

// ---------------------------------------------------------------------------
// Auth mock: bypass real PG session middleware and force getSessionUser to
// return null so the io.use(...) gate fires for the anonymous probe.
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

import { createSocketServer } from '../server/sockets';
import { getSessionUser } from '../server/auth';

let httpServer: http.Server;
let port: number;
let clients: ClientSocket[] = [];

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(getSessionUser).mockResolvedValue(null);

  httpServer = http.createServer();
  createSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = httpServer.address() as AddressInfo;
  port = addr.port;
});

afterEach(async () => {
  for (const c of clients) {
    c.removeAllListeners();
    c.disconnect();
  }
  clients = [];

  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
});

describe('socket.io anonymous connection', () => {
  it('rejects an anonymous client with connect_error and never emits connect', async () => {
    const client = ioClient(`http://127.0.0.1:${port}`, {
      // Explicitly do NOT send any cookie or auth token.
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      timeout: 2000
    });
    clients.push(client);

    type Outcome =
      | { kind: 'connect' }
      | { kind: 'connect_error'; message: string }
      | { kind: 'timeout' };

    const outcome = await new Promise<Outcome>((resolve) => {
      const timer = setTimeout(() => resolve({ kind: 'timeout' }), 1500);
      client.on('connect', () => {
        clearTimeout(timer);
        resolve({ kind: 'connect' });
      });
      client.on('connect_error', (err) => {
        clearTimeout(timer);
        resolve({ kind: 'connect_error', message: err?.message ?? '' });
      });
    });

    // Hard contract: an anonymous client MUST NOT succeed.
    // If outcome.kind === 'connect', the auth gate is broken and the bug is
    // open. This is the regression we want to scream about.
    expect(outcome.kind, `socket.io should reject anonymous clients; got ${JSON.stringify(outcome)}`).not.toBe('connect');

    // Acceptable: connect_error (preferred — the server.use gate rejected).
    // Also acceptable: timeout (the server silently drops the handshake).
    // Either signals "anonymous clients cannot transact". connect_error is
    // strictly preferred so we assert it as the documented behaviour.
    expect(outcome.kind).toBe('connect_error');
    if (outcome.kind === 'connect_error') {
      // Server should propagate an explicit auth error message.
      expect(outcome.message.toLowerCase()).toMatch(/auth|unauthorized|sign\s*in/);
    }
  });

  it('invokes getSessionUser during the anonymous handshake (gate is wired)', async () => {
    // Regression for "gate was removed": if the io.use middleware is ever
    // deleted, getSessionUser will not be called during the handshake and
    // anonymous clients will sail through.
    const client = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      timeout: 2000
    });
    clients.push(client);

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 1500);
      client.on('connect_error', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    expect(vi.mocked(getSessionUser)).toHaveBeenCalled();
  });
});
