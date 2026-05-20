import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { SessionUser } from '../../shared/types';

/**
 * Tests for the atomic-idempotency-claim refactor (#12 slice 1) and the
 * Drizzle/Postgres SQL scrubbing in the tRPC envelope (#24).
 *
 * The previous design used an "existence probe → then insert" pattern that
 * was non-atomic: two concurrent calls with the same idempotencyKey both
 * passed the probe, both ran the command, both tried to insert the journal
 * row, and the second insert raised a Postgres unique-violation that bubbled
 * out through the tRPC error envelope with full SQL text — a free
 * schema-discovery primitive for any authenticated caller.
 *
 * After the refactor:
 *   - Exactly ONE INSERT ... ON CONFLICT DO NOTHING RETURNING row wins the
 *     claim. The losers SELECT and either replay the cached result (if the
 *     winner already finished) or get a clean error message.
 *   - On command failure, the existing in-flight row is UPDATEd to
 *     status='failed' — never re-INSERTed — so unique-violations cannot
 *     happen on the failure path either.
 *
 * These tests mock the entire `db` module with a stateful in-memory journal
 * "table". We don't need Postgres to verify the atomicity contract.
 */

// ---------------------------------------------------------------------------
// db mock — installed via vi.mock factory so vitest can hoist it. The factory
// keeps all stateful helpers internal and exposes them via getters on the
// module exports so tests can read/reset state.
// ---------------------------------------------------------------------------

vi.mock('../db', () => {
  interface JournalRow {
    id: string;
    commandName: string;
    idempotencyKey: string;
    actorId: string;
    actorName: string;
    actorRole: string;
    reason: string | null;
    inputPayload: Record<string, unknown>;
    status: string;
    affectedIds: string[];
    beforeSnapshot: Record<string, unknown>;
    afterSnapshot: Record<string, unknown>;
    result: Record<string, unknown>;
    error: string | null;
  }

  const journalByKey = new Map<string, JournalRow>();
  const journalById = new Map<string, JournalRow>();

  function makeInsertChain() {
    let pendingValue: JournalRow | null = null;
    let conflictHandled = false;
    const chain = {
      values: (value: JournalRow) => {
        pendingValue = value;
        return chain;
      },
      onConflictDoNothing: (_opts?: unknown) => {
        conflictHandled = true;
        return chain;
      },
      returning: async () => {
        if (!pendingValue) return [];
        if (!conflictHandled) {
          if (journalByKey.has(pendingValue.idempotencyKey)) {
            const err = new Error(
              'duplicate key value violates unique constraint "command_journal_idempotency_idx" — INSERT INTO command_journal (id, command_name, idempotency_key, ...) VALUES ($1, $2, $3, ...)'
            );
            (err as unknown as { code: string }).code = '23505';
            throw err;
          }
        } else if (journalByKey.has(pendingValue.idempotencyKey)) {
          return [];
        }
        journalByKey.set(pendingValue.idempotencyKey, pendingValue);
        journalById.set(pendingValue.id, pendingValue);
        return [pendingValue];
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (pendingValue && !(conflictHandled && journalByKey.has(pendingValue.idempotencyKey))) {
          journalByKey.set(pendingValue.idempotencyKey, pendingValue);
          journalById.set(pendingValue.id, pendingValue);
        }
        return resolve(undefined);
      }
    } as unknown as {
      values: (v: JournalRow) => typeof chain;
      onConflictDoNothing: (o?: unknown) => typeof chain;
      returning: () => Promise<JournalRow[]>;
    };
    return chain;
  }

  function makeSelectChain(rows: unknown[]) {
    const limit = () => Promise.resolve(rows);
    const where = () => Object.assign(Promise.resolve(rows), { limit });
    const from = () => Object.assign(Promise.resolve(rows), { where, limit });
    return { from };
  }

  function makeUpdateChain() {
    let setValues: Partial<JournalRow> = {};
    return {
      set: (values: Partial<JournalRow>) => {
        setValues = values;
        return {
          where: async () => {
            // Production code always updates the journal row by id == commandId,
            // which is the id stored on the most-recent pending row. We can't
            // inspect the opaque eq() expression, so we use this heuristic.
            const pendingRows = [...journalByKey.values()].filter((r) => r.status === 'pending');
            if (pendingRows.length === 1 && pendingRows[0]) {
              Object.assign(pendingRows[0], setValues);
            } else if (journalById.size === 1) {
              const onlyRow = [...journalById.values()][0]!;
              Object.assign(onlyRow, setValues);
            }
          }
        };
      }
    };
  }

  const dbExport = {
    insert: vi.fn(() => makeInsertChain()),
    select: vi.fn(() => makeSelectChain([...journalByKey.values()])),
    update: vi.fn(() => makeUpdateChain()),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(() => makeSelectChain([])),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ id: 'inner-id-1' }])),
            onConflictDoNothing: vi.fn(() => Promise.resolve())
          }))
        })),
        update: vi.fn(() => makeUpdateChain())
      };
      return cb(tx);
    })
  };

  return {
    db: dbExport,
    pool: { query: vi.fn() },
    // Expose store + helpers for tests
    __journalByKey: journalByKey,
    __journalById: journalById,
    __resetStore: () => {
      journalByKey.clear();
      journalById.clear();
    },
    __makeSelectChain: makeSelectChain
  };
});

