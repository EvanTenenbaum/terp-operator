import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { pool } from '../../db';
import { divergenceReport } from './divergenceReport';

/**
 * Tests for the divergence report. Combines:
 *  1. Real-pool integration smoke tests that confirm shape + simple filters
 *     against the seeded database.
 *  2. Fixture-based integration tests that exercise the row-classification
 *     branches by inserting scoped customers + assessments + invoices.
 *  3. Mock-pool unit tests for branches that are awkward to drive via real
 *     SQL (e.g. excluding both sources to skip the query entirely).
 */
describe('divergenceReport (integration)', () => {
  it('returns a well-shaped report', async () => {
    const report = await divergenceReport(pool);
    expect(report.generatedAt).toBeInstanceOf(Date);
    expect(Array.isArray(report.rows)).toBe(true);
    expect(report.totalCustomers).toBeGreaterThanOrEqual(0);
    expect(typeof report.kpi.passes).toBe('boolean');
    expect(Array.isArray(report.kpi.reasons)).toBe(true);
    expect(typeof report.kpi.pctWithinTolerance).toBe('number');
    expect(typeof report.kpi.blockerCount).toBe('number');
    expect(typeof report.kpi.noConfidenceApplied).toBe('number');
  });

  it('honors filterCustomerIds', async () => {
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM customers LIMIT 2`);
    if (rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    const report = await divergenceReport(pool, { filterCustomerIds: ids });
    expect(report.rows.every((r) => ids.includes(r.customerId))).toBe(true);
    expect(report.rows.length).toBeLessThanOrEqual(ids.length);
  });

  it('honors source filters: includeEngineSource=false returns only manual rows', async () => {
    const onlyManual = await divergenceReport(pool, { includeEngineSource: false });
    expect(onlyManual.rows.every((r) => r.source === 'manual')).toBe(true);
  });

  it('honors source filters: includeManualSource=false returns only engine rows', async () => {
    const onlyEngine = await divergenceReport(pool, { includeManualSource: false });
    expect(onlyEngine.rows.every((r) => r.source === 'engine')).toBe(true);
  });

  it('returns an empty population when both source filters are excluded', async () => {
    const empty = await divergenceReport(pool, {
      includeManualSource: false,
      includeEngineSource: false
    });
    expect(empty.rows).toEqual([]);
    expect(empty.totalCustomers).toBe(0);
    expect(empty.customersWithRecommendation).toBe(0);
    expect(empty.customersInTolerance).toBe(0);
    expect(empty.customersWithoutRecommendation).toBe(0);
    expect(empty.kpi.withinTolerance).toBe(0);
    expect(empty.kpi.outsideTolerance).toBe(0);
    expect(empty.kpi.pctWithinTolerance).toBe(0);
    expect(empty.kpi.blockerCount).toBe(0);
    expect(empty.kpi.noConfidenceApplied).toBe(0);
    expect(empty.kpi.passes).toBe(true);
    expect(empty.kpi.reasons).toEqual([]);
  });

  it('computes pctWithinTolerance consistently with withinTolerance and customersWithRecommendation', async () => {
    const report = await divergenceReport(pool);
    if (report.customersWithRecommendation > 0) {
      const expected =
        (report.kpi.withinTolerance / report.customersWithRecommendation) * 100;
      expect(report.kpi.pctWithinTolerance).toBeCloseTo(expected, 5);
    } else {
      expect(report.kpi.pctWithinTolerance).toBe(0);
    }
  });

  // ----- Fixture-based row-classification branches -----

  describe('row classification branches', () => {
    /**
     * Build a scoped customer with an assessment whose final_limit + confidences
     * we control. Returns ids and a teardown helper. Caller is responsible for
     * calling teardown in finally so we don't leak state.
     */
    async function makeScopedCustomer(opts: {
      name: string;
      creditLimit: number;
      source: 'engine' | 'manual';
      finalLimit: number | null; // null = no assessment
      confidences?: 'all_none' | 'all_medium';
      applied?: boolean;
      withOpenInvoice?: boolean;
    }): Promise<{ customerId: string; teardown: () => Promise<void> }> {
      const stanceRes = await pool.query<{ id: string }>(
        `SELECT id FROM credit_engine_stances WHERE name='Balanced'`
      );
      const stanceId = stanceRes.rows[0].id;

      const insertSource = opts.source === 'engine' ? 'manual' : opts.source;
      const custRes = await pool.query<{ id: string }>(
        `INSERT INTO customers (name, credit_limit, credit_limit_source)
         VALUES ($1, $2, $3) RETURNING id`,
        [opts.name + '-' + randomUUID().slice(0, 6), opts.creditLimit.toFixed(2), insertSource]
      );
      const customerId = custRes.rows[0].id;

      let assessmentId: string | null = null;
      if (opts.finalLimit !== null) {
        const conf =
          opts.confidences === 'all_none'
            ? 'none'
            : opts.confidences === 'all_medium'
              ? 'medium'
              : 'medium';
        const applied = opts.applied ?? false;
        const aRes = await pool.query<{ id: string }>(
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
             $3, $3, $3, $3, $3, $3,
             50, $4, 1, $4,
             NULL, $4,
             'manualTrigger', $5
           ) RETURNING id`,
          [customerId, stanceId, conf, opts.finalLimit.toFixed(2), applied]
        );
        assessmentId = aRes.rows[0].id;
      }

      // Promote to engine source if requested. Constraint requires
      // last_assessment_id to be non-null when source='engine'.
      if (opts.source === 'engine' && assessmentId !== null) {
        await pool.query(
          `UPDATE customers
              SET credit_limit_source = 'engine',
                  last_assessment_id = $2
            WHERE id = $1`,
          [customerId, assessmentId]
        );
      } else if (assessmentId !== null) {
        // Still attach the assessment as last_assessment_id for realism, even
        // though source stays manual.
        await pool.query(
          `UPDATE customers SET last_assessment_id = $2 WHERE id = $1`,
          [customerId, assessmentId]
        );
      }

      let invoiceId: string | null = null;
      if (opts.withOpenInvoice) {
        const invRes = await pool.query<{ id: string }>(
          `INSERT INTO invoices (invoice_no, customer_id, status, total, amount_paid, due_date)
           VALUES ($1, $2, 'open', '5000.00', '0.00', now() + interval '30 days')
           RETURNING id`,
          ['INV-' + randomUUID().slice(0, 12), customerId]
        );
        invoiceId = invRes.rows[0].id;
      }

      const teardown = async () => {
        if (invoiceId !== null) {
          await pool.query(`DELETE FROM invoices WHERE id = $1`, [invoiceId]);
        }
        await pool.query(
          `UPDATE customers SET last_assessment_id = NULL, credit_limit_source = 'manual' WHERE id = $1`,
          [customerId]
        );
        await pool.query(`DELETE FROM customer_credit_assessments WHERE customer_id = $1`, [
          customerId
        ]);
        await pool.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
      };

      return { customerId, teardown };
    }

    it('marks within_tolerance when manual matches engine exactly', async () => {
      const { customerId, teardown } = await makeScopedCustomer({
        name: 'div-within',
        creditLimit: 10000,
        source: 'manual',
        finalLimit: 10000,
        confidences: 'all_medium'
      });
      try {
        const report = await divergenceReport(pool, { filterCustomerIds: [customerId] });
        expect(report.rows).toHaveLength(1);
        const row = report.rows[0];
        expect(row.suggestedAction).toBe('within_tolerance');
        expect(row.engineRecommendation).toBe(10000);
        expect(row.currentLimit).toBe(10000);
        expect(row.deltaAbs).toBe(0);
        expect(row.deltaPct).toBeCloseTo(0, 5);
        expect(row.recommendationConfidence.overallScore).toBe(50);
        expect(row.recommendationConfidence.minDataCount).toBe(3); // medium -> 3
        expect(row.recommendationConfidence.maxDataCount).toBe(3);
        expect(report.customersWithRecommendation).toBe(1);
        expect(report.customersInTolerance).toBe(1);
        expect(report.kpi.withinTolerance).toBe(1);
        expect(report.kpi.outsideTolerance).toBe(0);
        expect(report.kpi.pctWithinTolerance).toBeCloseTo(100, 5);
      } finally {
        await teardown();
      }
    });

    it('marks engine_recommends_lower when manual is higher than engine beyond tolerance', async () => {
      const { customerId, teardown } = await makeScopedCustomer({
        name: 'div-lower',
        creditLimit: 20000,
        source: 'manual',
        finalLimit: 10000,
        confidences: 'all_medium'
      });
      try {
        const report = await divergenceReport(pool, { filterCustomerIds: [customerId] });
        const row = report.rows[0];
        expect(row.suggestedAction).toBe('engine_recommends_lower');
        expect(row.deltaAbs).toBe(10000);
        expect(row.deltaPct).toBeCloseTo(100, 5);
      } finally {
        await teardown();
      }
    });

    it('marks engine_recommends_raise when manual is lower than engine beyond tolerance', async () => {
      const { customerId, teardown } = await makeScopedCustomer({
        name: 'div-raise',
        creditLimit: 1000,
        source: 'manual',
        finalLimit: 10000,
        confidences: 'all_medium'
      });
      try {
        const report = await divergenceReport(pool, { filterCustomerIds: [customerId] });
        const row = report.rows[0];
        expect(row.suggestedAction).toBe('engine_recommends_raise');
        expect(row.deltaAbs).toBe(-9000);
        expect(row.deltaPct).toBeCloseTo(-90, 5);
      } finally {
        await teardown();
      }
    });

    it('marks no_recommendation_yet when no assessment exists', async () => {
      const { customerId, teardown } = await makeScopedCustomer({
        name: 'div-norec',
        creditLimit: 15000,
        source: 'manual',
        finalLimit: null
      });
      try {
        const report = await divergenceReport(pool, { filterCustomerIds: [customerId] });
        const row = report.rows[0];
        expect(row.suggestedAction).toBe('no_recommendation_yet');
        expect(row.engineRecommendation).toBeNull();
        expect(row.deltaAbs).toBe(0);
        expect(row.deltaPct).toBe(0);
        expect(row.recommendationConfidence.overallScore).toBeNull();
        expect(row.recommendationConfidence.minDataCount).toBe(0);
        expect(row.recommendationConfidence.maxDataCount).toBe(0);
        expect(report.customersWithoutRecommendation).toBe(1);
        expect(report.customersWithRecommendation).toBe(0);
      } finally {
        await teardown();
      }
    });

    it('respects a custom toleranceFraction', async () => {
      // Manual = 12000, engine = 10000 -> delta 20%. Default tolerance is 30%
      // (within); a custom 10% tolerance flips it to outside.
      const { customerId, teardown } = await makeScopedCustomer({
        name: 'div-custol',
        creditLimit: 12000,
        source: 'manual',
        finalLimit: 10000,
        confidences: 'all_medium'
      });
      try {
        const def = await divergenceReport(pool, { filterCustomerIds: [customerId] });
        expect(def.rows[0].suggestedAction).toBe('within_tolerance');

        const tight = await divergenceReport(pool, {
          filterCustomerIds: [customerId],
          toleranceFraction: 0.1
        });
        expect(tight.rows[0].suggestedAction).toBe('engine_recommends_lower');
      } finally {
        await teardown();
      }
    });

    it('flags blockerCount when engine_recommendation=0 AND customer has an open invoice', async () => {
      const { customerId, teardown } = await makeScopedCustomer({
        name: 'div-blocker',
        creditLimit: 5000,
        source: 'manual',
        finalLimit: 0,
        confidences: 'all_medium',
        withOpenInvoice: true
      });
      try {
        const report = await divergenceReport(pool, { filterCustomerIds: [customerId] });
        expect(report.kpi.blockerCount).toBe(1);
        expect(report.kpi.passes).toBe(false);
        expect(report.kpi.reasons.some((r) => r.includes('open invoices'))).toBe(true);
      } finally {
        await teardown();
      }
    });

    it('does NOT flag blockerCount when engine_recommendation=0 but there is no open invoice', async () => {
      const { customerId, teardown } = await makeScopedCustomer({
        name: 'div-zero-norec',
        creditLimit: 5000,
        source: 'manual',
        finalLimit: 0,
        confidences: 'all_medium',
        withOpenInvoice: false
      });
      try {
        const report = await divergenceReport(pool, { filterCustomerIds: [customerId] });
        expect(report.kpi.blockerCount).toBe(0);
      } finally {
        await teardown();
      }
    });

    it('flags noConfidenceApplied when applied=true and all six confidences=none', async () => {
      const { customerId, teardown } = await makeScopedCustomer({
        name: 'div-noconf',
        creditLimit: 10000,
        source: 'manual',
        finalLimit: 10000,
        confidences: 'all_none',
        applied: true
      });
      try {
        const report = await divergenceReport(pool, { filterCustomerIds: [customerId] });
        expect(report.kpi.noConfidenceApplied).toBe(1);
        expect(report.kpi.passes).toBe(false);
        expect(report.kpi.reasons.some((r) => r.includes('zero signal confidence'))).toBe(true);
        const row = report.rows[0];
        expect(row.recommendationConfidence.minDataCount).toBe(0);
        expect(row.recommendationConfidence.maxDataCount).toBe(0);
      } finally {
        await teardown();
      }
    });

    it('does NOT flag noConfidenceApplied when applied=false even with all-none confidences', async () => {
      const { customerId, teardown } = await makeScopedCustomer({
        name: 'div-noconf-shadow',
        creditLimit: 10000,
        source: 'manual',
        finalLimit: 10000,
        confidences: 'all_none',
        applied: false
      });
      try {
        const report = await divergenceReport(pool, { filterCustomerIds: [customerId] });
        expect(report.kpi.noConfidenceApplied).toBe(0);
      } finally {
        await teardown();
      }
    });

    it('reports kpi.passes=false with a tolerance reason when below threshold', async () => {
      // Two scoped customers: one within tolerance, one way outside. Filter to
      // just these two so the KPI math is deterministic.
      const a = await makeScopedCustomer({
        name: 'div-pass-a',
        creditLimit: 10000,
        source: 'manual',
        finalLimit: 10000,
        confidences: 'all_medium'
      });
      const b = await makeScopedCustomer({
        name: 'div-pass-b',
        creditLimit: 100000,
        source: 'manual',
        finalLimit: 10000,
        confidences: 'all_medium'
      });
      try {
        const report = await divergenceReport(pool, {
          filterCustomerIds: [a.customerId, b.customerId]
        });
        expect(report.customersWithRecommendation).toBe(2);
        expect(report.kpi.withinTolerance).toBe(1);
        expect(report.kpi.outsideTolerance).toBe(1);
        expect(report.kpi.pctWithinTolerance).toBeCloseTo(50, 5);
        expect(report.kpi.passes).toBe(false);
        expect(report.kpi.reasons.some((r) => r.includes('within'))).toBe(true);
      } finally {
        await b.teardown();
        await a.teardown();
      }
    });

    it('respects passThresholdFraction (lower target = easier to pass)', async () => {
      const a = await makeScopedCustomer({
        name: 'div-thresh-a',
        creditLimit: 10000,
        source: 'manual',
        finalLimit: 10000,
        confidences: 'all_medium'
      });
      const b = await makeScopedCustomer({
        name: 'div-thresh-b',
        creditLimit: 100000,
        source: 'manual',
        finalLimit: 10000,
        confidences: 'all_medium'
      });
      try {
        // 50% within tolerance. With passThresholdFraction=0.4 it passes;
        // with default 0.75 it fails. Combine with both other gates clean
        // (no blockers, no zero-confidence) so only the tolerance gate matters.
        const lenient = await divergenceReport(pool, {
          filterCustomerIds: [a.customerId, b.customerId],
          passThresholdFraction: 0.4
        });
        expect(lenient.kpi.passes).toBe(true);
        expect(lenient.kpi.reasons).toEqual([]);
      } finally {
        await b.teardown();
        await a.teardown();
      }
    });

    it('detects engine-source rows when includeEngineSource is true', async () => {
      const { customerId, teardown } = await makeScopedCustomer({
        name: 'div-engsrc',
        creditLimit: 10000,
        source: 'engine',
        finalLimit: 10000,
        confidences: 'all_medium'
      });
      try {
        const report = await divergenceReport(pool, { filterCustomerIds: [customerId] });
        expect(report.rows).toHaveLength(1);
        expect(report.rows[0].source).toBe('engine');

        // Excluding engine source should drop this row.
        const onlyManual = await divergenceReport(pool, {
          filterCustomerIds: [customerId],
          includeEngineSource: false
        });
        expect(onlyManual.rows).toHaveLength(0);
      } finally {
        await teardown();
      }
    });
  });
});

