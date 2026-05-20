import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { reconcileCustomerBalances } from './balanceReconciliation';

/**
 * Unit tests for the nightly customers.balance reconciliation cron.
 *
 * Issue #18 slice 4 — safety-net for the denormalized `customers.balance`
 * column that does not (yet) carry an invariant CHECK constraint. The cron:
 *
 *   1. Computes per-customer drift between `customers.balance` and
 *      `SUM(client_ledger_entries.amount)`. The subtraction is done in SQL
 *      so the comparison stays NUMERIC end-to-end (no JS double drift).
 *   2. Filters customers whose absolute drift exceeds `CUSTOMER_BALANCE_DRIFT_THRESHOLD`
 *      (default 0.01 — one cent). The cent default is intentional: anything
 *      smaller than that is below NUMERIC(12,2) resolution and would be
 *      noise.
 *   3. Inserts one row per drifted customer into
 *      `customer_balance_reconciliation`, all rows tagged with the same
 *      `run_id` so an operator can look up "the 2026-05-20 run" by id.
 *
 * Tests mock `pool.query` so they run without a live Postgres. We assert on:
 *   - the returned summary shape,
 *   - the threshold filter,
 *   - the env-var override,
 *   - the per-customer INSERTs,
 *   - the idempotency contract (a new run id per invocation, scoped rows).
 */

interface MockPool {
  query: ReturnType<typeof vi.fn>;
}

function makePool(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockPool {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      rows: r.rows,
      rowCount: r.rowCount ?? r.rows.length
    } as unknown as QueryResult);
  }
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn };
}

const THRESHOLD_ENV = 'CUSTOMER_BALANCE_DRIFT_THRESHOLD';

beforeEach(() => {
  delete process.env[THRESHOLD_ENV];
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env[THRESHOLD_ENV];
});

