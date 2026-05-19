import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../../db';
import { enqueueCustomerRecompute } from './enqueue';
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
