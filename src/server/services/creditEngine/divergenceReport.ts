import type { Pool, PoolClient } from 'pg';

/**
 * Divergence report (spec §10 + §15.4).
 *
 * Read-only comparison between manual credit limits (`customers.credit_limit`)
 * and the engine's latest recommendation (`customer_credit_assessments.final_limit`).
 * Drives the shadow → live transition: operators inspect this report and the
 * shadow-mode KPI to decide when it is safe to flip `engine_enabled = true` in
 * bulk via `bulkRevertCustomersToEngine` (Phase 4).
 *
 * The KPI surfaces 4 conditions:
 *  - **withinTolerance / outsideTolerance / pctWithinTolerance**: how close
 *    manual limits are to engine recommendations across the population.
 *  - **blockerCount**: number of currently-transacting customers (≥1 open
 *    invoice) whose engine recommendation is $0 — flipping these to engine
 *    mode would immediately block new sales.
 *  - **noConfidenceApplied**: number of `applied = true` assessments whose
 *    six signal confidences are ALL `'none'` — applying these means the
 *    engine made a decision without any underlying data.
 *
 * `passes` requires all three: ≥75% within tolerance, zero blockers, zero
 * no-confidence-applied. Tolerance defaults to ±30% (the spec §15.4 default).
 *
 * The KPI is informational in this phase; future work can wire it into
 * `bulkRevertCustomersToEngine` as a hard gate.
 */
export interface DivergenceRow {
  customerId: string;
  customerName: string;
  currentLimit: number;
  source: 'engine' | 'manual';
  engineRecommendation: number | null;
  recommendationConfidence: {
    overallScore: number | null;
    minDataCount: number;
    maxDataCount: number;
  };
  deltaAbs: number;
  deltaPct: number;
  suggestedAction:
    | 'engine_recommends_raise'
    | 'engine_recommends_lower'
    | 'within_tolerance'
    | 'no_recommendation_yet';
}

export interface ShadowModeKpi {
  withinTolerance: number;
  outsideTolerance: number;
  pctWithinTolerance: number;
  blockerCount: number;
  noConfidenceApplied: number;
  passes: boolean;
  reasons: string[];
}

export interface DivergenceReport {
  rows: DivergenceRow[];
  generatedAt: Date;
  totalCustomers: number;
  customersWithRecommendation: number;
  customersInTolerance: number;
  customersWithoutRecommendation: number;
  kpi: ShadowModeKpi;
}

export interface DivergenceOptions {
  toleranceFraction?: number;
  passThresholdFraction?: number;
  includeManualSource?: boolean;
  includeEngineSource?: boolean;
  filterCustomerIds?: string[];
}

type ConfidenceText = 'high' | 'medium' | 'low' | 'none';

/**
 * Map a confidence bucket back to a representative data-count using the same
 * boundaries as `bucketConfidence`. Lower-bound semantics are used so the
 * report communicates the *minimum* data-count guaranteed by each bucket.
 */
function confidenceToCount(level: ConfidenceText): number {
  switch (level) {
    case 'high':
      return 10;
    case 'medium':
      return 3;
    case 'low':
      return 1;
    case 'none':
      return 0;
  }
}

interface RawRow {
  customer_id: string;
  customer_name: string;
  credit_limit: string;
  credit_limit_source: 'engine' | 'manual';
  final_limit: string | null;
  overall_score: number | null;
  confidence_revenue_momentum: ConfidenceText | null;
  confidence_cash_collection: ConfidenceText | null;
  confidence_profitability: ConfidenceText | null;
  confidence_debt_aging: ConfidenceText | null;
  confidence_repayment_velocity: ConfidenceText | null;
  confidence_tenure_depth: ConfidenceText | null;
  applied: boolean | null;
  has_open_invoice: boolean;
}

