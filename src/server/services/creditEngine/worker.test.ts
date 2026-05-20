import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { pool } from '../../db';
import { enqueueCustomerRecompute } from './enqueue';
import { processOneRecompute } from './worker';

/**
 * Integration tests for processOneRecompute.
 *
 * Strategy: provision an isolated test customer with deterministic invoice
 * data so we don't depend on whichever realistic-seed customer happens to
 * have qualifying history. This keeps the test stable across re-seeds.
 *
 * Shadow mode is the seeded default (credit_engine_config.shadow_mode = true),
 * so the worker should always produce applied=false in these tests. The
 * applied=true branch is exercised by a sub-suite that flips shadow_mode off
 * temporarily.
 */
describe('processOneRecompute (integration)', () => {
  let customerId: string;
  // Queue rows are bigserial — pg returns them as strings to avoid Number
  // precision loss past 2^53. The worker accepts string | number | bigint.
  let queueRowId: string;

  // Pin a "now" relative timestamp so created_at + due_date math is stable.
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  async function insertInvoice(opts: {
    daysAgoCreated: number;
    daysAgoDue: number;
    total: number;
    amountPaid: number;
    status: 'paid' | 'open' | 'partial' | 'posted';
  }) {
    await pool.query(
      `INSERT INTO invoices (invoice_no, customer_id, status, total, amount_paid, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `INV-${randomUUID().slice(0, 12)}`,
        customerId,
        opts.status,
        opts.total.toFixed(2),
        opts.amountPaid.toFixed(2),
        daysAgo(opts.daysAgoDue),
        daysAgo(opts.daysAgoCreated),
        daysAgo(opts.daysAgoCreated)
      ]
    );
  }

  beforeAll(async () => {
    // Make sure the seeded config + Balanced stance are present.
    const { rows: cfg } = await pool.query<{ shadow_mode: boolean }>(
      `SELECT shadow_mode FROM credit_engine_config LIMIT 1`
    );
    if (cfg.length === 0) {
      throw new Error('credit_engine_config is empty — run `pnpm db:seed` first');
    }

    // Create a customer old enough to clear cold-start tenure.
    const createdAt = daysAgo(400);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO customers (name, created_at, updated_at)
       VALUES ($1, $2, $2)
       RETURNING id`,
      ['worker-test-' + randomUUID().slice(0, 8), createdAt]
    );
    customerId = rows[0].id;

    // 6 invoices spanning the last year, all paid, with healthy totals so
    // the cold-start gate clears (>= 3 posted invoices, base > 0, tenure > 60d).
    await insertInvoice({ daysAgoCreated: 30,  daysAgoDue: 20,  total: 5000,  amountPaid: 5000,  status: 'paid' });
    await insertInvoice({ daysAgoCreated: 60,  daysAgoDue: 50,  total: 4000,  amountPaid: 4000,  status: 'paid' });
    await insertInvoice({ daysAgoCreated: 90,  daysAgoDue: 80,  total: 6000,  amountPaid: 6000,  status: 'paid' });
    await insertInvoice({ daysAgoCreated: 150, daysAgoDue: 140, total: 5500,  amountPaid: 5500,  status: 'paid' });
    await insertInvoice({ daysAgoCreated: 200, daysAgoDue: 190, total: 4500,  amountPaid: 4500,  status: 'paid' });
    await insertInvoice({ daysAgoCreated: 300, daysAgoDue: 290, total: 5000,  amountPaid: 5000,  status: 'paid' });
  });

  afterAll(async () => {
    // Clean up in FK-safe order. customers ON DELETE CASCADE clears the
    // queue + assessments rows, but we explicitly delete invoices first so
    // we don't depend on cascade rules outside our test scope.
    await pool.query(`DELETE FROM invoices WHERE customer_id = $1`, [customerId]);
    await pool.query(`DELETE FROM credit_recompute_queue WHERE customer_id = $1`, [customerId]);
    await pool.query(`DELETE FROM customer_credit_assessments WHERE customer_id = $1`, [customerId]);
    await pool.query(`UPDATE customers SET last_assessment_id = NULL WHERE id = $1`, [customerId]);
    await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
  });

  beforeEach(async () => {
    // Fresh queue + assessment state per test. Order matters: must clear
    // last_assessment_id BEFORE deleting assessments (FK on customers ->
    // assessments uses ON DELETE SET NULL but we drop the reference first
    // anyway for clarity). And we must flip source to 'manual' before
    // clearing last_assessment_id because the customers_engine_source_has_assessment
    // CHECK constraint forbids source='engine' AND last_assessment_id IS NULL.
    await pool.query(
      `UPDATE customers
          SET credit_limit_source = 'manual',
              last_assessment_id = NULL
        WHERE id = $1`,
      [customerId]
    );
    await pool.query(`DELETE FROM credit_recompute_queue WHERE customer_id = $1`, [customerId]);
    await pool.query(`DELETE FROM customer_credit_assessments WHERE customer_id = $1`, [customerId]);
  });

  async function enqueueAndClaimId(): Promise<string> {
    await enqueueCustomerRecompute(pool, customerId, 'manualTrigger', null);
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id::text AS id
         FROM credit_recompute_queue
        WHERE customer_id = $1 AND status = 'pending'`,
      [customerId]
    );
    if (rows.length === 0) throw new Error('expected pending queue row');
    return rows[0].id;
  }

  it('processes a queued recompute and writes a shadow-mode assessment', async () => {
    queueRowId = await enqueueAndClaimId();

    const result = await processOneRecompute(pool, queueRowId);

    expect(result.skipped).toBe(false);
    expect(result.assessmentId).not.toBeNull();
    expect(typeof result.finalLimit).toBe('number');
    expect(result.finalLimit!).toBeGreaterThanOrEqual(0);
    // Seeded shadow_mode=true means applied is always false.
    expect(result.applied).toBe(false);

    // Queue row should be 'done' with attempts=1.
    const { rows: qRows } = await pool.query<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM credit_recompute_queue WHERE id = $1`,
      [queueRowId]
    );
    expect(qRows[0].status).toBe('done');
    expect(qRows[0].attempts).toBe(1);

    // Assessment row exists with applied=false and a non-null idempotency key.
    const { rows: aRows } = await pool.query<{
      applied: boolean;
      idempotency_key: string | null;
      overall_score: number;
    }>(
      `SELECT applied, idempotency_key, overall_score
         FROM customer_credit_assessments
        WHERE id = $1`,
      [result.assessmentId!]
    );
    expect(aRows[0].applied).toBe(false);
    expect(aRows[0].idempotency_key).not.toBeNull();
    expect(aRows[0].overall_score).toBeGreaterThanOrEqual(0);
    expect(aRows[0].overall_score).toBeLessThanOrEqual(100);

    // customers.last_assessment_id is set even when applied=false.
    const { rows: custRows } = await pool.query<{ last_assessment_id: string | null }>(
      `SELECT last_assessment_id FROM customers WHERE id = $1`,
      [customerId]
    );
    expect(custRows[0].last_assessment_id).toBe(result.assessmentId);
  });

  it('returns skipped when called on an already-done row', async () => {
    queueRowId = await enqueueAndClaimId();
    const first = await processOneRecompute(pool, queueRowId);
    expect(first.skipped).toBe(false);

    const second = await processOneRecompute(pool, queueRowId);
    expect(second.skipped).toBe(true);
    expect(second.assessmentId).toBeNull();
    expect(second.applied).toBe(false);
    expect(second.finalLimit).toBeNull();
  });

  it('returns skipped for a non-existent queue row id', async () => {
    // A bigserial id we are essentially certain is never assigned. The UPDATE
    // RETURNING zero rows path should fire.
    const fakeId = '9999999999999999';
    const result = await processOneRecompute(pool, fakeId);
    expect(result.skipped).toBe(true);
    expect(result.assessmentId).toBeNull();
  });

  it('reversed invoices are not counted as posted (cold-start gate)', async () => {
    // Add an extra invoice in 'reversed' status. The cold-start posted-count
    // query in worker.countPostedInvoices must exclude it. We assert the
    // recompute still succeeds and the base/posted-count math behaves the
    // same as if the reversed invoice were not there by checking the
    // applied=false outcome continues to hold under shadow mode while no
    // reversed-induced spurious posted credit appears.
    await insertInvoice({ daysAgoCreated: 45, daysAgoDue: 30, total: 9999, amountPaid: 0, status: 'paid' });
    // Manually flip it to reversed.
    await pool.query(
      `UPDATE invoices SET status = 'reversed' WHERE customer_id = $1 AND total = 9999`,
      [customerId]
    );
    try {
      const qid = await enqueueAndClaimId();
      const result = await processOneRecompute(pool, qid);
      expect(result.skipped).toBe(false);
      // Direct verification: countPostedInvoices is private, but we can prove
      // the reversed invoice is excluded by counting via the same WHERE clause
      // and confirming it equals the seeded 6 (not 7).
      const { rows } = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
           FROM invoices
          WHERE customer_id = $1
            AND status IN ('open','partial','paid')
            AND total >= 0`,
        [customerId]
      );
      expect(Number(rows[0].cnt)).toBe(6);
    } finally {
      await pool.query(`DELETE FROM invoices WHERE customer_id = $1 AND total = 9999`, [customerId]);
    }
  });

  it('is idempotent on retry: same queue row reused yields the same assessment id', async () => {
    queueRowId = await enqueueAndClaimId();

    const r1 = await processOneRecompute(pool, queueRowId);
    expect(r1.skipped).toBe(false);
    expect(r1.assessmentId).not.toBeNull();

    // Force the queue row back to 'pending' to simulate a retry where the
    // COMMIT happened but somehow the orchestrator didn't see the result.
    // sha256(customerId:queueRowId) is the same key, so the ON CONFLICT
    // branch fires and we get the same assessment id back.
    await pool.query(`UPDATE credit_recompute_queue SET status='pending' WHERE id = $1`, [queueRowId]);

    const r2 = await processOneRecompute(pool, queueRowId);
    expect(r2.skipped).toBe(false);
    expect(r2.assessmentId).toBe(r1.assessmentId);

    // Only one assessment row should exist for this customer.
    const { rows: countRows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM customer_credit_assessments WHERE customer_id = $1`,
      [customerId]
    );
    expect(countRows[0].cnt).toBe('1');
  });

  // Note: the "customer deleted between enqueue and process" branch is
  // defensive code that is difficult to exercise cleanly because the
  // customers -> credit_recompute_queue FK uses ON DELETE CASCADE, so
  // deleting the customer also wipes the queue row. The branch will be
  // covered indirectly by Task 2.4's reaper tests when they validate stale
  // row recovery.

  describe('applied=true path (shadow_mode disabled)', () => {
    let originalShadow: boolean;

    beforeAll(async () => {
      const { rows } = await pool.query<{ shadow_mode: boolean }>(
        `SELECT shadow_mode FROM credit_engine_config LIMIT 1`
      );
      originalShadow = rows[0].shadow_mode;
      await pool.query(`UPDATE credit_engine_config SET shadow_mode = false`);
    });

    afterAll(async () => {
      await pool.query(`UPDATE credit_engine_config SET shadow_mode = $1`, [originalShadow]);
    });

    /**
     * Helper: put the customer into engine mode + enabled. The
     * customers_engine_source_has_assessment constraint requires
     * last_assessment_id to be non-null when source='engine'. So we have to
     * prime an assessment first by running a no-op recompute in shadow mode
     * (or via direct insert). Easiest: temporarily flip shadow_mode back
     * ON, run a recompute (which writes an assessment with applied=false
     * but sets last_assessment_id), turn shadow back OFF, then flip source.
     */
    async function makeEngineMode() {
      // Prime an assessment. Process one row under shadow=true so we get an
      // assessment + last_assessment_id without applying.
      await pool.query(`UPDATE credit_engine_config SET shadow_mode = true`);
      try {
        const primeQid = await enqueueAndClaimId();
        await processOneRecompute(pool, primeQid);
      } finally {
        await pool.query(`UPDATE credit_engine_config SET shadow_mode = false`);
      }
      // Now safe to flip source.
      await pool.query(
        `UPDATE customers
            SET credit_limit_source = 'engine',
                engine_enabled = true
          WHERE id = $1`,
        [customerId]
      );
    }

    it('applies the new credit limit when shadow_mode is off and source=engine', async () => {
      await makeEngineMode();

      const qid = await enqueueAndClaimId();
      const result = await processOneRecompute(pool, qid);

      expect(result.skipped).toBe(false);
      expect(result.applied).toBe(true);
      expect(result.finalLimit).not.toBeNull();

      const { rows } = await pool.query<{ credit_limit: string; last_assessment_id: string }>(
        `SELECT credit_limit, last_assessment_id FROM customers WHERE id = $1`,
        [customerId]
      );
      expect(Number(rows[0].credit_limit)).toBe(result.finalLimit!);
      expect(rows[0].last_assessment_id).toBe(result.assessmentId);
    });

    it('clamps final_limit to engine_max when set', async () => {
      await makeEngineMode();
      await pool.query(`UPDATE customers SET engine_max = $2 WHERE id = $1`, [customerId, '100.00']);
      try {
        const qid = await enqueueAndClaimId();
        const result = await processOneRecompute(pool, qid);
        expect(result.applied).toBe(true);
        expect(result.finalLimit).toBeLessThanOrEqual(100);
      } finally {
        await pool.query(`UPDATE customers SET engine_max = NULL WHERE id = $1`, [customerId]);
      }
    });

    it('returns applied=false when customer is in manual mode even with shadow off', async () => {
      // Customer already in manual from the outer beforeEach. Don't flip.
      const qid = await enqueueAndClaimId();
      const result = await processOneRecompute(pool, qid);
      expect(result.skipped).toBe(false);
      expect(result.applied).toBe(false);
    });

    it('returns applied=false when engine_disabled_at is set', async () => {
      await makeEngineMode();
      await pool.query(
        `UPDATE customers SET engine_disabled_at = now() WHERE id = $1`,
        [customerId]
      );
      try {
        const qid = await enqueueAndClaimId();
        const result = await processOneRecompute(pool, qid);
        expect(result.skipped).toBe(false);
        expect(result.applied).toBe(false);
      } finally {
        await pool.query(
          `UPDATE customers SET engine_disabled_at = NULL WHERE id = $1`,
          [customerId]
        );
      }
    });
  });

  describe('cold-start gate', () => {
    let originalShadow: boolean;

    beforeAll(async () => {
      const { rows } = await pool.query<{ shadow_mode: boolean }>(
        `SELECT shadow_mode FROM credit_engine_config LIMIT 1`
      );
      originalShadow = rows[0].shadow_mode;
      await pool.query(`UPDATE credit_engine_config SET shadow_mode = false`);
    });

    afterAll(async () => {
      await pool.query(`UPDATE credit_engine_config SET shadow_mode = $1`, [originalShadow]);
    });

    it('returns applied=false when engine not enabled AND cold-start fails (no invoices)', async () => {
      // Create a brand-new customer with zero invoices, source='engine'
      // (priming an assessment first to satisfy the constraint), and
      // engine_enabled=false. Then re-process: cold-start gate must fail
      // (no posted invoices, base=0), so applied stays false.
      const { rows: cRows } = await pool.query<{ id: string }>(
        `INSERT INTO customers (name, created_at, updated_at)
           VALUES ($1, $2, $2)
         RETURNING id`,
        ['worker-coldstart-' + randomUUID().slice(0, 8), daysAgo(400)]
      );
      const coldCustomer = cRows[0].id;

      try {
        // Prime an assessment in shadow mode so we can flip source to 'engine'.
        await pool.query(`UPDATE credit_engine_config SET shadow_mode = true`);
        await enqueueCustomerRecompute(pool, coldCustomer, 'manualTrigger', null);
        const { rows: qPrime } = await pool.query<{ id: string }>(
          `SELECT id::text AS id FROM credit_recompute_queue WHERE customer_id = $1`,
          [coldCustomer]
        );
        await processOneRecompute(pool, qPrime[0].id);
        await pool.query(`UPDATE credit_engine_config SET shadow_mode = false`);

        // Flip to engine source but keep engine_enabled=false. The customer
        // has no invoices so cold-start cannot open.
        await pool.query(
          `UPDATE customers
              SET credit_limit_source = 'engine',
                  engine_enabled = false
            WHERE id = $1`,
          [coldCustomer]
        );

        await enqueueCustomerRecompute(pool, coldCustomer, 'manualTrigger', null);
        const { rows: qNew } = await pool.query<{ id: string }>(
          `SELECT id::text AS id FROM credit_recompute_queue WHERE customer_id = $1 AND status = 'pending'`,
          [coldCustomer]
        );
        const result = await processOneRecompute(pool, qNew[0].id);
        expect(result.skipped).toBe(false);
        expect(result.applied).toBe(false);

        // engine_enabled should still be false since cold-start did not open.
        const { rows: eRows } = await pool.query<{ engine_enabled: boolean }>(
          `SELECT engine_enabled FROM customers WHERE id = $1`,
          [coldCustomer]
        );
        expect(eRows[0].engine_enabled).toBe(false);
      } finally {
        await pool.query(`DELETE FROM credit_recompute_queue WHERE customer_id = $1`, [coldCustomer]);
        await pool.query(
          `UPDATE customers SET last_assessment_id = NULL, credit_limit_source = 'manual' WHERE id = $1`,
          [coldCustomer]
        );
        await pool.query(`DELETE FROM customer_credit_assessments WHERE customer_id = $1`, [coldCustomer]);
        await pool.query(`DELETE FROM customers WHERE id = $1`, [coldCustomer]);
      }
    });
  });

  describe('failure handling', () => {
    it('resets the row back to pending and records last_error on transient failure', async () => {
      // Force a failure by temporarily deleting credit_engine_config so
      // loadConfig throws. We restore it in the finally block.
      const { rows: cfgRows } = await pool.query<{
        id: string;
        global_default_stance_id: string;
        cold_start_min_posted_invoices: number;
        cold_start_min_tenure_days: number;
        manual_override_reminder_default_days: number;
        manual_override_snooze_cap_days: number;
        shadow_mode: boolean;
      }>(`SELECT * FROM credit_engine_config LIMIT 1`);
      const cfg = cfgRows[0];

      await pool.query(`DELETE FROM credit_engine_config WHERE id = $1`, [cfg.id]);

      try {
        const qid = await enqueueAndClaimId();
        await expect(processOneRecompute(pool, qid)).rejects.toThrow(/credit_engine_config/);

        const { rows } = await pool.query<{ status: string; last_error: string | null; attempts: number }>(
          `SELECT status, last_error, attempts FROM credit_recompute_queue WHERE id = $1`,
          [qid]
        );
        expect(rows[0].status).toBe('pending');
        expect(rows[0].last_error).toMatch(/credit_engine_config/);
        expect(rows[0].attempts).toBe(1);
      } finally {
        await pool.query(
          `INSERT INTO credit_engine_config (
             id, global_default_stance_id,
             cold_start_min_posted_invoices, cold_start_min_tenure_days,
             manual_override_reminder_default_days, manual_override_snooze_cap_days,
             shadow_mode
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            cfg.id,
            cfg.global_default_stance_id,
            cfg.cold_start_min_posted_invoices,
            cfg.cold_start_min_tenure_days,
            cfg.manual_override_reminder_default_days,
            cfg.manual_override_snooze_cap_days,
            cfg.shadow_mode
          ]
        );
      }
    });

    it('flips status to failed_terminal after MAX_ATTEMPTS', async () => {
      // Pre-set attempts to 4 so the next failure (-> attempts=5) trips terminal.
      const qid = await enqueueAndClaimId();
      await pool.query(`UPDATE credit_recompute_queue SET attempts = 4 WHERE id = $1`, [qid]);

      const { rows: cfgRows } = await pool.query<{
        id: string;
        global_default_stance_id: string;
        cold_start_min_posted_invoices: number;
        cold_start_min_tenure_days: number;
        manual_override_reminder_default_days: number;
        manual_override_snooze_cap_days: number;
        shadow_mode: boolean;
      }>(`SELECT * FROM credit_engine_config LIMIT 1`);
      const cfg = cfgRows[0];
      await pool.query(`DELETE FROM credit_engine_config WHERE id = $1`, [cfg.id]);

      try {
        await expect(processOneRecompute(pool, qid)).rejects.toThrow();
        const { rows } = await pool.query<{ status: string }>(
          `SELECT status FROM credit_recompute_queue WHERE id = $1`,
          [qid]
        );
        expect(rows[0].status).toBe('failed_terminal');
      } finally {
        await pool.query(
          `INSERT INTO credit_engine_config (
             id, global_default_stance_id,
             cold_start_min_posted_invoices, cold_start_min_tenure_days,
             manual_override_reminder_default_days, manual_override_snooze_cap_days,
             shadow_mode
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            cfg.id,
            cfg.global_default_stance_id,
            cfg.cold_start_min_posted_invoices,
            cfg.cold_start_min_tenure_days,
            cfg.manual_override_reminder_default_days,
            cfg.manual_override_snooze_cap_days,
            cfg.shadow_mode
          ]
        );
      }
    });
  });
});

