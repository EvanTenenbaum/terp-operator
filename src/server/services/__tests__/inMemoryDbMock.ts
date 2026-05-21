/**
 * Shared in-memory Drizzle-shaped DB mock for snapshot service tests.
 *
 * Supports the following Drizzle chain shapes:
 *   tx.select().from(t).where(pred).for('update').limit(n)
 *   tx.select(cols).from(t).where(pred).orderBy(col).limit(n)
 *   tx.insert(t).values(v).returning()
 *   tx.update(t).set(s).where(pred)
 *   tx.execute(sql`...`)
 *   db.select() with the same chain (no tx)
 *
 * Predicate parsing walks the Drizzle SQL AST via .queryChunks.
 * Table identification uses Symbol.for('drizzle:Name').
 */

const DRIZZLE_NAME = Symbol.for('drizzle:Name');

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface InMemoryState {
  purchaseOrders: Array<Record<string, unknown>>;
  purchaseOrderLines: Array<Record<string, unknown>>;
  vendors: Array<Record<string, unknown>>;
  documentSnapshots: Array<Record<string, unknown>>;
  commandJournal: Array<Record<string, unknown>>;
  advisoryLocks: string[];
}

export function createInMemoryState(): InMemoryState {
  return {
    purchaseOrders: [],
    purchaseOrderLines: [],
    vendors: [],
    documentSnapshots: [],
    commandJournal: [],
    advisoryLocks: [],
  };
}

export function resetInMemoryState(state: InMemoryState): void {
  state.purchaseOrders.length = 0;
  state.purchaseOrderLines.length = 0;
  state.vendors.length = 0;
  state.documentSnapshots.length = 0;
  state.commandJournal.length = 0;
  state.advisoryLocks.length = 0;
}

// ---------------------------------------------------------------------------
// Table → state array
// ---------------------------------------------------------------------------

function getStateArray(
  state: InMemoryState,
  table: unknown,
): Array<Record<string, unknown>> {
  const name = (table as Record<symbol, string>)[DRIZZLE_NAME];
  switch (name) {
    case 'purchase_orders':
      return state.purchaseOrders;
    case 'purchase_order_lines':
      return state.purchaseOrderLines;
    case 'vendors':
      return state.vendors;
    case 'document_snapshots':
      return state.documentSnapshots;
    case 'command_journal':
      return state.commandJournal;
    default:
      throw new Error(`inMemoryDbMock: unsupported table: ${String(name)}`);
  }
}

// ---------------------------------------------------------------------------
// Predicate extraction
// ---------------------------------------------------------------------------

interface ExtractedPredicate {
  colName: string; // snake_case (Drizzle column name)
  tableName: string;
  op: 'eq' | 'in';
  value: unknown;
}

/**
 * Recursively walks the Drizzle SQL AST via .queryChunks to find all
 * eq() and inArray() leaf predicates.
 *
 * AST shape for eq(col, val):
 *   queryChunks = [wrapper, COL, ' = ', VALUE, wrapper]
 *   where COL has .columnType, and VALUE has .value
 *
 * AST shape for inArray(col, [a, b, c]):
 *   queryChunks = [wrapper, COL, ' in ', Array<{value: x}>, wrapper]
 *
 * AST shape for and(eq1, eq2):
 *   queryChunks = ['(', SQL{eq1, ' and ', eq2}, ')']
 *   → recurse into nested SQL nodes
 */
function extractPredicates(node: unknown): ExtractedPredicate[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  if (!obj.queryChunks) return [];

  const chunks = obj.queryChunks as unknown[];

  // Leaf pattern: chunks[1] is a Drizzle column (has .columnType)
  if (
    chunks.length >= 4 &&
    chunks[1] &&
    typeof chunks[1] === 'object' &&
    (chunks[1] as Record<string, unknown>).columnType
  ) {
    const col = chunks[1] as Record<string, unknown>;
    const colName = col.name as string;
    const tableName = (
      col.table as Record<symbol, string>
    )[DRIZZLE_NAME];
    const rawVal = chunks[3];

    if (Array.isArray(rawVal)) {
      // inArray: chunks[3] is an array of bound-value objects
      const values = rawVal.map((x: unknown) =>
        x && typeof x === 'object'
          ? (x as Record<string, unknown>).value
          : x,
      );
      return [{ colName, tableName, op: 'in', value: values }];
    } else if (rawVal !== undefined && rawVal !== null) {
      // eq: chunks[3] has .value (or is a plain string)
      const val =
        typeof rawVal === 'object'
          ? (rawVal as Record<string, unknown>).value
          : rawVal;
      return [{ colName, tableName, op: 'eq', value: val }];
    }
  }

  // Compound or unknown node: recurse into sub-nodes that have queryChunks
  const result: ExtractedPredicate[] = [];
  for (const chunk of chunks) {
    if (
      chunk &&
      typeof chunk === 'object' &&
      !Array.isArray(chunk) &&
      (chunk as Record<string, unknown>).queryChunks
    ) {
      result.push(...extractPredicates(chunk));
    }
  }
  return result;
}