vi.mock('./journal', () => ({
  appendJsonlJournal: vi.fn(async () => undefined),
  checkJournalWritable: vi.fn(async () => undefined)
}));

vi.mock('./mediaStorage', () => ({
  deleteMedia: vi.fn(async () => undefined)
}));

// Import AFTER mocks are installed.
import { executeCommand } from './commandBus';
import * as dbModule from '../db';
import { commandJournal } from '../schema';

// Cast the mocked module to expose the test-only helpers.
const mocked = dbModule as unknown as typeof dbModule & {
  __journalByKey: Map<string, {
    id: string;
    commandName: string;
    idempotencyKey: string;
    status: string;
    result: Record<string, unknown>;
  }>;
  __journalById: Map<string, unknown>;
  __resetStore: () => void;
  __makeSelectChain: (rows: unknown[]) => { from: () => unknown };
};

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeUser(): SessionUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Manager',
    email: 'm@x',
    role: 'manager',
    workLoop: null
  };
}

const io = {
  emit: vi.fn()
} as unknown as SocketServer;

const db = (dbModule as unknown as { db: { transaction: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } }).db;

beforeEach(() => {
  mocked.__resetStore();
  vi.clearAllMocks();
});

afterEach(() => {
  mocked.__resetStore();
});

// Helper to set up the transaction mock to simulate a successful inner command.
function stubSuccessfulInnerCommand() {
  db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      select: vi.fn(() => mocked.__makeSelectChain([
        { id: '11111111-1111-1111-1111-111111111111', name: 'Item', alias: 'old' }
      ])),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'x' }])),
          onConflictDoNothing: vi.fn(() => Promise.resolve())
        }))
      })),
      update: vi.fn(() => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            const pendingRows = [...mocked.__journalByKey.values()].filter((r) => r.status === 'pending');
            if (pendingRows[0]) Object.assign(pendingRows[0], values);
          }
        })
      }))
    };
    return cb(tx);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('atomic idempotency claim', () => {
  it('test 1: 5 parallel executeCommand calls with the same key produce exactly ONE journal row', async () => {
    const user = makeUser();
    const key = 'idem-parallel-1';
    const input = {
      name: 'setItemAlias' as const,
      idempotencyKey: key,
      payload: { itemId: '11111111-1111-1111-1111-111111111111', alias: 'new-alias' },
      reason: 'parallel race test'
    };

    stubSuccessfulInnerCommand();

    const calls = Array.from({ length: 5 }, () => {
      const p = executeCommand(input, user, io);
      p.catch(() => undefined);
      return p;
    });
    const settled = await Promise.allSettled(calls);

    // Exactly one row in the journal.
    expect(mocked.__journalByKey.size).toBe(1);
    const row = mocked.__journalByKey.get(key)!;
    expect(row).toBeDefined();
    expect(row.status).toBe('ok');
    expect(row.commandName).toBe('setItemAlias');

    // None of the calls should leak SQL.
    const sqlLeakRegex = /(insert\s+into|command_journal|idempotency_key|duplicate\s+key|unique\s+constraint|values\s*\()/i;
    let fulfilledCount = 0;
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        fulfilledCount += 1;
        const v = r.value as { ok: boolean; toast?: string };
        if (v.toast) expect(v.toast).not.toMatch(sqlLeakRegex);
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        expect(msg).not.toMatch(sqlLeakRegex);
      }
    }
    expect(fulfilledCount).toBeGreaterThanOrEqual(1);
  });

  it('test 2: concurrent losers do NOT receive a raw Postgres/Drizzle SQL message', async () => {
    const user = makeUser();
    const key = 'idem-parallel-2';
    const input = {
      name: 'setItemAlias' as const,
      idempotencyKey: key,
      payload: { itemId: '22222222-2222-2222-2222-222222222222', alias: 'alias-x' },
      reason: 'no-sql-leak test'
    };

    let releaseWinner: () => void = () => undefined;
    const winnerGate = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });

    db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      await winnerGate;
      const tx = {
        select: vi.fn(() => mocked.__makeSelectChain([
          { id: '22222222-2222-2222-2222-222222222222', name: 'Item', alias: 'old' }
        ])),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ id: 'x' }])),
            onConflictDoNothing: vi.fn(() => Promise.resolve())
          }))
        })),
        update: vi.fn(() => ({
          set: (values: Record<string, unknown>) => ({
            where: async () => {
              const pendingRows = [...mocked.__journalByKey.values()].filter((r) => r.status === 'pending');
              if (pendingRows[0]) Object.assign(pendingRows[0], values);
            }
          })
        }))
      };
      return cb(tx);
    });

    // Attach .catch() immediately so rejections never appear "unhandled" in
    // the brief window before Promise.allSettled awaits them.
    const calls = Array.from({ length: 5 }, () => {
      const p = executeCommand(input, user, io);
      p.catch(() => undefined);
      return p;
    });

    // Allow microtasks to flush so all 5 claims race the unique index first.
    await new Promise((r) => setImmediate(r));
    releaseWinner();

    const settled = await Promise.allSettled(calls);

    const sqlLeakRegex = /(insert\s+into|command_journal|idempotency_key|duplicate\s+key|unique\s+constraint|values\s*\(|\$\d+)/i;
    for (const r of settled) {
      if (r.status === 'rejected') {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        expect(msg).not.toMatch(sqlLeakRegex);
      } else {
        const v = r.value as { ok: boolean; toast?: string };
        if (!v.ok && v.toast) expect(v.toast).not.toMatch(sqlLeakRegex);
      }
    }

    expect(mocked.__journalByKey.size).toBe(1);
  });

  it('test 3: replay (same key, second call) returns the original result', async () => {
    const user = makeUser();
    const key = 'idem-replay-3';
    const input = {
      name: 'setItemAlias' as const,
      idempotencyKey: key,
      payload: { itemId: '33333333-3333-3333-3333-333333333333', alias: 'replay-alias' },
      reason: 'replay test'
    };

    stubSuccessfulInnerCommand();

    const first = await executeCommand(input, user, io);
    expect(first.ok).toBe(true);

    const row = mocked.__journalByKey.get(key)!;
    expect(row.status).toBe('ok');

    const txCallCountBefore = db.transaction.mock.calls.length;
    const second = await executeCommand(input, user, io);
    const txCallCountAfter = db.transaction.mock.calls.length;

    // Replay must NOT spawn a second transaction.
    expect(txCallCountAfter).toBe(txCallCountBefore);
    expect(second.ok).toBe(true);
    expect(second.commandId).toBe(first.commandId);
    expect(mocked.__journalByKey.size).toBe(1);
  });

  it('test 4: same key with different command or payload returns 409 with a safe message', async () => {
    const user = makeUser();
    const key = 'idem-bound-4';

    stubSuccessfulInnerCommand();

    const first = await executeCommand(
      {
        name: 'setItemAlias' as const,
        idempotencyKey: key,
        payload: { itemId: '44444444-4444-4444-4444-444444444444', alias: 'first' },
        reason: 'bound test 1'
      },
      user,
      io
    );
    expect(first.ok).toBe(true);

    // Same key, DIFFERENT payload.
    await expect(
      executeCommand(
        {
          name: 'setItemAlias' as const,
          idempotencyKey: key,
          payload: { itemId: '44444444-4444-4444-4444-444444444444', alias: 'second' },
          reason: 'bound test 2'
        },
        user,
        io
      )
    ).rejects.toThrow(/Idempotency key reused with different command or payload/);

    // Same key, DIFFERENT command name.
    await expect(
      executeCommand(
        {
          name: 'deleteBatch' as const,
          idempotencyKey: key,
          payload: { id: '44444444-4444-4444-4444-444444444444' },
          reason: 'bound test 3'
        },
        user,
        io
      )
    ).rejects.toThrow(/Idempotency key reused with different command or payload/);

    // None of the thrown messages must leak SQL.
    const sqlLeakRegex = /(insert\s+into|command_journal|duplicate\s+key|unique\s+constraint)/i;
    const probe = executeCommand(
      {
        name: 'setItemAlias' as const,
        idempotencyKey: key,
        payload: { itemId: '44444444-4444-4444-4444-444444444444', alias: 'fourth' },
        reason: 'bound test 4'
      },
      user,
      io
    );
    await expect(probe).rejects.toSatisfy((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      return !sqlLeakRegex.test(msg);
    });
  });

  it('test 5: catch-path scrubs Postgres errors thrown inside the command before returning failed.toast', async () => {
    // Adversarial QA on PR #92 found that the catch path was returning the
    // raw error.message via CommandResult.toast, bypassing the tRPC
    // errorFormatter. Any pg error thrown from an inner tx (FK violation,
    // unique violation, CHECK violation) would still leak SQL to the client.
    // This test simulates a Drizzle/pg error inside the transaction callback
    // and asserts the returned toast is the opaque "Database error" string
    // and not the raw SQL.
    const user = makeUser();
    const sqlError: Error & { code?: string; severity?: string } = new Error(
      'duplicate key value violates unique constraint "batches_alias_idx"\nDETAIL: Key (alias)=(foo) already exists.\ninsert into "batches" ("id", "alias") values ($1, $2) returning *'
    );
    sqlError.code = '23505';
    sqlError.severity = 'ERROR';

    db.transaction.mockImplementation(async (_cb: unknown) => {
      throw sqlError;
    });

    const result = await executeCommand(
      {
        name: 'createBatch' as const,
        idempotencyKey: 'idem-scrub-5',
        payload: {
          name: 'X',
          itemId: '55555555-5555-5555-5555-555555555555',
          vendorId: '66666666-6666-6666-6666-666666666666',
          qty: 1,
          unitCost: 1
        },
        reason: 'scrub test'
      },
      user,
      io
    );

    expect(result.ok).toBe(false);
    expect(result.toast).toMatch(/^Database error \(request id:/);
    expect(result.toast).not.toMatch(/insert\s+into|batches_alias_idx|duplicate\s+key|unique\s+constraint/i);
  });
});

