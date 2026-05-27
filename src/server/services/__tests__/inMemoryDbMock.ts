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
  salesOrders: Array<Record<string, unknown>>;
  salesOrderLines: Array<Record<string, unknown>>;
  batches: Array<Record<string, unknown>>;
  customers: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  clientLedgerEntries: Array<Record<string, unknown>>;
  vendorBills: Array<Record<string, unknown>>;
  // Catch-all for tables the mock does not model explicitly. Writes are
  // accepted (so production code paths that touch peripheral tables do not
  // crash), and reads return empty rows.
  _dynamic?: Record<string, Array<Record<string, unknown>>>;
}

export function createInMemoryState(): InMemoryState {
  const salesOrders: Array<Record<string, unknown>> = [];
  const salesOrderLines: Array<Record<string, unknown>> = [];
  const batches: Array<Record<string, unknown>> = [];
  const customers: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];
  const clientLedgerEntries: Array<Record<string, unknown>> = [];
  const vendorBills: Array<Record<string, unknown>> = [];
  return {
    purchaseOrders: [],
    purchaseOrderLines: [],
    vendors: [],
    documentSnapshots: [],
    commandJournal: [],
    advisoryLocks: [],
    salesOrders,
    salesOrderLines,
    batches,
    customers,
    payments,
    clientLedgerEntries,
    vendorBills,
    // Alias the named tables into _dynamic so seedRow() calls that push to
    // _dynamic['sales_orders'] etc. are immediately visible to getStateArray().
    _dynamic: {
      'sales_orders': salesOrders,
      'sales_order_lines': salesOrderLines,
      'batches': batches,
      'customers': customers,
      'payments': payments,
      'client_ledger_entries': clientLedgerEntries,
      'vendor_bills': vendorBills,
    },
  };
}

export function resetInMemoryState(state: InMemoryState): void {
  state.purchaseOrders.length = 0;
  state.purchaseOrderLines.length = 0;
  state.vendors.length = 0;
  state.documentSnapshots.length = 0;
  state.commandJournal.length = 0;
  state.advisoryLocks.length = 0;
  if (!state.salesOrders) (state as Record<string, unknown>).salesOrders = [];
  else state.salesOrders.length = 0;
  if (!state.salesOrderLines) (state as Record<string, unknown>).salesOrderLines = [];
  else state.salesOrderLines.length = 0;
  if (!state.batches) (state as Record<string, unknown>).batches = [];
  else state.batches.length = 0;
  if (!state.customers) (state as Record<string, unknown>).customers = [];
  else state.customers.length = 0;
  if (!state.payments) (state as Record<string, unknown>).payments = [];
  else state.payments.length = 0;
  if (!state.clientLedgerEntries) (state as Record<string, unknown>).clientLedgerEntries = [];
  else state.clientLedgerEntries.length = 0;
  if (!state.vendorBills) (state as Record<string, unknown>).vendorBills = [];
  else state.vendorBills.length = 0;
  // Re-alias _dynamic entries to the explicit arrays so seedRow() callers that
  // push to _dynamic[tableName] remain visible via getStateArray().
  if (!state._dynamic) state._dynamic = {};
  for (const key of Object.keys(state._dynamic)) {
    const NAMED = ['sales_orders','sales_order_lines','batches','customers','payments','client_ledger_entries','vendor_bills'];
    if (!NAMED.includes(key)) delete state._dynamic[key];
  }
  state._dynamic['sales_orders']         = state.salesOrders;
  state._dynamic['sales_order_lines']    = state.salesOrderLines;
  state._dynamic['batches']              = state.batches;
  state._dynamic['customers']            = state.customers;
  state._dynamic['payments']             = state.payments;
  state._dynamic['client_ledger_entries'] = state.clientLedgerEntries;
  state._dynamic['vendor_bills']         = state.vendorBills;
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
    case 'sales_orders':
      return state.salesOrders;
    case 'sales_order_lines':
      return state.salesOrderLines;
    case 'batches':
      return state.batches;
    case 'customers':
      return state.customers;
    case 'payments':
      return state.payments;
    case 'client_ledger_entries':
      return state.clientLedgerEntries;
    case 'vendor_bills':
      return state.vendorBills;
    default: {
      // Dynamic fallback: peripheral tables (invoices, fulfillment_lines, etc.) used
      // by commandBus get a transparent empty bucket so writes succeed and reads
      // return [] without forcing every test to model the full schema.
      if (!state._dynamic) state._dynamic = {};
      const key = String(name);
      if (!state._dynamic[key]) state._dynamic[key] = [];
      return state._dynamic[key];
    }
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
// FOR UPDATE helpers
// ---------------------------------------------------------------------------

/** Convert camelCase to snake_case for execute() return rows. */
function camelToSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, (_: string, c: string) => `_${c.toLowerCase()}`);
}