/**
 * Mock-pool unit tests for the all-high confidence branch (so maxDataCount=10
 * is exercised) and to confirm the SQL is built with the expected parameters.
 * Using the same hand-rolled mock pattern as worker.test.ts.
 */
describe('divergenceReport (mock pool branches)', () => {
  function makeMockPool(
    queryFn: (text: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>
  ): Pool {
    return {
      query: async (text: string, params: unknown[] = []) => queryFn(text, params)
    } as unknown as Pool;
  }

  it('maps high confidences to count=10 in the recommendation summary', async () => {
    const customerId = randomUUID();
    const mock = makeMockPool(async (text, params) => {
      expect(text).toMatch(/FROM customers c/);
      expect(text).toMatch(/LEFT JOIN latest_assessment/);
      expect(Array.isArray(params[0])).toBe(true);
      return {
        rows: [
          {
            customer_id: customerId,
            customer_name: 'mock-high',
            credit_limit: '10000.00',
            credit_limit_source: 'manual',
            final_limit: '10000.00',
            overall_score: 90,
            confidence_revenue_momentum: 'high',
            confidence_cash_collection: 'high',
            confidence_profitability: 'high',
            confidence_debt_aging: 'high',
            confidence_repayment_velocity: 'high',
            confidence_tenure_depth: 'high',
            applied: false,
            has_open_invoice: false
          }
        ],
        rowCount: 1
      };
    });

    const report = await divergenceReport(mock);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].recommendationConfidence.minDataCount).toBe(10);
    expect(report.rows[0].recommendationConfidence.maxDataCount).toBe(10);
    expect(report.rows[0].recommendationConfidence.overallScore).toBe(90);
    expect(report.rows[0].suggestedAction).toBe('within_tolerance');
    expect(report.kpi.passes).toBe(true);
  });

  it('maps low confidences to count=1 in the recommendation summary', async () => {
    const customerId = randomUUID();
    const mock = makeMockPool(async () => ({
      rows: [
        {
          customer_id: customerId,
          customer_name: 'mock-low',
          credit_limit: '10000.00',
          credit_limit_source: 'manual',
          final_limit: '10000.00',
          overall_score: 25,
          confidence_revenue_momentum: 'low',
          confidence_cash_collection: 'low',
          confidence_profitability: 'low',
          confidence_debt_aging: 'low',
          confidence_repayment_velocity: 'low',
          confidence_tenure_depth: 'low',
          applied: false,
          has_open_invoice: false
        }
      ],
      rowCount: 1
    }));

    const report = await divergenceReport(mock);
    expect(report.rows[0].recommendationConfidence.minDataCount).toBe(1);
    expect(report.rows[0].recommendationConfidence.maxDataCount).toBe(1);
  });

  it('builds query without filterCustomerIds parameter when filter is omitted', async () => {
    let capturedParams: unknown[] = [];
    const mock = makeMockPool(async (_text, params) => {
      capturedParams = params;
      return { rows: [], rowCount: 0 };
    });
    await divergenceReport(mock);
    // Only the sources array parameter — no filter array appended.
    expect(capturedParams).toHaveLength(1);
    expect(Array.isArray(capturedParams[0])).toBe(true);
  });

  it('appends filterCustomerIds parameter when provided', async () => {
    let capturedText = '';
    let capturedParams: unknown[] = [];
    const mock = makeMockPool(async (text, params) => {
      capturedText = text;
      capturedParams = params;
      return { rows: [], rowCount: 0 };
    });
    const ids = [randomUUID(), randomUUID()];
    await divergenceReport(mock, { filterCustomerIds: ids });
    expect(capturedText).toContain('c.id = ANY($2::uuid[])');
    expect(capturedParams).toHaveLength(2);
    expect(capturedParams[1]).toEqual(ids);
  });

  it('handles applied=null safely (treats it as not noConfidenceApplied)', async () => {
    // Some legacy rows may carry NULL applied; the .every() check requires
    // applied===true, so a NULL value should not trip the gate.
    const mock = makeMockPool(async () => ({
      rows: [
        {
          customer_id: randomUUID(),
          customer_name: 'mock-applied-null',
          credit_limit: '10000.00',
          credit_limit_source: 'manual',
          final_limit: '10000.00',
          overall_score: 50,
          confidence_revenue_momentum: 'none',
          confidence_cash_collection: 'none',
          confidence_profitability: 'none',
          confidence_debt_aging: 'none',
          confidence_repayment_velocity: 'none',
          confidence_tenure_depth: 'none',
          applied: null,
          has_open_invoice: false
        }
      ],
      rowCount: 1
    }));

    const report = await divergenceReport(mock);
    expect(report.kpi.noConfidenceApplied).toBe(0);
  });

  it('coerces null confidence columns to none when latest_assessment row is partial', async () => {
    // Defensive branch: if for some reason a confidence column is NULL on an
    // existing assessment row, we map it to 'none' (count 0).
    const mock = makeMockPool(async () => ({
      rows: [
        {
          customer_id: randomUUID(),
          customer_name: 'mock-partial',
          credit_limit: '10000.00',
          credit_limit_source: 'manual',
          final_limit: '10000.00',
          overall_score: 50,
          confidence_revenue_momentum: null,
          confidence_cash_collection: null,
          confidence_profitability: null,
          confidence_debt_aging: null,
          confidence_repayment_velocity: null,
          confidence_tenure_depth: null,
          applied: false,
          has_open_invoice: false
        }
      ],
      rowCount: 1
    }));

    const report = await divergenceReport(mock);
    expect(report.rows[0].recommendationConfidence.minDataCount).toBe(0);
    expect(report.rows[0].recommendationConfidence.maxDataCount).toBe(0);
  });
});
