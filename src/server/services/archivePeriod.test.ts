import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { SessionUser } from '../../shared/types';

/**
 * Tests for #19 slice 3 / EDGE-04 — `archivePeriod` must NOT perform file
 * writes (CSV, JSONL, PDF) inside the surrounding `db.transaction()` block.
 *
 * Failure mode the refactor closes:
 *   - File-write that hangs or fails keeps the wrapping transaction open,
 *     holding row locks on `archive_runs`, `batches`, and `sales_orders`.
 *   - A successful tx commit followed by a failed file write leaves the
 *     DB inconsistent with disk: the journal says "archived" but the
 *     operator has no CSV/JSONL/PDF artifacts.
 *
 * Contract under test (two-phase archivePeriod):
 *   1. Inside the inner DB transaction: insert an `archive_runs` row with
 *      status='in_progress', update `batches.archived_at` and
 *      `sales_orders.archived_at`, and capture the rows the file writers
 *      will need (batches snapshot, journal rows, control totals). NO file
 *      writes happen here. After this commits, no row locks remain.
 *   2. After the inner tx commits: generate the CSV, JSONL, and PDF. On
 *      success, UPDATE the existing `archive_runs` row to status='archived'
 *      with the resolved csvPath/jsonlPath/pdfPath. On failure, UPDATE the
 *      row to status='failed_file_write' with the captured error message
 *      so the partial state is identifiable for retry; the underlying
 *      error then rethrows up to the executeCommand catch path.
 *
 * Mocks: same mocked-pool pattern as commandBus.idempotency.test.ts. We
 * don't need real Postgres or real fs to verify the ordering contract.
 */

// ---------------------------------------------------------------------------
// fs mock — track every file-write call site so we can assert "zero fs calls
// before the inner tx commits" and "non-zero fs calls after".
// ---------------------------------------------------------------------------

interface FsCall {
  kind: 'writeFile' | 'mkdir' | 'createWriteStream';
  path: string;
  at: number;
}
const fsCalls: FsCall[] = [];
let nextSeq = 1;
function recordFsCall(kind: FsCall['kind'], path: string): number {
  const at = nextSeq++;
  fsCalls.push({ kind, path, at });
  return at;
}

// Toggleable failure injection for the PDF write stream.
let pdfWriteShouldFail = false;

vi.mock('node:fs', () => {
  return {
    promises: {
      mkdir: vi.fn(async (p: string) => {
        recordFsCall('mkdir', p);
      }),
      writeFile: vi.fn(async (p: string) => {
        recordFsCall('writeFile', p);
      })
    },
    createWriteStream: vi.fn((p: string) => {
      recordFsCall('createWriteStream', p);
      // Minimal duck-typed Writable that pdfkit can pipe into.
      type Listener = (...args: unknown[]) => void;
      const listeners: Record<string, Listener[]> = { finish: [], error: [] };
      return {
        on(event: string, cb: Listener) {
          (listeners[event] ||= []).push(cb);
          return this;
        },
        write() {
          return true;
        },
        end() {
          // Fire async so listeners are attached first.
          setImmediate(() => {
            const target = pdfWriteShouldFail ? 'error' : 'finish';
            for (const cb of listeners[target] ?? []) cb(new Error('synthetic pdf write failure'));
          });
        },
        // Required pipe-target API surface for pdfkit:
        once() {
          return this;
        },
        emit() {
          return true;
        },
        removeListener() {
          return this;
        }
      };
    })
  };
});

// pdfkit pulls fs via node:fs above + createWriteStream. We additionally
// stub PDFDocument so we don't depend on the real PDF generator.
vi.mock('pdfkit', () => {
  class FakePdfDocument {
    private piped: { end: () => void } | undefined;
    constructor(_opts?: unknown) {
      /* no-op */
    }
    pipe(stream: { end: () => void }) {
      this.piped = stream;
      return stream;
    }
    fontSize() {
      return this;
    }
    text() {
      return this;
    }
    moveDown() {
      return this;
    }
    end() {
      // pdfkit's real .end() flushes the doc and eventually causes the
      // piped Writable to emit 'finish'. We simulate that by forwarding
      // end() to the piped stream — our test's createWriteStream stub
      // fires 'finish' (or 'error') from its own end() implementation.
      this.piped?.end();
    }
  }
  return { default: FakePdfDocument };
});

// ---------------------------------------------------------------------------
// Auxiliary mocks: appendJsonlJournal (audit), rbac.assertCommandAccess,
// closeout safety check, and journal append.
// ---------------------------------------------------------------------------

vi.mock('./journal', () => ({
  appendJsonlJournal: vi.fn(async () => undefined),
  checkJournalWritable: vi.fn(async () => undefined)
}));

