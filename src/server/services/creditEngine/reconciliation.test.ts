import { describe, it, expect } from 'vitest';
import { pool } from '../../db';
import { reconcileLimitDrift } from './reconciliation';

describe('reconcileLimitDrift (integration)', () => {
  it('returns a report with correct shape', async () => {
    const report = await reconcileLimitDrift(pool);
    expect(report.totalCustomersChecked).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(report.drift)).toBe(true);
    for (const row of report.drift) {
      expect(typeof row.customerId).toBe('string');
      expect(typeof row.customerName).toBe('string');
      expect(['limit_mismatch', 'missing_assessment', 'stale_assessment']).toContain(row.reason);
    }
  });

  it('flags limit_mismatch when credit_limit differs from latest final_limit', async () => {
    // Build a customer with source='engine', an assessment, and a manually
    // skewed credit_limit so it doesn't match the assessment's final_limit.
    // This exercises the non-null branch of `latestAssessmentLimit`.
    const stanceRes = await pool.query<{ id: string }>(
      `SELECT id FROM credit_engine_stances WHERE name='Balanced'`
    );
    const stanceId = stanceRes.rows[0].id;
    const customerRes = await pool.query<{ id: string }>(
      `INSERT INTO customers (name) VALUES ('drift-mismatch-test') RETURNING id`
    );
    const customerId = customerRes.rows[0].id;
    try {
      const assessmentRes = await pool.query<{ id: string }>(
        `INSERT INTO customer_credit_assessments (
           customer_id, stance_id,
           score_revenue_momentum, score_cash_collection, score_profitability,
           score_debt_aging, score_repayment_velocity, score_tenure_depth,
           confidence_revenue_momentum, confidence_cash_collection, confidence_profitability,
           confidence_debt_aging, confidence_repayment_velocity, confidence_tenure_depth,
           overall_score, base_amount, multiplier, recommended_limit,
           engine_max_applied, final_limit,
           triggered_by, applied
         ) VALUES (
           $1, $2,
           50, 50, 50, 50, 50, 50,
           'medium','medium','medium','medium','medium','medium',
           50, 10000, 1, 10000,
           NULL, 10000,
           'reconciliation', true
         ) RETURNING id`,
        [customerId, stanceId]
      );
      const assessmentId = assessmentRes.rows[0].id;
      // Set credit_limit to a value that does NOT equal final_limit (10000).
      // Need to keep credit_limit_source='engine' AND last_assessment_id set.
      await pool.query(
        `UPDATE customers
            SET credit_limit = 25000,
                credit_limit_source = 'engine',
                last_assessment_id = $2
          WHERE id = $1`,
        [customerId, assessmentId]
      );

      const report = await reconcileLimitDrift(pool);
      const hit = report.drift.find(r => r.customerId === customerId);
      expect(hit).toBeDefined();
      expect(hit?.reason).toBe('limit_mismatch');
      expect(hit?.latestAssessmentLimit).toBe(10000);
      expect(hit?.creditLimit).toBe(25000);
      expect(hit?.delta).toBe(15000);
    } finally {
      await pool.query(
        `UPDATE customers SET last_assessment_id = NULL, credit_limit_source = 'manual' WHERE id = $1`,
        [customerId]
      );
      await pool.query(`DELETE FROM customer_credit_assessments WHERE customer_id = $1`, [customerId]);
      await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
    }
  });

  it('flags customer with source=engine and no assessment', async () => {
    // The customers_engine_source_has_assessment CHECK constraint normally
    // prevents creating this state for new rows. To exercise the drift-detector
    // branch we drop the constraint, insert the bad-state row, run the
    // detector, then restore the constraint. Using a savepoint-free pool
    // sequence is fine here because the work is bracketed by a try/finally
    // and the constraint is added back with the original NOT VALID semantics.
    await pool.query(
      `ALTER TABLE customers DROP CONSTRAINT customers_engine_source_has_assessment`
    );
    let customerId: string | null = null;
    try {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO customers (name, credit_limit_source) VALUES ('drift-test', 'engine') RETURNING id`
      );
      customerId = rows[0].id;

      const report = await reconcileLimitDrift(pool);
      const hit = report.drift.find(r => r.customerId === customerId);
      expect(hit).toBeDefined();
      expect(hit?.reason).toBe('missing_assessment');
    } finally {
      if (customerId !== null) {
        await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
      }
      await pool.query(
        `ALTER TABLE customers
           ADD CONSTRAINT customers_engine_source_has_assessment CHECK (
             credit_limit_source = 'manual' OR last_assessment_id IS NOT NULL
           ) NOT VALID`
      );
    }
  });
});
