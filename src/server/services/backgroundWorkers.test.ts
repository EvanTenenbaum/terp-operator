import { describe, it, expect, afterEach } from 'vitest';
import {
  backgroundWorkersEnabled,
  drainCreditQueueOnce,
  getWorkerStatus,
  nightlyDue,
  startBackgroundWorkers,
  stopBackgroundWorkers
} from './backgroundWorkers';
import type { Pool } from 'pg';

afterEach(() => {
  stopBackgroundWorkers();
  delete process.env.BACKGROUND_WORKERS;
});

describe('backgroundWorkersEnabled (env gate)', () => {
  it('defaults to enabled — the review-fix posture', () => {
    delete process.env.BACKGROUND_WORKERS;
    expect(backgroundWorkersEnabled()).toBe(true);
  });
  it('respects BACKGROUND_WORKERS=false for external-scheduler deployments', () => {
    process.env.BACKGROUND_WORKERS = 'false';
    expect(backgroundWorkersEnabled()).toBe(false);
  });
  it('treats any non-true value as disabled', () => {
    process.env.BACKGROUND_WORKERS = '0';
    expect(backgroundWorkersEnabled()).toBe(false);
  });
});

describe('nightlyDue (once-per-UTC-day gate)', () => {
  it('is not due before the configured UTC hour', () => {
    expect(nightlyDue(new Date('2026-06-12T03:00:00Z'), null, 9)).toBe(false);
  });
  it('is due at/after the hour when not yet run today', () => {
    expect(nightlyDue(new Date('2026-06-12T09:05:00Z'), null, 9)).toBe(true);
    expect(nightlyDue(new Date('2026-06-12T23:59:00Z'), '2026-06-11', 9)).toBe(true);
  });
  it('is not due again on the same UTC day', () => {
    expect(nightlyDue(new Date('2026-06-12T10:00:00Z'), '2026-06-12', 9)).toBe(false);
  });
});

describe('startBackgroundWorkers', () => {
  it('no-ops when disabled and does not flip the status flag', () => {
    process.env.BACKGROUND_WORKERS = 'false';
    startBackgroundWorkers({} as unknown as Pool);
    expect(getWorkerStatus().enabled).toBe(false);
  });
  it('is idempotent when enabled (single registration per process)', () => {
    delete process.env.BACKGROUND_WORKERS;
    const fakePool = { connect: async () => ({ query: async () => ({ rows: [{ locked: false }] }), release: () => {} }) } as unknown as Pool;
    startBackgroundWorkers(fakePool);
    const startedAt = getWorkerStatus().startedAt;
    startBackgroundWorkers(fakePool);
    expect(getWorkerStatus().startedAt).toBe(startedAt);
    expect(getWorkerStatus().enabled).toBe(true);
  });
});

describe('drainCreditQueueOnce', () => {
  it('stops immediately on an empty queue without touching the worker', async () => {
    const calls: string[] = [];
    const fakePool = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rows: [] };
      }
    } as unknown as Pool;
    const processed = await drainCreditQueueOnce(fakePool, 10);
    expect(processed).toBe(0);
    expect(calls.length).toBe(1); // one SELECT, no loop
  });

  it('respects the batch cap', async () => {
    let drainSelects = 0;
    const fakePool = {
      query: async (sql: string) => {
        if (sql.includes('SELECT id FROM credit_recompute_queue')) {
          drainSelects++;
          // always pretend a pending row exists so the loop only stops at the cap
          return { rows: [{ id: `row-${drainSelects}` }], rowCount: 1 };
        }
        // processOneRecompute's claim UPDATE: report the row already claimed
        // (rowCount 0) so it returns skipped without needing a live DB.
        return { rows: [], rowCount: 0 };
      }
    } as unknown as Pool;
    const processed = await drainCreditQueueOnce(fakePool, 3);
    expect(processed).toBe(0); // every row reported skipped
    expect(drainSelects).toBe(3); // capped at batchMax
  });
});