/** Convert snake_case column name to camelCase for state row lookup. */
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
}

/**
 * Apply extracted predicates to filter rows.
 * Tries both camelCase and snake_case keys for each predicate.
 * Throws on unsupported/unparseable predicates.
 */
function applyPredicates(
  rows: Array<Record<string, unknown>>,
  pred: unknown,
): Array<Record<string, unknown>> {
  if (!pred) return rows;

  const predicates = extractPredicates(pred);
  if (predicates.length === 0) {
    let serialized: string;
    try {
      serialized = JSON.stringify(pred);
    } catch {
      serialized = '[unserializable]';
    }
    throw new Error(
      `inMemoryDbMock: unsupported predicate shape: ${serialized}`,
    );
  }

  return rows.filter((row) =>
    predicates.every((p) => {
      const camelKey = snakeToCamel(p.colName);
      const rowVal = camelKey in row ? row[camelKey] : row[p.colName];
      if (p.op === 'eq') return rowVal === p.value;
      if (p.op === 'in') return (p.value as unknown[]).includes(rowVal);
      return true;
    }),
  );
}

// ---------------------------------------------------------------------------
// Advisory lock extraction
// ---------------------------------------------------------------------------

/**
 * Scan the SQL node's queryChunks for the 'document_snapshot:' prefix.
 * The prefix may appear either as a literal string chunk OR as the .value
 * of an interpolated Param chunk (Drizzle wraps `sql`${k}`` interpolations
 * as Param objects with a .value field rather than inlining them as raw
 * string chunks).  Push the substring after the prefix into
 * state.advisoryLocks and return the extracted key (or null).
 */
function extractAdvisoryLockKey(sqlNode: unknown): string | null {
  if (!sqlNode || typeof sqlNode !== 'object') return null;
  const obj = sqlNode as Record<string, unknown>;
  if (!Array.isArray(obj.queryChunks)) return null;

  const PREFIX = 'document_snapshot:';
  for (const chunk of obj.queryChunks as unknown[]) {
    if (typeof chunk === 'string' && chunk.includes(PREFIX)) {
      return chunk.slice(chunk.indexOf(PREFIX) + PREFIX.length);
    }
    if (chunk && typeof chunk === 'object') {
      const candidate = (chunk as Record<string, unknown>).value;
      if (typeof candidate === 'string' && candidate.includes(PREFIX)) {
        return candidate.slice(candidate.indexOf(PREFIX) + PREFIX.length);
      }
    }
  }
  return null;
}

function recordAdvisoryLock(state: InMemoryState, sqlNode: unknown): string | null {
  const key = extractAdvisoryLockKey(sqlNode);
  if (key !== null) {
    state.advisoryLocks.push(key);
  }
  return key;
}

// ---------------------------------------------------------------------------
// Chain builders
// ---------------------------------------------------------------------------