/** Convert all keys in a row from camelCase to snake_case. */
function rowToSnake(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    result[camelToSnakeCase(k)] = v;
  }
  return result;
}

/**
 * Recursively check if any chunk in the SQL AST indicates a FOR UPDATE query.
 *
 * In the actual Drizzle SQL AST (drizzle-orm 0.45.x):
 * - Template literal string parts → StringChunk objects `{ value: ['string'] }`
 * - Interpolated plain values → raw strings in queryChunks
 * - Table references → objects with `[DRIZZLE_NAME]`
 * - Column references → objects with `.columnType`
 *
 * 'FOR UPDATE' appears as part of the template literal string → inside a
 * StringChunk's `.value` array, NOT as a raw string chunk.
 */
function hasForUpdate(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const obj = node as Record<string, unknown>;
  if (!Array.isArray(obj.queryChunks)) return false;
  for (const chunk of obj.queryChunks as unknown[]) {
    // Raw string chunk — could be an interpolated string value
    if (typeof chunk === 'string' && /\bfor\s+update\b/i.test(chunk)) return true;
    if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) continue;
    const c = chunk as Record<string, unknown>;
    // StringChunk: { value: ['string'] } — template literal part
    if (Array.isArray(c.value)) {
      for (const s of c.value as unknown[]) {
        if (typeof s === 'string' && /\bfor\s+update\b/i.test(s)) return true;
      }
    }
    // Recurse into sub-SQL nodes (if any)
    if (Array.isArray(c.queryChunks)) {
      if (hasForUpdate(chunk)) return true;
    }
  }
  return false;
}

/**
 * Recursively find the first DRIZZLE_NAME in the SQL node's chunk tree.
 * Table chunks have [DRIZZLE_NAME] set directly on them (no queryChunks).
 */
function findDrizzleName(node: unknown): string | null {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  const obj = node as Record<string | symbol, unknown>;

  // Direct DRIZZLE_NAME on this object (table reference placed directly in chunks)
  const directName = obj[DRIZZLE_NAME];
  if (typeof directName === 'string') return directName;

  // Skip StringChunks { value: ['string'] } — template literal parts
  const objStr = obj as Record<string, unknown>;
  if (Array.isArray(objStr.value)) return null;

  // Recurse into sub-SQL nodes
  if (Array.isArray(objStr.queryChunks)) {
    for (const chunk of objStr.queryChunks as unknown[]) {
      if (chunk && typeof chunk !== 'string') {
        const found = findDrizzleName(chunk);
        if (found !== null) return found;
      }
    }
  }
  return null;
}

/**
 * Find the last interpolated id value from a FOR UPDATE raw SQL query.
 *
 * In the actual Drizzle SQL AST, interpolated plain-value strings (like a UUID)
 * appear as RAW STRINGS directly in the queryChunks array, while template
 * literal string parts appear as StringChunk objects `{ value: ['string'] }`.
 *
 * This function:
 *  - Treats raw strings in queryChunks as interpolated values (keeps the last one)
 *  - Skips StringChunks (template parts, value is an array)
 *  - Skips column objects (have columnType)
 *  - Skips table objects (have DRIZZLE_NAME)
 *  - Also handles legacy Param-style { value: 'string' } chunks
 */