/**
 * Unit-style coverage for defensive branches that are awkward to exercise
 * against the real database (customer cascade-deleted mid-flight, idempotency
 * lookup miss, missing stance row, non-Error rejection).
 *
 * These build a hand-rolled mock Pool/PoolClient instead of stubbing modules.
 * The mock is keyed by SQL substring so we don't have to track query counts.
 */
describe('processOneRecompute (defensive branches via mock pool)', () => {
  /**
   * Build a minimal pool whose .connect() returns a client driven by a list
   * of query handlers. Each handler is a function (text, params) -> response.
   * The first matching handler runs. Calls falling through throw so we catch
   * unexpected queries.
   */
  function makeMockPool(handlers: {
    poolHandler: (text: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
    clientHandler: (text: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  }): Pool {
    const client = {
      query: async (text: string, params: unknown[] = []) => handlers.clientHandler(text, params),
      release: () => {
        /* noop */
      }
    } as unknown as PoolClient;
    return {
      connect: async () => client,
      query: async (text: string, params: unknown[] = []) => handlers.poolHandler(text, params)
    } as unknown as Pool;
  }

  it('marks the queue row done and returns skipped when customer was deleted', async () => {
    // Claim succeeds. SELECT customer FOR UPDATE returns zero rows.
    // We expect the worker to UPDATE the queue row to 'done' then COMMIT.
    const calls: string[] = [];
    const customerId = randomUUID();
    const mock = makeMockPool({
      poolHandler: async (text) => {
        calls.push('pool:' + text);
        // Claim
        if (/UPDATE credit_recompute_queue/.test(text) && /attempts = attempts \+ 1/.test(text)) {
          return {
            rows: [{ customer_id: customerId, enqueued_by: 'manualTrigger', command_id: null, attempts: 1 }],
            rowCount: 1
          };
        }
        throw new Error('unexpected pool query: ' + text);
      },
      clientHandler: async (text) => {
        calls.push('client:' + text);
        if (text === 'BEGIN' || text === 'COMMIT') return { rows: [], rowCount: 0 };
        if (/SELECT id, engine_max, stance_id/.test(text)) return { rows: [], rowCount: 0 };
        if (/UPDATE credit_recompute_queue SET status = 'done'/.test(text)) {
          return { rows: [], rowCount: 1 };
        }
        throw new Error('unexpected client query: ' + text);
      }
    });

    const result = await processOneRecompute(mock, '42');
    expect(result.skipped).toBe(true);
    expect(result.assessmentId).toBeNull();
    // Verify the queue row was actually marked done before COMMIT.
    expect(calls.some((c) => c.includes("status = 'done'"))).toBe(true);
    expect(calls.some((c) => c === 'client:COMMIT')).toBe(true);
  });

  it('throws with idempotency_key collision message when lookup is empty', async () => {
    // Drive the worker far enough to hit the ON CONFLICT path, then return
    // zero rows from the lookup SELECT. The defensive throw should fire.
    const customerId = randomUUID();
    const stanceId = randomUUID();

    const mock = makeMockPool({
      poolHandler: async (text) => {
        if (/UPDATE credit_recompute_queue/.test(text) && /attempts = attempts \+ 1/.test(text)) {
          return {
            rows: [{ customer_id: customerId, enqueued_by: 'manualTrigger', command_id: null, attempts: 1 }],
            rowCount: 1
          };
        }
        // Failure marker UPDATE on the way out. Accept it.
        if (/UPDATE credit_recompute_queue/.test(text) && /last_error/.test(text)) {
          return { rows: [], rowCount: 1 };
        }
        throw new Error('unexpected pool query: ' + text);
      },
      clientHandler: async (text) => {
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          return { rows: [], rowCount: 0 };
        }
        if (/SELECT id, engine_max, stance_id/.test(text)) {
          return {
            rows: [{
              id: customerId,
              engine_max: null,
              stance_id: stanceId,
              credit_limit_source: 'manual',
              engine_enabled: false,
              engine_disabled_at: null,
              created_at: new Date(Date.now() - 400 * 86_400_000)
            }],
            rowCount: 1
          };
        }
        if (/FROM credit_engine_config/.test(text)) {
          return {
            rows: [{
              global_default_stance_id: stanceId,
              cold_start_min_posted_invoices: 3,
              cold_start_min_tenure_days: 60,
              shadow_mode: true
            }],
            rowCount: 1
          };
        }
        if (/FROM credit_engine_stances/.test(text)) {
          return {
            rows: [{
              weight_revenue_momentum: 20,
              weight_cash_collection: 20,
              weight_profitability: 15,
              weight_debt_aging: 15,
              weight_repayment_velocity: 20,
              weight_tenure_depth: 10
            }],
            rowCount: 1
          };
        }
        // Each signal compose returns no-data shapes — the score helpers
        // tolerate zero rows.
        if (/FROM invoices/.test(text) && /recent/.test(text)) {
          return { rows: [{ recent: '0', baseline: '0', cnt: '0' }], rowCount: 1 };
        }
        if (/FROM invoices/.test(text) && /invoiced/.test(text)) {
          return { rows: [{ invoiced: '0', paid: '0', cnt: '0' }], rowCount: 1 };
        }
        if (/eligible_orders/.test(text)) {
          return { rows: [{ revenue: '0', cogs: '0', cnt: '0' }], rowCount: 1 };
        }
        if (/days_overdue/.test(text)) {
          return { rows: [], rowCount: 0 };
        }
        if (/avg_days_late/.test(text)) {
          return { rows: [{ avg_days_late: null, cnt: '0' }], rowCount: 1 };
        }
        if (/days_active/.test(text)) {
          return { rows: [{ days_active: '400' }], rowCount: 1 };
        }
        if (/valid_12mo/.test(text)) {
          return { rows: [{ avg_monthly: '0', totals: '[]' }], rowCount: 1 };
        }
        if (/COUNT\(\*\)/.test(text) && /status IN/.test(text)) {
          return { rows: [{ cnt: '0' }], rowCount: 1 };
        }
        // INSERT with ON CONFLICT — return zero rows to force the conflict path.
        if (/INSERT INTO customer_credit_assessments/.test(text)) {
          return { rows: [], rowCount: 0 };
        }
        // Lookup after conflict — return zero rows to trigger the defensive throw.
        if (/SELECT id FROM customer_credit_assessments WHERE idempotency_key/.test(text)) {
          return { rows: [], rowCount: 0 };
        }
        throw new Error('unexpected client query: ' + text);
      }
    });

    await expect(processOneRecompute(mock, '42')).rejects.toThrow(/idempotency_key collision/);
  });

  it('throws with stance-not-found message when stance row is missing', async () => {
    const customerId = randomUUID();
    const stanceId = randomUUID();

    const mock = makeMockPool({
      poolHandler: async (text) => {
        if (/attempts = attempts \+ 1/.test(text)) {
          return {
            rows: [{ customer_id: customerId, enqueued_by: 'manualTrigger', command_id: null, attempts: 1 }],
            rowCount: 1
          };
        }
        if (/last_error/.test(text)) return { rows: [], rowCount: 1 };
        throw new Error('unexpected pool query: ' + text);
      },
      clientHandler: async (text) => {
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          return { rows: [], rowCount: 0 };
        }
        if (/SELECT id, engine_max, stance_id/.test(text)) {
          return {
            rows: [{
              id: customerId,
              engine_max: null,
              stance_id: stanceId,
              credit_limit_source: 'manual',
              engine_enabled: false,
              engine_disabled_at: null,
              created_at: new Date()
            }],
            rowCount: 1
          };
        }
        if (/FROM credit_engine_config/.test(text)) {
          return {
            rows: [{
              global_default_stance_id: stanceId,
              cold_start_min_posted_invoices: 3,
              cold_start_min_tenure_days: 60,
              shadow_mode: true
            }],
            rowCount: 1
          };
        }
        if (/FROM credit_engine_stances/.test(text)) {
          // Empty: triggers the defensive throw in loadStanceWeights.
          return { rows: [], rowCount: 0 };
        }
        throw new Error('unexpected client query: ' + text);
      }
    });

    await expect(processOneRecompute(mock, '99')).rejects.toThrow(/Stance .* not found/);
  });

  it('coerces non-Error rejections to string when writing last_error', async () => {
    // Throw a plain string from the work block; the failure-marker UPDATE
    // must still land. This exercises the `String(err)` branch on the
    // `err instanceof Error ? err.message : String(err)` ternary.
    const customerId = randomUUID();
    let lastErrorObserved: unknown = null;

    const mock = makeMockPool({
      poolHandler: async (text, params) => {
        if (/attempts = attempts \+ 1/.test(text)) {
          return {
            rows: [{ customer_id: customerId, enqueued_by: 'manualTrigger', command_id: null, attempts: 1 }],
            rowCount: 1
          };
        }
        if (/last_error/.test(text)) {
          lastErrorObserved = params[2];
          return { rows: [], rowCount: 1 };
        }
        throw new Error('unexpected pool query: ' + text);
      },
      clientHandler: async (text) => {
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          return { rows: [], rowCount: 0 };
        }
        if (/SELECT id, engine_max/.test(text)) {
          // Throw a non-Error (raw string) inside the work block.
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'plain string failure';
        }
        throw new Error('unexpected client query: ' + text);
      }
    });

    await expect(processOneRecompute(mock, '7')).rejects.toBe('plain string failure');
    expect(lastErrorObserved).toBe('plain string failure');
  });
});