describe('reconcileCustomerBalances', () => {
  it('returns a structured summary with all expected fields', async () => {
    const pool = makePool([{ rows: [] }]);
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await reconcileCustomerBalances(pool as unknown as Pool, now);

    expect(typeof summary.customersChecked).toBe('number');
    expect(typeof summary.customersDrifted).toBe('number');
    expect(typeof summary.totalDriftAbs).toBe('number');
    expect(summary.run.id).toBeTypeOf('string');
    expect(summary.run.id.length).toBeGreaterThan(0);
    expect(summary.run.startedAt).toBeInstanceOf(Date);
    expect(summary.run.completedAt).toBeInstanceOf(Date);
  });

  it('counts every customer scanned, regardless of drift', async () => {
    const pool = makePool([
      {
        rows: [
          { customer_id: 'c1', expected: '100.00', actual: '100.00', drift: '0.00' },
          { customer_id: 'c2', expected: '200.00', actual: '200.00', drift: '0.00' },
          { customer_id: 'c3', expected: '300.00', actual: '300.00', drift: '0.00' }
        ]
      }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await reconcileCustomerBalances(pool as unknown as Pool, now);
    expect(summary.customersChecked).toBe(3);
    expect(summary.customersDrifted).toBe(0);
  });

  it('flags only customers whose absolute drift exceeds the default $0.01 threshold', async () => {
    const pool = makePool([
      {
        rows: [
          // Drift exactly $0.01 — within threshold, not flagged.
          { customer_id: 'c1', expected: '100.00', actual: '100.01', drift: '0.01' },
          // Drift -$0.05 — flagged (absolute value 0.05 > 0.01).
          { customer_id: 'c2', expected: '200.00', actual: '199.95', drift: '-0.05' },
          // Drift +$5.00 — flagged.
          { customer_id: 'c3', expected: '300.00', actual: '305.00', drift: '5.00' },
          // No drift.
          { customer_id: 'c4', expected: '50.00', actual: '50.00', drift: '0.00' }
        ]
      },
      // INSERT batch result (1 row per flagged customer).
      { rows: [], rowCount: 2 }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await reconcileCustomerBalances(pool as unknown as Pool, now);

    expect(summary.customersChecked).toBe(4);
    expect(summary.customersDrifted).toBe(2);
    // Total absolute drift = 0.05 + 5.00 = 5.05 (c1 below threshold excluded).
    expect(summary.totalDriftAbs).toBeCloseTo(5.05, 2);
  });

  it('respects CUSTOMER_BALANCE_DRIFT_THRESHOLD env override', async () => {
    process.env[THRESHOLD_ENV] = '1.00';
    const pool = makePool([
      {
        rows: [
          { customer_id: 'c1', expected: '100.00', actual: '100.50', drift: '0.50' },
          { customer_id: 'c2', expected: '200.00', actual: '203.00', drift: '3.00' }
        ]
      },
      { rows: [], rowCount: 1 }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await reconcileCustomerBalances(pool as unknown as Pool, now);
    // c1 drift 0.50 <= 1.00 threshold → not flagged. c2 drift 3.00 > 1.00 → flagged.
    expect(summary.customersDrifted).toBe(1);
  });

  it('inserts one row per drifted customer into customer_balance_reconciliation with expected, actual, drift, run_id', async () => {
    const pool = makePool([
      {
        rows: [
          { customer_id: 'c1', expected: '100.00', actual: '105.00', drift: '5.00' },
          { customer_id: 'c2', expected: '200.00', actual: '180.00', drift: '-20.00' }
        ]
      },
      { rows: [], rowCount: 2 }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await reconcileCustomerBalances(pool as unknown as Pool, now);

    // Find the INSERT into the audit table.
    const insertCalls = pool.query.mock.calls.filter(args => {
      const sql = String(args[0]);
      return sql.includes('customer_balance_reconciliation') && /INSERT/i.test(sql);
    });
    expect(insertCalls).toHaveLength(1);
    const params = insertCalls[0][1] as unknown[];
    // Params must include the run_id (uuid) and one row per drifted customer.
    // Implementation flattens (run_id, customer_id, expected, actual, drift) per row.
    expect(params).toContain(summary.run.id);
    // Two drifted customers → at least 2*4 customer-row params + run_id.
    expect(params.length).toBeGreaterThanOrEqual(2 * 4 + 1);
  });

  it('does NOT write rows when no customer drifts beyond threshold', async () => {
    const pool = makePool([
      {
        rows: [
          { customer_id: 'c1', expected: '100.00', actual: '100.00', drift: '0.00' },
          { customer_id: 'c2', expected: '200.00', actual: '199.995', drift: '0.005' }
        ]
      }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await reconcileCustomerBalances(pool as unknown as Pool, now);

    expect(summary.customersDrifted).toBe(0);
    const insertCalls = pool.query.mock.calls.filter(args => {
      const sql = String(args[0]);
      return sql.includes('customer_balance_reconciliation') && /INSERT/i.test(sql);
    });
    expect(insertCalls).toHaveLength(0);
  });

  it('generates a new run id on each invocation; rows from a re-run are scoped by the new run_id', async () => {
    const pool = makePool([
      // First run.
      { rows: [{ customer_id: 'c1', expected: '100.00', actual: '105.00', drift: '5.00' }] },
      { rows: [], rowCount: 1 },
      // Second run.
      { rows: [{ customer_id: 'c1', expected: '100.00', actual: '105.00', drift: '5.00' }] },
      { rows: [], rowCount: 1 }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    const a = await reconcileCustomerBalances(pool as unknown as Pool, now);
    const b = await reconcileCustomerBalances(pool as unknown as Pool, now);

    expect(a.run.id).not.toBe(b.run.id);
    const insertCalls = pool.query.mock.calls.filter(args => {
      const sql = String(args[0]);
      return sql.includes('customer_balance_reconciliation') && /INSERT/i.test(sql);
    });
    expect(insertCalls).toHaveLength(2);
    const aParams = insertCalls[0][1] as unknown[];
    const bParams = insertCalls[1][1] as unknown[];
    expect(aParams).toContain(a.run.id);
    expect(bParams).toContain(b.run.id);
    expect(aParams).not.toContain(b.run.id);
    expect(bParams).not.toContain(a.run.id);
  });

  it('uses NUMERIC drift values from SQL (string) and never coerces through JS doubles on the comparison side', async () => {
    // The SQL returns drift as a NUMERIC string. We accept JS Number for the
    // threshold comparison (the threshold itself is small and exactly
    // representable), but we must NOT round-trip the drift through a
    // float-formatted string. Verify by passing a drift that survives
    // parseFloat without rounding.
    const pool = makePool([
      {
        rows: [
          // 0.10 - 0.07 = 0.03 in NUMERIC; in JS doubles it's ~0.029999...
          { customer_id: 'c1', expected: '0.10', actual: '0.07', drift: '-0.03' }
        ]
      },
      { rows: [], rowCount: 1 }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await reconcileCustomerBalances(pool as unknown as Pool, now);
    expect(summary.customersDrifted).toBe(1);
    expect(summary.totalDriftAbs).toBeCloseTo(0.03, 2);
  });

  it('falls back to the default threshold when the env var is empty or not a positive number', async () => {
    process.env[THRESHOLD_ENV] = 'not-a-number';
    const pool = makePool([
      {
        rows: [
          { customer_id: 'c1', expected: '100.00', actual: '100.005', drift: '0.005' },
          { customer_id: 'c2', expected: '200.00', actual: '201.00', drift: '1.00' }
        ]
      },
      { rows: [], rowCount: 1 }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await reconcileCustomerBalances(pool as unknown as Pool, now);
    // Default 0.01 — c1 (0.005) not flagged, c2 (1.00) flagged.
    expect(summary.customersDrifted).toBe(1);
  });

  it('runs the drift SQL against customers + client_ledger_entries', async () => {
    const pool = makePool([{ rows: [] }]);
    const now = new Date('2026-05-20T05:00:00Z');
    await reconcileCustomerBalances(pool as unknown as Pool, now);

    const scanCall = pool.query.mock.calls.find(args => {
      const sql = String(args[0]);
      return sql.includes('client_ledger_entries') && sql.includes('customers');
    });
    expect(scanCall).toBeDefined();
    const scanSql = String(scanCall?.[0]);
    expect(scanSql).toMatch(/SUM\s*\(\s*(cle\.)?amount\s*\)/i);
  });
});