function buildOps(state: InMemoryState) {
  // Per-subject mutex so that `tx.execute(sql`SELECT pg_advisory_xact_lock(...)`)`
  // serializes concurrent callers in the same JS process, mirroring how
  // pg_advisory_xact_lock would serialize transactions in real Postgres.
  // The lock is released on the next macrotask tick so that the calling
  // service function has time to complete its full microtask pipeline
  // (multiple awaits over Promise.resolve()) before the next caller proceeds.
  const subjectMutex = new Map<string, Promise<void>>();

  function generateId(): string {
    // Prefer crypto.randomUUID if available; fall back to a sufficiently
    // unique sentinel for test environments without crypto.
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    return `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  // --- SELECT ---
  function select(_cols?: unknown) {
    let _table: unknown;
    let _pred: unknown;

    function runQuery(limitN?: number): Promise<Array<Record<string, unknown>>> {
      const arr = _table ? getStateArray(state, _table) : [];
      const rows = _pred ? applyPredicates(arr, _pred) : [...arr];
      return Promise.resolve(
        typeof limitN === 'number' ? rows.slice(0, limitN) : rows,
      );
    }

    const limitFn = (n: number) => runQuery(n);

    type Rows = Array<Record<string, unknown>>;
    interface SelectTerminator extends PromiseLike<Rows> {
      for(mode?: string): SelectTerminator;
      orderBy(col?: unknown): SelectTerminator;
      limit(n: number): Promise<Rows>;
    }

    // A "terminator" object returned after `.where(...)`.  It both:
    //   - chains via `.for(...)`, `.orderBy(...)`, `.limit(n)`
    //   - is itself thenable, so `await tx.select().from(t).where(p)`
    //     resolves to all matching rows (matching Drizzle's behaviour).
    function makeTerminator(): SelectTerminator {
      return {
        for: (_mode?: string) => makeTerminator(),
        orderBy: (_col?: unknown) => makeTerminator(),
        limit: limitFn,
        then: <TResult1 = Rows, TResult2 = never>(
          onfulfilled?:
            | ((value: Rows) => TResult1 | PromiseLike<TResult1>)
            | null
            | undefined,
          onrejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null
            | undefined,
        ): PromiseLike<TResult1 | TResult2> =>
          runQuery().then(onfulfilled, onrejected),
      };
    }

    return {
      from(table: unknown) {
        _table = table;
        return {
          where(pred: unknown) {
            _pred = pred;
            return makeTerminator();
          },
          orderBy: (_col?: unknown) => makeTerminator(),
          limit: limitFn,
        };
      },
    };
  }

  // --- INSERT ---
  function insert(table: unknown) {
    return {
      values(
        val:
          | Record<string, unknown>
          | Array<Record<string, unknown>>,
      ) {
        return {
          returning(): Promise<Array<Record<string, unknown>>> {
            const arr = getStateArray(state, table);
            const rows = Array.isArray(val) ? val : [val];
            const stamped = rows.map((r) => ({
              ...r,
              id: r.id ?? generateId(),
              createdAt: r.createdAt ?? new Date(),
              updatedAt: r.updatedAt ?? new Date(),
            }));
            arr.push(...stamped);
            return Promise.resolve([...stamped]);
          },
        };
      },
    };
  }

  // --- UPDATE ---
  function update(table: unknown) {
    return {
      set(setVals: Record<string, unknown>) {
        return {
          where(pred: unknown): Promise<void> {
            const arr = getStateArray(state, table);
            const matched = applyPredicates(arr, pred);
            for (const row of matched) {
              Object.assign(row, setVals);
            }
            return Promise.resolve();
          },
        };
      },
    };
  }

  // --- EXECUTE ---
  async function execute(sqlNode: unknown): Promise<void> {
    const key = recordAdvisoryLock(state, sqlNode);
    if (key === null) return;
    // Serialize on this key: wait for any previously-installed mutex slot
    // to resolve, then install a fresh slot that resolves on the next
    // macrotask tick.  This gives the current acquirer's full pipeline of
    // microtask-resolved awaits (select/update/insert) a chance to run
    // to completion before the next concurrent acquirer proceeds.
    const prev = subjectMutex.get(key);
    if (prev) await prev;
    const next = new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    subjectMutex.set(key, next);
  }

  return { select, insert, update, execute };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type MockedDb = ReturnType<typeof makeMockedDb>['db'];
export type MockedTx = ReturnType<typeof makeMockedDb>['tx'];

export function makeMockedDb(state: InMemoryState) {
  const ops = buildOps(state);

  const tx = {
    select: ops.select,
    insert: ops.insert,
    update: ops.update,
    execute: ops.execute,
  };

  // Alias type to avoid the TypeScript self-referential annotation error
  // that occurs when a transaction callback parameter is named `tx`.
  type TxHandle = typeof tx;

  const db = {
    select: ops.select,
    insert: ops.insert,
    update: ops.update,
    execute: ops.execute,
    transaction: async <T>(fn: (t: TxHandle) => Promise<T>): Promise<T> =>
      fn(tx),
  };

  return { db, tx };
}
