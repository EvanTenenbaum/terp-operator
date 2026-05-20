import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { runNightlyCreditEngineAudit } from './nightlyCron';

/**
 * Unit tests for the Phase 9 nightly safety-net cron entry point.
 *
 * The cron:
 *   1. Calls the recompute orchestrator for all engine-eligible customers.
 *   2. Detects customers whose manual credit_limit has drifted > X% from the
 *      engine's latest recommended_limit. Configurable via
 *      `CREDIT_ENGINE_DRIFT_THRESHOLD_PCT` (default 25).
 *   3. Detects queue items stuck in 'pending'/'processing' older than X
 *      minutes. Configurable via `CREDIT_ENGINE_STUCK_AGE_MIN` (default 30).
 *   4. UPSERTs one row into `credit_engine_daily_audit` keyed by `day` so
 *      re-runs on the same day are idempotent.
 *
 * Tests mock `pool.query` so they can run without a live Postgres. The
 * recompute orchestrator (`recomputeAllCustomers`) is module-mocked because
 * it owns a complex multi-query path that's already covered by orchestrator
 * tests.
 */

vi.mock('./orchestrator', () => ({
  recomputeAllCustomers: vi.fn()
}));

import { recomputeAllCustomers } from './orchestrator';

interface MockPool {
  query: ReturnType<typeof vi.fn>;
  connect?: never;
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

const DRIFT_ENV = 'CREDIT_ENGINE_DRIFT_THRESHOLD_PCT';
const STUCK_ENV = 'CREDIT_ENGINE_STUCK_AGE_MIN';

beforeEach(() => {
  vi.mocked(recomputeAllCustomers).mockReset();
  vi.mocked(recomputeAllCustomers).mockResolvedValue({
    enqueued: 0,
    processed: 0,
    failed: 0,
    skipped: 0
  });
  delete process.env[DRIFT_ENV];
  delete process.env[STUCK_ENV];
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env[DRIFT_ENV];
  delete process.env[STUCK_ENV];
});

describe('runNightlyCreditEngineAudit', () => {
  it('returns a structured summary with all expected fields', async () => {
    const pool = makePool([]);
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await runNightlyCreditEngineAudit(pool as unknown as Pool, now);

    expect(summary.day).toBe('2026-05-20');
    expect(summary.runStartedAt).toBeInstanceOf(Date);
    expect(summary.runCompletedAt).toBeInstanceOf(Date);
    expect(typeof summary.decisionsIssued).toBe('number');
    expect(typeof summary.customersDrifted).toBe('number');
    expect(typeof summary.stuckQueueItems).toBe('number');
    expect(Array.isArray(summary.driftedCustomers)).toBe(true);
    expect(Array.isArray(summary.stuckItems)).toBe(true);
  });

  it('calls the recompute orchestrator with nightly source', async () => {
    const pool = makePool([]);
    vi.mocked(recomputeAllCustomers).mockResolvedValueOnce({
      enqueued: 12,
      processed: 11,
      failed: 1,
      skipped: 0
    });
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await runNightlyCreditEngineAudit(pool as unknown as Pool, now);

    expect(recomputeAllCustomers).toHaveBeenCalledTimes(1);
    const call = vi.mocked(recomputeAllCustomers).mock.calls[0];
    expect(call[1]).toMatchObject({ source: 'nightly' });
    expect(summary.decisionsIssued).toBe(11);
  });

  it('flags customers with drift greater than the default 25% threshold', async () => {
    const pool = makePool([
      {
        rows: [
          { customer_id: 'c1', customer_name: 'Alpha', credit_limit: '1500', recommended_limit: '1000', drift_pct: '50' },
          { customer_id: 'c2', customer_name: 'Bravo', credit_limit: '700',  recommended_limit: '1000', drift_pct: '30' },
          { customer_id: 'c3', customer_name: 'Charlie', credit_limit: '1100', recommended_limit: '1000', drift_pct: '10' }
        ]
      },
      { rows: [] },
      { rows: [], rowCount: 1 }
    ]);

    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await runNightlyCreditEngineAudit(pool as unknown as Pool, now);

    expect(summary.customersDrifted).toBe(2);
    const ids = summary.driftedCustomers.map(c => c.customerId).sort();
    expect(ids).toEqual(['c1', 'c2']);
  });

  it('respects CREDIT_ENGINE_DRIFT_THRESHOLD_PCT env override', async () => {
    process.env[DRIFT_ENV] = '40';
    const pool = makePool([
      {
        rows: [
          { customer_id: 'c1', customer_name: 'Alpha', credit_limit: '1500', recommended_limit: '1000', drift_pct: '50' },
          { customer_id: 'c2', customer_name: 'Bravo', credit_limit: '700',  recommended_limit: '1000', drift_pct: '30' }
        ]
      },
      { rows: [] },
      { rows: [], rowCount: 1 }
    ]);

    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await runNightlyCreditEngineAudit(pool as unknown as Pool, now);
    expect(summary.customersDrifted).toBe(1);
    expect(summary.driftedCustomers[0].customerId).toBe('c1');
  });

  it('detects queue items older than the default 30 min stuck threshold', async () => {
    const pool = makePool([
      { rows: [] },
      {
        rows: [
          { id: '101', customer_id: 'c1', status: 'pending', enqueued_at: new Date('2026-05-20T04:00:00Z'), attempts: 0, age_minutes: '65' },
          { id: '102', customer_id: 'c2', status: 'processing', enqueued_at: new Date('2026-05-20T04:15:00Z'), attempts: 2, age_minutes: '45' }
        ]
      },
      { rows: [], rowCount: 1 }
    ]);

    const now = new Date('2026-05-20T05:05:00Z');
    const summary = await runNightlyCreditEngineAudit(pool as unknown as Pool, now);
    expect(summary.stuckQueueItems).toBe(2);
    expect(summary.stuckItems).toHaveLength(2);
    expect(summary.stuckItems[0]).toMatchObject({ id: '101', status: 'pending' });
  });

  it('honors CREDIT_ENGINE_STUCK_AGE_MIN env override in the SQL parameter', async () => {
    process.env[STUCK_ENV] = '90';
    const pool = makePool([
      { rows: [] },
      { rows: [] },
      { rows: [], rowCount: 1 }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    await runNightlyCreditEngineAudit(pool as unknown as Pool, now);

    const stuckCall = pool.query.mock.calls.find(args => {
      const sql = String(args[0]);
      return sql.includes('credit_recompute_queue') && sql.includes('last_attempted_at');
    });
    expect(stuckCall).toBeDefined();
    const params = stuckCall?.[1] as unknown[] | undefined;
    expect(params).toContain(90);
  });

  it('writes exactly one upsert row to credit_engine_daily_audit', async () => {
    const pool = makePool([
      { rows: [] },
      { rows: [] },
      { rows: [], rowCount: 1 }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    await runNightlyCreditEngineAudit(pool as unknown as Pool, now);

    const upsertCalls = pool.query.mock.calls.filter(args => {
      const sql = String(args[0]);
      return sql.includes('credit_engine_daily_audit') && sql.includes('INSERT');
    });
    expect(upsertCalls).toHaveLength(1);
    const sql = String(upsertCalls[0][0]);
    expect(sql).toMatch(/ON CONFLICT\s*\(\s*day\s*\)\s*DO UPDATE/i);
  });

  it('passes day, counts, started/completed and summary jsonb to the upsert', async () => {
    const pool = makePool([
      { rows: [{ customer_id: 'c1', customer_name: 'Alpha', credit_limit: '1500', recommended_limit: '1000', drift_pct: '50' }] },
      { rows: [{ id: '101', customer_id: 'c1', status: 'pending', enqueued_at: new Date('2026-05-20T04:00:00Z'), attempts: 0, age_minutes: '65' }] },
      { rows: [], rowCount: 1 }
    ]);
    vi.mocked(recomputeAllCustomers).mockResolvedValueOnce({
      enqueued: 5,
      processed: 4,
      failed: 0,
      skipped: 1
    });

    const now = new Date('2026-05-20T05:00:00Z');
    await runNightlyCreditEngineAudit(pool as unknown as Pool, now);

    const upsertCall = pool.query.mock.calls.find(args => {
      const sql = String(args[0]);
      return sql.includes('credit_engine_daily_audit') && sql.includes('INSERT');
    });
    expect(upsertCall).toBeDefined();
    const params = upsertCall?.[1] as unknown[];
    expect(params[0]).toBe('2026-05-20');
    expect(params[1]).toBe(4);
    expect(params[2]).toBe(1);
    expect(params[3]).toBe(1);
    expect(params[4]).toBeInstanceOf(Date);
    expect(params[5]).toBeInstanceOf(Date);
    expect(typeof params[6]).toBe('string');
    const summaryJson = JSON.parse(String(params[6]));
    expect(summaryJson.drifted).toHaveLength(1);
    expect(summaryJson.stuck).toHaveLength(1);
    expect(summaryJson.recompute).toMatchObject({ enqueued: 5, processed: 4, failed: 0, skipped: 1 });
  });

  it('is idempotent when invoked twice for the same day (each call upserts one row)', async () => {
    const pool = makePool([
      { rows: [] }, { rows: [] }, { rows: [], rowCount: 1 },
      { rows: [] }, { rows: [] }, { rows: [], rowCount: 1 }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    const a = await runNightlyCreditEngineAudit(pool as unknown as Pool, now);
    const b = await runNightlyCreditEngineAudit(pool as unknown as Pool, now);
    expect(a.day).toBe(b.day);
    const upsertCalls = pool.query.mock.calls.filter(args => {
      const sql = String(args[0]);
      return sql.includes('credit_engine_daily_audit') && sql.includes('INSERT');
    });
    expect(upsertCalls).toHaveLength(2);
    expect(upsertCalls[0][1]?.[0]).toBe(upsertCalls[1][1]?.[0]);
  });

  it('continues past zero drifts and zero stuck items without errors', async () => {
    const pool = makePool([
      { rows: [] }, { rows: [] }, { rows: [], rowCount: 1 }
    ]);
    const now = new Date('2026-05-20T05:00:00Z');
    const summary = await runNightlyCreditEngineAudit(pool as unknown as Pool, now);
    expect(summary.customersDrifted).toBe(0);
    expect(summary.stuckQueueItems).toBe(0);
    expect(summary.driftedCustomers).toEqual([]);
    expect(summary.stuckItems).toEqual([]);
  });
});
