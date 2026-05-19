import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { pool } from '../../db';
import { enqueueCustomerRecompute, enqueueAllCustomers } from './enqueue';
import { randomUUID } from 'node:crypto';

describe('enqueueCustomerRecompute (integration)', () => {
  let customerId: string;

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO customers (name) VALUES ($1) RETURNING id`,
      ['enqueue-test-customer-' + randomUUID().slice(0, 8)]
    );
    customerId = rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM credit_recompute_queue WHERE customer_id = $1`, [customerId]);
    await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM credit_recompute_queue WHERE customer_id = $1`, [customerId]);
  });

  it('inserts a pending row', async () => {
    await enqueueCustomerRecompute(pool, customerId, 'nightly', null);
    const { rows } = await pool.query<{ customer_id: string; status: string; enqueued_by: string }>(
      `SELECT customer_id, status, enqueued_by FROM credit_recompute_queue WHERE customer_id = $1`,
      [customerId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].enqueued_by).toBe('nightly');
  });

  it('is idempotent: enqueueing twice for same customer leaves one pending row', async () => {
    await enqueueCustomerRecompute(pool, customerId, 'event:postSalesOrder', null);
    await enqueueCustomerRecompute(pool, customerId, 'event:recordPayment', null);
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM credit_recompute_queue WHERE customer_id = $1 AND status = 'pending'`,
      [customerId]
    );
    expect(rows[0].count).toBe('1');
  });

  it('accepts and stores commandId when provided', async () => {
    const { rows: cjRows } = await pool.query<{ id: string }>(
      `SELECT id FROM command_journal LIMIT 1`
    );
    if (cjRows.length === 0) {
      // No commands journaled yet in this test DB; skip null-FK test
      return;
    }
    const commandId = cjRows[0].id;
    await enqueueCustomerRecompute(pool, customerId, 'manualTrigger', commandId);
    const { rows } = await pool.query<{ command_id: string | null }>(
      `SELECT command_id FROM credit_recompute_queue WHERE customer_id = $1`,
      [customerId]
    );
    expect(rows[0].command_id).toBe(commandId);
  });
});

// Designed to be safe under file parallelism: instead of `DELETE FROM
// credit_recompute_queue` (which races with sibling test files), we assert
// on the queue rows owned by test-scoped customers we create here. The
// function's "all customers" semantics are verified by tracking the
// pending-row counts for those scoped customers before/after the call.
describe('enqueueAllCustomers (integration)', () => {
  const scopedCustomerIds: string[] = [];

  beforeAll(async () => {
    // Create 3 scoped customers we own; we'll assert on these specifically
    // rather than touching every row in the queue table.
    for (let i = 0; i < 3; i++) {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO customers (name) VALUES ($1) RETURNING id`,
        ['enqueueAll-test-' + randomUUID().slice(0, 8)]
      );
      scopedCustomerIds.push(rows[0].id);
    }
  });

  afterAll(async () => {
    if (scopedCustomerIds.length === 0) return;
    await pool.query(
      `DELETE FROM credit_recompute_queue WHERE customer_id = ANY($1::uuid[])`,
      [scopedCustomerIds]
    );
    await pool.query(`DELETE FROM customers WHERE id = ANY($1::uuid[])`, [scopedCustomerIds]);
  });

  beforeEach(async () => {
    // Clear queue rows for ONLY our scoped customers — leaves other files'
    // rows alone.
    await pool.query(
      `DELETE FROM credit_recompute_queue WHERE customer_id = ANY($1::uuid[])`,
      [scopedCustomerIds]
    );
  });

  it('enqueues all customers when no filter (covers scoped customers)', async () => {
    await enqueueAllCustomers(pool, 'nightly');
    // All 3 scoped customers must now have a pending row.
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
         FROM credit_recompute_queue
        WHERE customer_id = ANY($1::uuid[]) AND status = 'pending'`,
      [scopedCustomerIds]
    );
    expect(Number(rows[0].cnt)).toBe(scopedCustomerIds.length);
  });

  it('is idempotent for scoped customers (second call inserts none for them)', async () => {
    await enqueueAllCustomers(pool, 'nightly');
    const { rows: before } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM credit_recompute_queue
        WHERE customer_id = ANY($1::uuid[])`,
      [scopedCustomerIds]
    );
    await enqueueAllCustomers(pool, 'nightly');
    const { rows: after } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM credit_recompute_queue
        WHERE customer_id = ANY($1::uuid[])`,
      [scopedCustomerIds]
    );
    expect(after[0].cnt).toBe(before[0].cnt);
  });

  it('respects stanceId filter', async () => {
    const stanceRes = await pool.query<{ id: string }>(
      `SELECT id FROM credit_engine_stances WHERE name='Balanced'`
    );
    const stanceId = stanceRes.rows[0].id;
    // None of our scoped customers have stance_id set → filter selects 0 of them.
    await enqueueAllCustomers(pool, 'event:stanceEdited', { stanceId });
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM credit_recompute_queue
        WHERE customer_id = ANY($1::uuid[]) AND status = 'pending'`,
      [scopedCustomerIds]
    );
    expect(Number(rows[0].cnt)).toBe(0);
  });

  it('respects skipEngineDisabled filter', async () => {
    // None of our scoped customers are disabled → all 3 still enqueue.
    await enqueueAllCustomers(pool, 'nightly', { skipEngineDisabled: true });
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM credit_recompute_queue
        WHERE customer_id = ANY($1::uuid[]) AND status = 'pending'`,
      [scopedCustomerIds]
    );
    expect(Number(rows[0].cnt)).toBe(scopedCustomerIds.length);
  });

  it('defaults enqueued to 0 when pg returns null rowCount', async () => {
    // Defensive `?? 0` fallback for pg's typed `rowCount: number | null`.
    const mockPool = {
      query: async () => ({ rows: [], rowCount: null })
    } as unknown as Pool;
    const result = await enqueueAllCustomers(mockPool, 'nightly');
    expect(result.enqueued).toBe(0);
  });
});
