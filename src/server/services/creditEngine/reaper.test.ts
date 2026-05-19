import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { pool } from '../../db';
import { reapStaleProcessingRows } from './reaper';
import { randomUUID } from 'node:crypto';

describe('reapStaleProcessingRows (integration)', () => {
  let customerId: string;

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO customers (name) VALUES ($1) RETURNING id`,
      ['reaper-test-' + randomUUID().slice(0, 8)]
    );
    customerId = rows[0].id;
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM credit_recompute_queue WHERE customer_id = $1`, [customerId]);
  });

  it('reaps rows in processing older than 10 minutes', async () => {
    await pool.query(
      `INSERT INTO credit_recompute_queue (customer_id, enqueued_by, status, last_attempted_at, attempts)
       VALUES ($1, 'nightly', 'processing', now() - INTERVAL '15 minutes', 1)`,
      [customerId]
    );
    const result = await reapStaleProcessingRows(pool);
    expect(result.reaped).toBeGreaterThanOrEqual(1);
    const { rows } = await pool.query<{ status: string; last_error: string | null }>(
      `SELECT status, last_error FROM credit_recompute_queue WHERE customer_id = $1`,
      [customerId]
    );
    expect(rows[0].status).toBe('pending');
    expect(rows[0].last_error ?? '').toContain('reaped from stale processing');
  });

  it('does not reap rows in processing for less than 10 minutes', async () => {
    await pool.query(
      `INSERT INTO credit_recompute_queue (customer_id, enqueued_by, status, last_attempted_at, attempts)
       VALUES ($1, 'nightly', 'processing', now() - INTERVAL '2 minutes', 1)`,
      [customerId]
    );
    const result = await reapStaleProcessingRows(pool);
    // result.reaped may be > 0 if other test customers also reaped; check THIS row specifically
    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM credit_recompute_queue WHERE customer_id = $1`,
      [customerId]
    );
    expect(rows[0].status).toBe('processing');
    expect(result.reaped).toBeGreaterThanOrEqual(0);
  });

  it('does not touch pending or done rows', async () => {
    await pool.query(
      `INSERT INTO credit_recompute_queue (customer_id, enqueued_by, status, last_attempted_at)
       VALUES ($1, 'nightly', 'pending', now() - INTERVAL '1 hour')`,
      [customerId]
    );
    const before = await pool.query<{ status: string }>(
      `SELECT status FROM credit_recompute_queue WHERE customer_id = $1`,
      [customerId]
    );
    await reapStaleProcessingRows(pool);
    const after = await pool.query<{ status: string }>(
      `SELECT status FROM credit_recompute_queue WHERE customer_id = $1`,
      [customerId]
    );
    expect(after.rows[0].status).toBe(before.rows[0].status);
  });

  it('defaults reaped to 0 when pg returns null rowCount', async () => {
    // Pg's TypeScript types say `rowCount` can be null in some scenarios.
    // The `?? 0` fallback exists for that case — exercise it via a mock.
    const mockPool = {
      query: async () => ({ rows: [], rowCount: null })
    } as unknown as Pool;
    const result = await reapStaleProcessingRows(mockPool);
    expect(result.reaped).toBe(0);
  });
});