describe('journal finalization transaction boundary (#12 slice 2)', () => {
  it('test 1: success path finalizes the command journal row via the transaction object, not top-level db.update', async () => {
    const user = makeUser();
    const key = 'idem-tx-boundary-1';
    const input = {
      name: 'setItemAlias' as const,
      idempotencyKey: key,
      payload: { itemId: '11111111-1111-1111-1111-111111111111', alias: 'new-alias' },
      reason: 'tx boundary test 1'
    };

    let capturedTx: { update: ReturnType<typeof vi.fn> } | undefined;

    db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(() => mocked.__makeSelectChain([
          { id: '11111111-1111-1111-1111-111111111111', name: 'Item', alias: 'old' }
        ])),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ id: 'x' }])),
            onConflictDoNothing: vi.fn(() => Promise.resolve())
          }))
        })),
        update: vi.fn((table: unknown) => ({
          set: (values: Record<string, unknown>) => ({
            where: async () => {
              const pendingRows = [...mocked.__journalByKey.values()].filter((r) => r.status === 'pending');
              if (pendingRows[0]) Object.assign(pendingRows[0], values);
            }
          })
        }))
      };
      capturedTx = tx as { update: ReturnType<typeof vi.fn> };
      return cb(tx);
    });

    const result = await executeCommand(input, user, io);

    expect(result.ok).toBe(true);
    const row = mocked.__journalByKey.get(key)!;
    expect(row).toBeDefined();
    expect(row.status).toBe('ok');

    expect(capturedTx).toBeDefined();
    const updateCalls = capturedTx!.update.mock.calls as unknown[][];
    expect(updateCalls.some((call) => call[0] === commandJournal)).toBe(true);

    // Top-level db.update must NOT be called on the success path.
    expect(db.update).not.toHaveBeenCalled();
  });

  it('test 2: an exception during journal finalization produces a failed row via the catch path', async () => {
    const user = makeUser();
    const key = 'idem-tx-boundary-2';
    const input = {
      name: 'setItemAlias' as const,
      idempotencyKey: key,
      payload: { itemId: '22222222-2222-2222-2222-222222222222', alias: 'alias-y' },
      reason: 'tx boundary test 2'
    };

    const pgError: Error & { code?: string } = new Error(
      'duplicate key value violates unique constraint "items_alias_idx"\nDETAIL: Key (alias)=(foo) already exists.'
    );
    pgError.code = '23505';

    db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(() => mocked.__makeSelectChain([
          { id: '22222222-2222-2222-2222-222222222222', name: 'Item', alias: 'old' }
        ])),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ id: 'x' }])),
            onConflictDoNothing: vi.fn(() => Promise.resolve())
          }))
        })),
        update: vi.fn((table: unknown) => ({
          set: (_values: Record<string, unknown>) => ({
            where: async () => {
              if (table === commandJournal) {
                throw pgError;
              }
              const pendingRows = [...mocked.__journalByKey.values()].filter((r) => r.status === 'pending');
              if (pendingRows[0]) Object.assign(pendingRows[0], _values);
            }
          })
        }))
      };
      return cb(tx);
    });

    const result = await executeCommand(input, user, io);

    expect(result.ok).toBe(false);
    expect(result.toast).toMatch(/^Database error \(request id:/);

    const row = mocked.__journalByKey.get(key)!;
    expect(row).toBeDefined();
    expect(row.status).toBe('failed');

    // Top-level db.update must be called in the catch path.
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});