vi.mock('./mediaStorage', () => ({
  deleteMedia: vi.fn(async () => undefined)
}));

vi.mock('../rbac', () => ({
  assertCommandAccess: vi.fn(() => undefined)
}));

vi.mock('./closeout', () => ({
  getCloseoutSafety: vi.fn(async () => ({
    period: '2026-04',
    locked: true,
    eligible: true,
    openWorkCount: 0,
    blockers: [],
    controlTotals: { batches: 3, journals: 7 }
  }))
}));

// ---------------------------------------------------------------------------
// db mock — track inner-transaction lifecycle, archive_runs inserts/updates,
// and file-write call timing relative to tx commit.
// ---------------------------------------------------------------------------

interface DbEvent {
  kind:
    | 'tx-begin'
    | 'tx-commit'
    | 'archive-insert'
    | 'archive-update'
    | 'batches-update'
    | 'salesOrders-update';
  at: number;
  payload?: Record<string, unknown>;
}

const dbEvents: DbEvent[] = [];
function recordDbEvent(kind: DbEvent['kind'], payload?: Record<string, unknown>) {
  dbEvents.push({ kind, at: nextSeq++, payload });
}

// A single in-memory archive_runs row identifies the round-trip.
const archiveRows = new Map<string, Record<string, unknown>>();

vi.mock('../db', () => {
  // Tx mock used by db.transaction() callbacks AND used as the surrounding
  // commandBus wrapper's tx. Each tx is independent.
  function makeTx() {
    return {
      execute: vi.fn(async () => undefined), // pg_advisory_xact_lock
      select: vi.fn(() => {
        // Empty-result chain supporting .from().where().limit() and
        // .from().where().orderBy() — drizzle's two query terminators
        // that archivePeriod uses.
        const rows: unknown[] = [];
        const whereChain = Object.assign(Promise.resolve(rows), {
          limit: async () => rows,
          orderBy: async () => rows
        });
        return {
          from: () => ({
            where: () => whereChain
          })
        };
      }),
      insert: vi.fn((table: { _tableName?: string } | unknown) => {
        const tableName = (table as { _tableName?: string })?._tableName ?? 'archive_runs';
        return {
          values: (values: Record<string, unknown>) => ({
            returning: async () => {
              const id = `arc-${archiveRows.size + 1}`;
              const row = { id, ...values };
              archiveRows.set(id, row);
              recordDbEvent('archive-insert', { id, status: values.status, table: tableName });
              return [row];
            },
            onConflictDoNothing: () => ({ returning: async () => [] })
          })
        };
      }),
      update: vi.fn((table: { _tableName?: string } | unknown) => {
        // Drizzle's pgTable wraps table objects; we identify by lookup against
        // the imported schema below — but for the purposes of this test the
        // commandBus only does three `tx.update(...)` calls inside archivePeriod:
        // batches, salesOrders, and (after refactor) NO archive_runs update.
        // We use insertion order to label them: first tx.update == batches,
        // second tx.update == salesOrders.
        const _table = table;
        return {
          set: (_values: Record<string, unknown>) => ({
            where: async () => {
              const callCount = txUpdateSeq++;
              if (callCount === 0) recordDbEvent('batches-update');
              else if (callCount === 1) recordDbEvent('salesOrders-update');
            }
          })
        };
      })
    };
  }

  let txUpdateSeq = 0;

  const innerTxImpl = async (cb: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
    recordDbEvent('tx-begin');
    txUpdateSeq = 0;
    const tx = makeTx();
    const out = await cb(tx);
    recordDbEvent('tx-commit');
    return out;
  };

  // Top-level db.update — used by the post-commit phase to finalize the
  // archive_runs row.
  const topLevelUpdate = vi.fn((_table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        // Apply to the only archive_runs row we created.
        const [row] = archiveRows.values();
        if (row) Object.assign(row, values);
        recordDbEvent('archive-update', { status: values.status });
      }
    })
  }));

  const dbExport = {
    insert: vi.fn(),
    select: vi.fn(),
    update: topLevelUpdate,
    transaction: vi.fn(innerTxImpl)
  };

  return {
    db: dbExport,
    pool: { query: vi.fn() },
    __dbEvents: dbEvents,
    __fsCalls: fsCalls,
    __archiveRows: archiveRows,
    __reset: () => {
      dbEvents.length = 0;
      fsCalls.length = 0;
      archiveRows.clear();
      nextSeq = 1;
      pdfWriteShouldFail = false;
    },
    __setPdfWriteFail: (v: boolean) => {
      pdfWriteShouldFail = v;
    }
  };
});

