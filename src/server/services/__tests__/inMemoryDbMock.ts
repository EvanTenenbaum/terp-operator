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
 * Scan the SQL node's queryChunks for a string containing
 * 'document_snapshot:' and push the portion after that prefix into
 * state.advisoryLocks.
 */
function recordAdvisoryLock(state: InMemoryState, sqlNode: unknown): void {
  if (!sqlNode || typeof sqlNode !== 'object') return;
  const obj = sqlNode as Record<string, unknown>;
  if (!Array.isArray(obj.queryChunks)) return;

  const PREFIX = 'document_snapshot:';
  for (const chunk of obj.queryChunks as unknown[]) {
    if (typeof chunk === 'string' && chunk.includes(PREFIX)) {
      const afterPrefix = chunk.slice(chunk.indexOf(PREFIX) + PREFIX.length);
      state.advisoryLocks.push(afterPrefix);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Chain builders
// ---------------------------------------------------------------------------

function buildOps(state: InMemoryState) {
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
    const orderByFn = (_col?: unknown) => ({ limit: limitFn });
    const forFn = (_mode?: string) => ({ limit: limitFn });

    return {
      from(table: unknown) {
        _table = table;
        return {
          where(pred: unknown) {
            _pred = pred;
            return {
              for: forFn,
              orderBy: orderByFn,
              limit: limitFn,
            };
          },
          orderBy: orderByFn,
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
            arr.push(...rows);
            return Promise.resolve([...rows]);
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
  function execute(sqlNode: unknown): Promise<void> {
    recordAdvisoryLock(state, sqlNode);
    return Promise.resolve();
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
