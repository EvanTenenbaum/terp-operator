import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../../db';
import { computeRevenueMomentum } from './signals/revenueMomentum';
import { computeCashCollection } from './signals/cashCollection';
import { computeDebtAging } from './signals/debtAging';
import { randomUUID } from 'node:crypto';

/**
 * Reversal correctness (integration): verifies that signal queries — which all
 * apply the §1.0 universal input guard `status != 'voided'` — correctly exclude
 * voided invoices from aggregates. This test does NOT depend on commandBus
 * enqueue hooks firing; it tests the engine's reaction to schema-level state,
 * which is the contract Architect F6 requires: a post → void cycle must leave
 * signal aggregates equivalent to "the invoice never existed."
 */
describe('reversal correctness (integration)', () => {
  let customerId: string;

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO customers (name, credit_limit) VALUES ($1, 0) RETURNING id`,
      ['reversal-test-' + randomUUID().slice(0, 8)]
    );
    customerId = rows[0].id;
  });

  afterAll(async () => {
    if (!customerId) return;
    await pool.query(`DELETE FROM invoices WHERE customer_id = $1`, [customerId]);
    await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  });

  it('voided invoice excluded from signal aggregates (input-guard filter)', async () => {
    // Insert an invoice in 'voided' status directly — simulates post→void cycle.
    // Force created_at into the past so clock skew between JS Date.now() and
    // the DB clock cannot cause the `inv.created_at <= now` guard to drop the row.
    await pool.query(
      `INSERT INTO invoices (invoice_no, customer_id, status, total, amount_paid, due_date, created_at)
       VALUES ($1, $2, 'voided', 5000, 0, now() + INTERVAL '30 days', now() - INTERVAL '1 minute')`,
      ['VOID-' + randomUUID().slice(0, 8), customerId]
    );
    // Now query — the voided row must be excluded
    const rev = await computeRevenueMomentum(pool, customerId);
    expect(rev.score).toBe(50); // 50 = no data (both windows zero)
    const cash = await computeCashCollection(pool, customerId);
    expect(cash.score).toBe(50);
    const debt = await computeDebtAging(pool, customerId);
    expect(debt.score).toBe(100); // no open invoices
  });

  it('open invoice contributes; voiding it makes it disappear from aggregates', async () => {
    // Insert OPEN invoice with created_at forced into the past — same rationale
    // as above re: clock skew between Node's Date.now() and Postgres now().
    const { rows: openRows } = await pool.query<{ id: string }>(
      `INSERT INTO invoices (invoice_no, customer_id, status, total, amount_paid, due_date, created_at)
       VALUES ($1, $2, 'open', 1000, 0, now() - INTERVAL '10 days', now() - INTERVAL '1 minute') RETURNING id`,
      ['OPEN-' + randomUUID().slice(0, 8), customerId]
    );
    const invoiceId = openRows[0].id;

    // Open invoice contributes to debt aging
    const debtBefore = await computeDebtAging(pool, customerId);
    expect(debtBefore.score).toBeLessThan(100); // overdue, so score < 100
    expect(debtBefore.dataCount).toBeGreaterThan(0);

    // Now void it
    await pool.query(`UPDATE invoices SET status = 'voided' WHERE id = $1`, [invoiceId]);

    // Voided invoice no longer contributes
    const debtAfter = await computeDebtAging(pool, customerId);
    expect(debtAfter.score).toBe(100); // back to perfect — nothing open
  });
});