export async function divergenceReport(
  client: Pool | PoolClient,
  options: DivergenceOptions = {}
): Promise<DivergenceReport> {
  const toleranceFraction = options.toleranceFraction ?? 0.3;
  const passThresholdFraction = options.passThresholdFraction ?? 0.75;
  const includeManualSource = options.includeManualSource ?? true;
  const includeEngineSource = options.includeEngineSource ?? true;
  const filterCustomerIds = options.filterCustomerIds;

  // Build source filter. If both are excluded, return an empty population.
  const sources: string[] = [];
  if (includeEngineSource) sources.push('engine');
  if (includeManualSource) sources.push('manual');

  const generatedAt = new Date();

  if (sources.length === 0) {
    return {
      rows: [],
      generatedAt,
      totalCustomers: 0,
      customersWithRecommendation: 0,
      customersInTolerance: 0,
      customersWithoutRecommendation: 0,
      kpi: {
        withinTolerance: 0,
        outsideTolerance: 0,
        pctWithinTolerance: 0,
        blockerCount: 0,
        noConfidenceApplied: 0,
        passes: true,
        reasons: []
      }
    };
  }

  const params: unknown[] = [sources];
  let filterClause = '';
  if (filterCustomerIds !== undefined) {
    params.push(filterCustomerIds);
    filterClause = `AND c.id = ANY($${params.length}::uuid[])`;
  }

  const { rows: rawRows } = await client.query<RawRow>(
    `
    WITH latest_assessment AS (
      SELECT DISTINCT ON (customer_id)
        customer_id,
        final_limit,
        overall_score,
        confidence_revenue_momentum,
        confidence_cash_collection,
        confidence_profitability,
        confidence_debt_aging,
        confidence_repayment_velocity,
        confidence_tenure_depth,
        applied
      FROM customer_credit_assessments
      ORDER BY customer_id, created_at DESC
    ),
    open_invoices AS (
      -- Actual invoice statuses: open | partial | paid | reversed. A
      -- "currently-transacting" customer is one with at least one issued
      -- invoice that is not yet paid AND not reversed. Legacy 'void'/'voided'
      -- markers are excluded defensively in case any historical row carries
      -- them; the application writes 'reversed' for cancellations.
      SELECT customer_id, true AS has_open
      FROM invoices
      WHERE status NOT IN ('paid', 'reversed', 'void', 'voided')
        AND total > amount_paid
      GROUP BY customer_id
    )
    SELECT
      c.id AS customer_id,
      c.name AS customer_name,
      c.credit_limit::text,
      c.credit_limit_source,
      la.final_limit::text AS final_limit,
      la.overall_score,
      la.confidence_revenue_momentum,
      la.confidence_cash_collection,
      la.confidence_profitability,
      la.confidence_debt_aging,
      la.confidence_repayment_velocity,
      la.confidence_tenure_depth,
      la.applied,
      COALESCE(oi.has_open, false) AS has_open_invoice
    FROM customers c
    LEFT JOIN latest_assessment la ON la.customer_id = c.id
    LEFT JOIN open_invoices oi ON oi.customer_id = c.id
    WHERE c.credit_limit_source = ANY($1::varchar[])
      ${filterClause}
    ORDER BY c.name
    `,
    params
  );

  const reportRows: DivergenceRow[] = [];
  let customersWithRecommendation = 0;
  let customersInTolerance = 0;
  let customersWithoutRecommendation = 0;
  let withinTolerance = 0;
  let outsideTolerance = 0;
  let blockerCount = 0;
  let noConfidenceApplied = 0;

  const tolerancePct = toleranceFraction * 100;

  for (const r of rawRows) {
    const currentLimit = Number(r.credit_limit);
    const engineRecommendation = r.final_limit !== null ? Number(r.final_limit) : null;

    let deltaAbs = 0;
    let deltaPct = 0;
    let suggestedAction: DivergenceRow['suggestedAction'];

    // Build the confidence summary. When no assessment exists, all signals
    // are treated as 'none' (count 0) so the summary still has a stable shape.
    const confidenceLevels: ConfidenceText[] = [
      r.confidence_revenue_momentum ?? 'none',
      r.confidence_cash_collection ?? 'none',
      r.confidence_profitability ?? 'none',
      r.confidence_debt_aging ?? 'none',
      r.confidence_repayment_velocity ?? 'none',
      r.confidence_tenure_depth ?? 'none'
    ];
    const counts = confidenceLevels.map(confidenceToCount);
    const minDataCount = Math.min(...counts);
    const maxDataCount = Math.max(...counts);
    const overallScore = r.overall_score;

    if (engineRecommendation === null) {
      suggestedAction = 'no_recommendation_yet';
      customersWithoutRecommendation += 1;
    } else {
      customersWithRecommendation += 1;
      deltaAbs = currentLimit - engineRecommendation;
      deltaPct = (deltaAbs / Math.max(1, engineRecommendation)) * 100;
      const absDeltaPct = Math.abs(deltaPct);
      if (absDeltaPct <= tolerancePct) {
        suggestedAction = 'within_tolerance';
        withinTolerance += 1;
        customersInTolerance += 1;
      } else if (deltaAbs > 0) {
        // Manual is higher than engine — engine would recommend lowering.
        suggestedAction = 'engine_recommends_lower';
        outsideTolerance += 1;
      } else {
        // Manual is lower than engine — engine would recommend raising.
        suggestedAction = 'engine_recommends_raise';
        outsideTolerance += 1;
      }

      // Blocker detection: engine says $0 AND customer has at least one
      // currently-open invoice (would-be currently transacting).
      if (engineRecommendation === 0 && r.has_open_invoice) {
        blockerCount += 1;
      }

      // No-confidence-applied: applied=true AND ALL six signal confidences = 'none'.
      if (r.applied === true && confidenceLevels.every((c) => c === 'none')) {
        noConfidenceApplied += 1;
      }
    }

    reportRows.push({
      customerId: r.customer_id,
      customerName: r.customer_name,
      currentLimit,
      source: r.credit_limit_source,
      engineRecommendation,
      recommendationConfidence: {
        overallScore,
        minDataCount,
        maxDataCount
      },
      deltaAbs,
      deltaPct,
      suggestedAction
    });
  }

  const denominator = Math.max(1, customersWithRecommendation);
  const pctWithinTolerance =
    customersWithRecommendation === 0 ? 0 : (withinTolerance / denominator) * 100;

  const reasons: string[] = [];
  const passesTolerance = pctWithinTolerance >= passThresholdFraction * 100;
  if (!passesTolerance) {
    reasons.push(
      `Only ${pctWithinTolerance.toFixed(1)}% of customers are within ±${tolerancePct.toFixed(
        0
      )}% of engine recommendation (target ${(passThresholdFraction * 100).toFixed(0)}%).`
    );
  }
  if (blockerCount > 0) {
    reasons.push(
      `${blockerCount} customer(s) with open invoices would be blocked (engine recommends $0).`
    );
  }
  if (noConfidenceApplied > 0) {
    reasons.push(
      `${noConfidenceApplied} customer(s) have applied=true assessments with zero signal confidence.`
    );
  }

  const passes = passesTolerance && blockerCount === 0 && noConfidenceApplied === 0;

  return {
    rows: reportRows,
    generatedAt,
    totalCustomers: rawRows.length,
    customersWithRecommendation,
    customersInTolerance,
    customersWithoutRecommendation,
    kpi: {
      withinTolerance,
      outsideTolerance,
      pctWithinTolerance,
      blockerCount,
      noConfidenceApplied,
      passes,
      reasons
    }
  };
}