function findLastParam(node: unknown): unknown {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (!Array.isArray(obj.queryChunks)) return null;
  let lastVal: unknown = null;
  for (const chunk of obj.queryChunks as unknown[]) {
    // Raw strings in queryChunks ARE interpolated values (not template literal parts)
    if (typeof chunk === 'string') {
      lastVal = chunk;
      continue;
    }
    if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) continue;
    const c = chunk as Record<string | symbol, unknown>;
    const cs = c as Record<string, unknown>;
    // Skip StringChunks (template literal parts): value is an array
    if (Array.isArray(cs.value)) continue;
    // Skip column objects (have columnType)
    if ('columnType' in cs) continue;
    // Skip table objects (have DRIZZLE_NAME)
    if (c[DRIZZLE_NAME]) continue;
    // Legacy Param-style { value: 'string' } or { value: number }
    if ('value' in cs) {
      const v = cs.value;
      if (typeof v === 'string' || typeof v === 'number') {
        lastVal = v;
      }
    }
  }
  return lastVal;
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
        let conflictTargetCol: string | null = null;
        let conflictHandled = false;

        function doInsert(): Array<Record<string, unknown>> {
          const arr = getStateArray(state, table);
          const rows = Array.isArray(val) ? val : [val];
          if (conflictHandled && conflictTargetCol) {
            // Skip rows whose conflict-target column matches an existing row.
            const camelKey = snakeToCamel(conflictTargetCol);
            const accepted: Array<Record<string, unknown>> = [];
            for (const r of rows) {
              const valKey = camelKey in r ? camelKey : conflictTargetCol in r ? conflictTargetCol : camelKey;
              const candidate = r[valKey];
              const exists = arr.some((existing) => {
                const existingKey = camelKey in existing ? camelKey : conflictTargetCol! in existing ? conflictTargetCol! : camelKey;
                return existing[existingKey] === candidate;
              });
              if (!exists) accepted.push(r);
            }
            const stamped = accepted.map((r) => ({
              ...r,
              id: r.id ?? generateId(),
              createdAt: r.createdAt ?? new Date(),
              updatedAt: r.updatedAt ?? new Date(),
            }));
            arr.push(...stamped);
            return stamped;
          }
          const stamped = rows.map((r) => ({
            ...r,
            id: r.id ?? generateId(),
            createdAt: r.createdAt ?? new Date(),
            updatedAt: r.updatedAt ?? new Date(),
          }));
          arr.push(...stamped);
          return stamped;
        }

        // Track whether the insert has already been executed so that
        // `await insert(t).values(v)` (no .returning()) and
        // `await insert(t).values(v).returning()` both run the insert exactly once.
        let insertExecuted = false;
        let insertedRows: Array<Record<string, unknown>> = [];

        function executeOnce(): Array<Record<string, unknown>> {
          if (!insertExecuted) {
            insertExecuted = true;
            insertedRows = doInsert();
          }
          return insertedRows;
        }

        const chain = {
          onConflictDoNothing(opts?: { target?: unknown }) {
            conflictHandled = true;
            // Extract column name from the target column descriptor.
            const target = opts?.target as Record<string, unknown> | undefined;
            if (target && typeof target === 'object') {
              const name = (target as Record<string, unknown>).name;
              if (typeof name === 'string') conflictTargetCol = name;
            }
            return chain;
          },
          returning(): Promise<Array<Record<string, unknown>>> {
            return Promise.resolve([...executeOnce()]);
          },
          // Make the chain thenable so `await insert(t).values(v)` (no .returning())
          // also executes the insert, mirroring real Drizzle behaviour.
          then<T>(
            resolve: (v: Array<Record<string, unknown>>) => T | PromiseLike<T>,
            reject?: (reason: unknown) => T | PromiseLike<T>,
          ): Promise<T> {
            return Promise.resolve(executeOnce()).then(resolve, reject);
          },
        };
        return chain;
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

  // --- DELETE ---
  function deleteFrom(table: unknown) {
    return {
      where(pred: unknown): Promise<void> {
        const arr = getStateArray(state, table);
        const matched = applyPredicates(arr, pred);
        for (const row of matched) {
          const idx = arr.indexOf(row);
          if (idx !== -1) arr.splice(idx, 1);
        }
        return Promise.resolve();
      },
    };
  }

  // --- EXECUTE ---
  // Handles:
  //   1. Advisory lock SQL (document_snapshot: prefix) — acquires mutex, returns { rows: [] }
  //   2. FOR UPDATE raw SQL — extracts table + id, returns matching rows in snake_case
  //   3. Other raw SQL — returns { rows: [] }
  async function execute(sqlNode: unknown): Promise<{ rows: Array<Record<string, unknown>> }> {
    const key = recordAdvisoryLock(state, sqlNode);
    if (key !== null) {
      // Advisory lock path: serialize on this key.
      const prev = subjectMutex.get(key);
      if (prev) await prev;
      const next = new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      subjectMutex.set(key, next);
      return { rows: [] };
    }

    // FOR UPDATE path: extract table name and id, return matching rows.
    if (hasForUpdate(sqlNode)) {
      const tableName = findDrizzleName(sqlNode);
      if (tableName) {
        // Create a fake table reference so getStateArray can look up by name.
        const fakeTable = { [DRIZZLE_NAME]: tableName } as unknown;
        const arr = getStateArray(state, fakeTable);
        const idValue = findLastParam(sqlNode);
        const rows =
          idValue !== null && idValue !== undefined
            ? arr.filter((row) => row.id === idValue)
            : [...arr];
        // Return snake_case rows to match Postgres raw SELECT * output.
        return { rows: rows.map(rowToSnake) };
      }
    }

    return { rows: [] };
  }

  return { select, insert, update, delete: deleteFrom, execute };
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
    delete: ops.delete,
    execute: ops.execute,
    // Expose a stub session.client.query so enqueueCustomerRecompute (which
    // unwraps the Drizzle transaction to its underlying pg.PoolClient via
    // client.session.client) does not throw "query is not a function".
    session: {
      client: {
        query: async (_sql: string, _params?: unknown[]) => ({ rows: [] }),
      },
    },
  };

  // Alias type to avoid the TypeScript self-referential annotation error
  // that occurs when a transaction callback parameter is named `tx`.
  type TxHandle = typeof tx;

  // Deep-clone every row in every table so transaction rollback can restore
  // the pre-transaction state if the callback throws. Plain objects only —
  // adequate for our seed shapes (dates and primitives copy by value).
  function snapshotState(): {
    purchaseOrders: Array<Record<string, unknown>>;
    purchaseOrderLines: Array<Record<string, unknown>>;
    vendors: Array<Record<string, unknown>>;
    documentSnapshots: Array<Record<string, unknown>>;
    commandJournal: Array<Record<string, unknown>>;
    advisoryLocks: string[];
    salesOrders: Array<Record<string, unknown>>;
    salesOrderLines: Array<Record<string, unknown>>;
    batches: Array<Record<string, unknown>>;
    customers: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    clientLedgerEntries: Array<Record<string, unknown>>;
    vendorBills: Array<Record<string, unknown>>;
    _dynamic: Record<string, Array<Record<string, unknown>>>;
  } {
    const cloneRows = (rows: Array<Record<string, unknown>>) =>
      rows.map((r) => ({ ...r }));
    const dyn: Record<string, Array<Record<string, unknown>>> = {};
    if (state._dynamic) {
      for (const [k, v] of Object.entries(state._dynamic)) dyn[k] = cloneRows(v);
    }
    return {
      purchaseOrders: cloneRows(state.purchaseOrders),
      purchaseOrderLines: cloneRows(state.purchaseOrderLines),
      vendors: cloneRows(state.vendors),
      documentSnapshots: cloneRows(state.documentSnapshots),
      commandJournal: cloneRows(state.commandJournal),
      advisoryLocks: [...state.advisoryLocks],
      salesOrders: cloneRows(state.salesOrders ?? []),
      salesOrderLines: cloneRows(state.salesOrderLines ?? []),
      batches: cloneRows(state.batches ?? []),
      customers: cloneRows(state.customers ?? []),
      payments: cloneRows(state.payments ?? []),
      clientLedgerEntries: cloneRows(state.clientLedgerEntries ?? []),
      vendorBills: cloneRows(state.vendorBills ?? []),
      _dynamic: dyn,
    };
  }

  function restoreState(snap: ReturnType<typeof snapshotState>): void {
    state.purchaseOrders.length = 0;
    state.purchaseOrders.push(...snap.purchaseOrders);
    state.purchaseOrderLines.length = 0;
    state.purchaseOrderLines.push(...snap.purchaseOrderLines);
    state.vendors.length = 0;
    state.vendors.push(...snap.vendors);
    state.documentSnapshots.length = 0;
    state.documentSnapshots.push(...snap.documentSnapshots);
    state.commandJournal.length = 0;
    state.commandJournal.push(...snap.commandJournal);
    state.advisoryLocks.length = 0;
    state.advisoryLocks.push(...snap.advisoryLocks);

    if (!state.salesOrders) (state as Record<string, unknown>).salesOrders = [];
    state.salesOrders.length = 0;
    state.salesOrders.push(...snap.salesOrders);

    if (!state.salesOrderLines) (state as Record<string, unknown>).salesOrderLines = [];
    state.salesOrderLines.length = 0;
    state.salesOrderLines.push(...snap.salesOrderLines);

    if (!state.batches) (state as Record<string, unknown>).batches = [];
    state.batches.length = 0;
    state.batches.push(...snap.batches);

    if (!state.customers) (state as Record<string, unknown>).customers = [];
    state.customers.length = 0;
    state.customers.push(...snap.customers);

    if (!state.payments) (state as Record<string, unknown>).payments = [];
    state.payments.length = 0;
    state.payments.push(...snap.payments);

    if (!state.clientLedgerEntries) (state as Record<string, unknown>).clientLedgerEntries = [];
    state.clientLedgerEntries.length = 0;
    state.clientLedgerEntries.push(...snap.clientLedgerEntries);

    if (!state.vendorBills) (state as Record<string, unknown>).vendorBills = [];
    state.vendorBills.length = 0;
    state.vendorBills.push(...snap.vendorBills);

    if (!state._dynamic) state._dynamic = {};
    for (const k of Object.keys(state._dynamic)) delete state._dynamic[k];
    for (const [k, v] of Object.entries(snap._dynamic)) state._dynamic[k] = v;
    // Re-alias named tables so _dynamic and explicit arrays stay in sync.
    state._dynamic['sales_orders']         = state.salesOrders;
    state._dynamic['sales_order_lines']    = state.salesOrderLines;
    state._dynamic['batches']              = state.batches;
    state._dynamic['customers']            = state.customers;
    state._dynamic['payments']             = state.payments;
    state._dynamic['client_ledger_entries'] = state.clientLedgerEntries;
    state._dynamic['vendor_bills']         = state.vendorBills;
  }

  const db = {
    select: ops.select,
    insert: ops.insert,
    update: ops.update,
    delete: ops.delete,
    execute: ops.execute,
    transaction: async <T>(fn: (t: TxHandle) => Promise<T>): Promise<T> => {
      const snap = snapshotState();
      try {
        return await fn(tx);
      } catch (e) {
        restoreState(snap);
        throw e;
      }
    },
  };

  return { db, tx };
}
