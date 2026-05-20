import type { Pool } from 'pg';

export interface DriftRow {
  customerId: string;
  customerName: string;
  creditLimit: number;
  latestAssessmentLimit: number | null;
  lastAssessmentId: string | null;
  delta: number;
  reason: 'limit_mismatch' | 'missing_assessment' | 'stale_assessment';
}

export interface DriftReport {
  drift: DriftRow[];
  totalCustomersChecked: number;
}

/**
 * Read-only drift detection (spec §15.4). Surfaces:
 *  - Customers with credit_limit_source='engine' whose customers.credit_limit ≠ latest assessment's final_limit
 *  - Customers with credit_limit_source='engine' AND last_assessment_id IS NULL
 *  - Customers whose latest assessment is > 7 days old
 *
 * Returns the rows + a total count. Callers (Phase 9 nightly, ops scripts) emit metrics + alerts.
 */
export async function reconcileLimitDrift(pool: Pool): Promise<DriftReport> {
  const { rows: drift } = await pool.query<{
    customer_id: string;
    customer_name: string;
    credit_limit: string;
    latest_limit: string | null;
    last_assessment_id: string | null;
    delta: string;
    reason: 'limit_mismatch' | 'missing_assessment' | 'stale_assessment';
  }>(`
    WITH latest AS (
      SELECT DISTINCT ON (customer_id)
        customer_id, id AS assessment_id, final_limit, created_at
      FROM customer_credit_assessments
      ORDER BY customer_id, created_at DESC
    )
    SELECT
      c.id AS customer_id,
      c.name AS customer_name,
      c.credit_limit::text,
      l.final_limit::text AS latest_limit,
      c.last_assessment_id,
      CASE WHEN l.final_limit IS NULL THEN '0'
           ELSE (c.credit_limit - l.final_limit)::text END AS delta,
      CASE
        WHEN c.last_assessment_id IS NULL THEN 'missing_assessment'
        WHEN l.created_at < now() - INTERVAL '7 days' THEN 'stale_assessment'
        ELSE 'limit_mismatch'
      END::varchar AS reason
    FROM customers c
    LEFT JOIN latest l ON l.customer_id = c.id
    WHERE c.credit_limit_source = 'engine'
      AND (
        c.last_assessment_id IS NULL
        OR c.credit_limit <> l.final_limit
        OR l.created_at < now() - INTERVAL '7 days'
      )
    ORDER BY c.name
  `);

  const { rows: countRows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM customers WHERE credit_limit_source = 'engine'`
  );

  return {
    drift: drift.map(r => ({
      customerId: r.customer_id,
      customerName: r.customer_name,
      creditLimit: Number(r.credit_limit),
      latestAssessmentLimit: r.latest_limit !== null ? Number(r.latest_limit) : null,
      lastAssessmentId: r.last_assessment_id,
      delta: Number(r.delta),
      reason: r.reason
    })),
    totalCustomersChecked: Number(countRows[0].cnt)
  };
}