// Import the function under test AFTER mocks are installed.
// We import the lower-level archivePeriodCommand via a tiny test-only re-export
// or directly invoke it through executeCommand. Going through executeCommand
// is more honest: it exercises the surrounding wrapper too.
// However, executeCommand also writes the commandJournal claim row — which our
// db mock doesn't simulate. Instead we test the archivePeriod implementation
// directly by reaching into the module under test.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const commandBusModule = await import('./commandBus');
// archivePeriod is not exported by name from commandBus; we add a test-only
// export in the refactor. If the helper is named `archivePeriodImpl` the test
// will use that.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const archivePeriodImpl = (commandBusModule as any).__archivePeriodImpl as
  | undefined
  | ((payload: Record<string, unknown>, commandId: string) => Promise<unknown>);

// Mocked dbModule exposes the per-test reset helper.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbModuleMocked = (await import('../db')) as unknown as {
  __reset: () => void;
  __dbEvents: DbEvent[];
  __fsCalls: FsCall[];
  __archiveRows: Map<string, Record<string, unknown>>;
  __setPdfWriteFail: (v: boolean) => void;
};

beforeEach(() => {
  dbModuleMocked.__reset();
});

afterEach(() => {
  dbModuleMocked.__reset();
});

describe('archivePeriod — file writes happen after tx commit (#19 slice 3, EDGE-04)', () => {
  it('exposes a test-callable implementation', () => {
    expect(archivePeriodImpl).toBeTypeOf('function');
  });

  it('test 1: NO fs writes occur inside the surrounding tx — every fs call happens after tx-commit', async () => {
    if (!archivePeriodImpl) throw new Error('archivePeriod implementation not exported for tests');
    await archivePeriodImpl({ period: '2026-04' }, 'cmd-1');

    const commitAt = dbModuleMocked.__dbEvents.find((e) => e.kind === 'tx-commit')?.at;
    expect(commitAt).toBeDefined();

    // No fs calls should occur before the tx commits.
    const beforeCommit = dbModuleMocked.__fsCalls.filter((c) => c.at < (commitAt as number));
    expect(beforeCommit).toEqual([]);

    // At least one file write must occur after the tx commits.
    const afterCommit = dbModuleMocked.__fsCalls.filter((c) => c.at > (commitAt as number));
    expect(afterCommit.length).toBeGreaterThan(0);
  });

  it('test 2: archive_runs row is inserted with status=in_progress inside the tx, then finalized with status=archived + paths AFTER tx commit', async () => {
    if (!archivePeriodImpl) throw new Error('archivePeriod implementation not exported for tests');
    await archivePeriodImpl({ period: '2026-04' }, 'cmd-2');

    const insertEvent = dbModuleMocked.__dbEvents.find((e) => e.kind === 'archive-insert');
    expect(insertEvent).toBeDefined();
    expect(insertEvent?.payload?.status).toBe('in_progress');

    const commitAt = dbModuleMocked.__dbEvents.find((e) => e.kind === 'tx-commit')!.at;
    const finalizeUpdate = dbModuleMocked.__dbEvents.find(
      (e) => e.kind === 'archive-update' && e.at > commitAt
    );
    expect(finalizeUpdate).toBeDefined();
    expect(finalizeUpdate?.payload?.status).toBe('archived');

    // The final row state should now carry resolved file paths.
    const [row] = [...dbModuleMocked.__archiveRows.values()];
    expect(row.csvPath).toMatch(/2026-04-batches\.csv$/);
    expect(row.jsonlPath).toMatch(/2026-04-commands\.jsonl$/);
    expect(row.pdfPath).toMatch(/2026-04-summary\.pdf$/);
    expect(row.status).toBe('archived');
  });

  it('test 3: post-commit file-write failure marks the row failed_file_write and rethrows — DB-side archive snapshot remains committed', async () => {
    if (!archivePeriodImpl) throw new Error('archivePeriod implementation not exported for tests');
    dbModuleMocked.__setPdfWriteFail(true);

    await expect(archivePeriodImpl({ period: '2026-04' }, 'cmd-3')).rejects.toThrow(/pdf write failure/i);

    // The inner DB tx must still have committed (snapshot writes are durable).
    expect(dbModuleMocked.__dbEvents.find((e) => e.kind === 'tx-commit')).toBeDefined();

    // The archive_runs row should now read status='failed_file_write'.
    const [row] = [...dbModuleMocked.__archiveRows.values()];
    expect(row).toBeDefined();
    expect(row.status).toBe('failed_file_write');
    expect(typeof row.error).toBe('string');
    expect(row.error as string).toMatch(/pdf write failure/i);
  });
});

// Silence unused-import warnings if executeCommand isn't used directly.
void executeCommandTypeWitness;
function executeCommandTypeWitness(_a?: unknown, _b?: SessionUser, _c?: SocketServer) {
  /* no-op */
}
