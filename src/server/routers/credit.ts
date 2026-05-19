import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { pool } from '../db';
import { assertRole } from '../rbac';
import { protectedProcedure, router } from '../trpc';
import { divergenceReport } from '../services/creditEngine/divergenceReport';
import type { Role } from '../../shared/types';

/**
 * Credit engine tRPC query endpoints (spec §13.3).
 *
 * Phase 6a — Read-only queries used by the UI (Phase 6b+) to render:
 *  - per-customer assessment history,
 *  - the global stance + config view,
 *  - the divergence (shadow→live) report,
 *  - the credit review queue for operators,
 *  - the recompute queue health for ops dashboards.
 *
 * Role gates are enforced server-side via {@link assertRole}. The role tiers
 * follow the design review's Security N2/N3 calls:
 *  - `manager`: per-customer/operator-visible reads (assessments, stances/config,
 *    review queue, queue health).
 *  - `owner`: portfolio-wide divergence report (limit data is sensitive).
 */

const managerOrAbove = ['manager', 'owner'] as const satisfies readonly Role[];
const ownerOnly = ['owner'] as const satisfies readonly Role[];

/**
 * Helper procedure that enforces a minimum role server-side. Uses the existing
 * {@link assertRole} helper which throws `TRPCError({ code: 'FORBIDDEN' })`
 * when the caller is below the required tier.
 */
function requireRole(minimum: Role) {
  return protectedProcedure.use(({ ctx, next }) => {
    assertRole(ctx.user, minimum);
    return next();
  });
}

const managerOrOwnerProcedure = requireRole('manager');
const ownerOnlyProcedure = requireRole('owner');

// ---------------------------------------------------------------------------
// 1) customerCreditAssessments
// ---------------------------------------------------------------------------

const customerCreditAssessmentsInput = z.object({
  customerId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0)
});

interface AssessmentRowRaw {
  id: string;
  created_at: Date;
  triggered_by: string;
  applied: boolean;
  final_limit: string;
  recommended_limit: string;
  base_amount: string;
  multiplier: string;
  overall_score: number;
  score_revenue_momentum: number;
  score_cash_collection: number;
  score_profitability: number;
  score_debt_aging: number;
  score_repayment_velocity: number;
  score_tenure_depth: number;
  confidence_revenue_momentum: string;
  confidence_cash_collection: string;
  confidence_profitability: string;
  confidence_debt_aging: string;
  confidence_repayment_velocity: string;
  confidence_tenure_depth: string;
  stance_id: string;
}

interface Assessment {
  id: string;
  createdAt: Date;
  triggeredBy: string;
  applied: boolean;
  finalLimit: number;
  recommendedLimit: number;
  baseAmount: number;
  multiplier: number;
  overallScore: number;
  scores: {
    revenueMomentum: number;
    cashCollection: number;
    profitability: number;
    debtAging: number;
    repaymentVelocity: number;
    tenureDepth: number;
  };
  confidences: {
    revenueMomentum: string;
    cashCollection: string;
    profitability: string;
    debtAging: string;
    repaymentVelocity: string;
    tenureDepth: string;
  };
  stanceId: string;
}

function mapAssessmentRow(r: AssessmentRowRaw): Assessment {
  return {
    id: r.id,
    createdAt: r.created_at,
    triggeredBy: r.triggered_by,
    applied: r.applied,
    finalLimit: Number(r.final_limit),
    recommendedLimit: Number(r.recommended_limit),
    baseAmount: Number(r.base_amount),
    multiplier: Number(r.multiplier),
    overallScore: r.overall_score,
    scores: {
      revenueMomentum: r.score_revenue_momentum,
      cashCollection: r.score_cash_collection,
      profitability: r.score_profitability,
      debtAging: r.score_debt_aging,
      repaymentVelocity: r.score_repayment_velocity,
      tenureDepth: r.score_tenure_depth
    },
    confidences: {
      revenueMomentum: r.confidence_revenue_momentum,
      cashCollection: r.confidence_cash_collection,
      profitability: r.confidence_profitability,
      debtAging: r.confidence_debt_aging,
      repaymentVelocity: r.confidence_repayment_velocity,
      tenureDepth: r.confidence_tenure_depth
    },
    stanceId: r.stance_id
  };
}

// ---------------------------------------------------------------------------
// 2) creditEngineStances
// ---------------------------------------------------------------------------

interface StanceRowRaw {
  id: string;
  name: string;
  description: string | null;
  weight_revenue_momentum: number;
  weight_cash_collection: number;
  weight_profitability: number;
  weight_debt_aging: number;
  weight_repayment_velocity: number;
  weight_tenure_depth: number;
  is_seeded: boolean;
  customer_count: string;
}

interface ConfigRowRaw {
  global_default_stance_id: string;
  cold_start_min_posted_invoices: number;
  cold_start_min_tenure_days: number;
  manual_override_reminder_default_days: number;
  manual_override_snooze_cap_days: number;
  shadow_mode: boolean;
}

// ---------------------------------------------------------------------------
// 3) divergenceReport
// ---------------------------------------------------------------------------

const divergenceReportInput = z.object({
  toleranceFraction: z.number().min(0).max(10).optional(),
  passThresholdFraction: z.number().min(0).max(1).optional(),
  includeManualSource: z.boolean().optional(),
  includeEngineSource: z.boolean().optional(),
  filterCustomerIds: z.array(z.string().uuid()).optional()
});

// ---------------------------------------------------------------------------
// 4) creditReviewQueue
// ---------------------------------------------------------------------------

const creditReviewQueueInput = z.object({
  sort: z.enum(['days_since_review', 'delta_pct', 'dollar_impact']).default('days_since_review'),
  filterTab: z.enum(['stale_manual', 'engine_disabled', 'near_snooze_cap']).default('stale_manual')
});

type ReviewCategory = 'stale_manual' | 'engine_disabled' | 'near_snooze_cap';

interface ReviewRow {
  customerId: string;
  customerName: string;
  creditLimit: number;
  source: 'engine' | 'manual';
  engineRecommendation: number | null;
  daysSinceReview: number | null;
  daysToSnoozeCap: number | null;
  manualSetAt: Date | null;
  manualReason: string | null;
  category: ReviewCategory;
  engineDisabledReason: string | null;
}

interface ReviewRowRaw {
  customer_id: string;
  customer_name: string;
  credit_limit: string;
  credit_limit_source: 'engine' | 'manual';
  engine_recommendation: string | null;
  days_since_review: string | null;
  days_to_snooze_cap: string | null;
  manual_set_at: Date | null;
  manual_reason: string | null;
  category: ReviewCategory;
  engine_disabled_reason: string | null;
}

// ---------------------------------------------------------------------------
// 5) creditRecomputeQueueHealth
// ---------------------------------------------------------------------------

interface QueueHealthRowRaw {
  pending_count: string;
  oldest_pending_age_seconds: string | null;
  processing_count: string;
  done_count: string;
  failed_terminal_count: string;
  stale_processing_count: string;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const creditRouter = router({
  /**
   * Per-customer assessment history (paginated). Manager+.
   * Returns rows in newest-first order plus the total count for paging.
   */
  customerCreditAssessments: managerOrOwnerProcedure
    .input(customerCreditAssessmentsInput)
    .query(async ({ input }) => {
      const { customerId, limit, offset } = input;
      const [rowsResult, countResult] = await Promise.all([
        pool.query<AssessmentRowRaw>(
          `SELECT id,
                  created_at,
                  triggered_by,
                  applied,
                  final_limit::text AS final_limit,
                  recommended_limit::text AS recommended_limit,
                  base_amount::text AS base_amount,
                  multiplier::text AS multiplier,
                  overall_score,
                  score_revenue_momentum,
                  score_cash_collection,
                  score_profitability,
                  score_debt_aging,
                  score_repayment_velocity,
                  score_tenure_depth,
                  confidence_revenue_momentum,
                  confidence_cash_collection,
                  confidence_profitability,
                  confidence_debt_aging,
                  confidence_repayment_velocity,
                  confidence_tenure_depth,
                  stance_id
           FROM customer_credit_assessments
           WHERE customer_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [customerId, limit, offset]
        ),
        pool.query<{ total: string }>(
          `SELECT count(*)::text AS total
           FROM customer_credit_assessments
           WHERE customer_id = $1`,
          [customerId]
        )
      ]);

      const rows: Assessment[] = rowsResult.rows.map(mapAssessmentRow);
      const total = Number(countResult.rows[0]?.total ?? 0);
      return { rows, total };
    }),

  /**
   * All credit-engine stances + the global config row. Manager+ read-only.
   * `customerCount` is the number of customers currently assigned to each stance.
   */
  creditEngineStances: managerOrOwnerProcedure.query(async () => {
    const [stancesResult, configResult] = await Promise.all([
      pool.query<StanceRowRaw>(
        `SELECT s.id,
                s.name,
                s.description,
                s.weight_revenue_momentum,
                s.weight_cash_collection,
                s.weight_profitability,
                s.weight_debt_aging,
                s.weight_repayment_velocity,
                s.weight_tenure_depth,
                s.is_seeded,
                (SELECT count(*)::text FROM customers c WHERE c.stance_id = s.id) AS customer_count
         FROM credit_engine_stances s
         ORDER BY s.is_seeded DESC, s.name`
      ),
      pool.query<ConfigRowRaw>(
        `SELECT global_default_stance_id,
                cold_start_min_posted_invoices,
                cold_start_min_tenure_days,
                manual_override_reminder_default_days,
                manual_override_snooze_cap_days,
                shadow_mode
         FROM credit_engine_config
         LIMIT 1`
      )
    ]);

    const stances = stancesResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      weights: {
        revenueMomentum: r.weight_revenue_momentum,
        cashCollection: r.weight_cash_collection,
        profitability: r.weight_profitability,
        debtAging: r.weight_debt_aging,
        repaymentVelocity: r.weight_repayment_velocity,
        tenureDepth: r.weight_tenure_depth
      },
      isSeeded: r.is_seeded,
      customerCount: Number(r.customer_count)
    }));

    const configRow = configResult.rows[0];
    if (!configRow) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'credit_engine_config row missing'
      });
    }

    const config = {
      globalDefaultStanceId: configRow.global_default_stance_id,
      coldStartMinPostedInvoices: configRow.cold_start_min_posted_invoices,
      coldStartMinTenureDays: configRow.cold_start_min_tenure_days,
      manualOverrideReminderDefaultDays: configRow.manual_override_reminder_default_days,
      manualOverrideSnoozeCapDays: configRow.manual_override_snooze_cap_days,
      shadowMode: configRow.shadow_mode
    };

    return { stances, config };
  }),

  /**
   * Portfolio-wide divergence report (manual limits vs. engine recommendation).
   * Owner-only — limit data across the portfolio is sensitive (Security N3).
   */
  divergenceReport: ownerOnlyProcedure
    .input(divergenceReportInput.optional())
    .query(async ({ input }) => {
      return divergenceReport(pool, input ?? {});
    }),

  /**
   * Operator credit-review queue. Manager+.
   *
   * Returns rows for the requested `filterTab` plus the aggregate counts for
   * all three tabs so the UI can show badge counts without a second round-trip.
   *
   * Categories:
   *  - `stale_manual`: source='manual' AND credit_limit_manual_set_at IS NOT NULL
   *    AND (now() - COALESCE(last_reviewed_at, manual_set_at)) >
   *      COALESCE(credit_limit_reminder_days, config.manualOverrideReminderDefaultDays) days.
   *  - `engine_disabled`: engine_disabled_at IS NOT NULL.
   *  - `near_snooze_cap`: source='manual' AND manual_set_at IS NOT NULL AND
   *    days_since_set > (config.manualOverrideSnoozeCapDays - 30).
   */
  creditReviewQueue: managerOrOwnerProcedure
    .input(creditReviewQueueInput.optional())
    .query(async ({ input }) => {
      const sort = input?.sort ?? 'days_since_review';
      const filterTab: ReviewCategory = input?.filterTab ?? 'stale_manual';

      const configResult = await pool.query<{
        manual_override_reminder_default_days: number;
        manual_override_snooze_cap_days: number;
      }>(
        `SELECT manual_override_reminder_default_days,
                manual_override_snooze_cap_days
         FROM credit_engine_config
         LIMIT 1`
      );
      const cfg = configResult.rows[0];
      if (!cfg) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'credit_engine_config row missing'
        });
      }
      const reminderDefaultDays = cfg.manual_override_reminder_default_days;
      const snoozeCapDays = cfg.manual_override_snooze_cap_days;
      const nearCapThresholdDays = snoozeCapDays - 30;

      // Choose ORDER BY safely (whitelist enforced by zod enum above; no
      // user-supplied SQL ever reaches the query string).
      const orderBy =
        sort === 'delta_pct'
          ? `ORDER BY abs((COALESCE(engine_recommendation, 0) - credit_limit::numeric)
                          / NULLIF(GREATEST(1, credit_limit::numeric), 0)) DESC NULLS LAST`
          : sort === 'dollar_impact'
            ? `ORDER BY abs(COALESCE(engine_recommendation, 0) - credit_limit::numeric) DESC NULLS LAST`
            : `ORDER BY days_since_review DESC NULLS LAST`;

      const baseSelect = `
        WITH latest_assessment AS (
          SELECT DISTINCT ON (customer_id)
            customer_id,
            final_limit
          FROM customer_credit_assessments
          ORDER BY customer_id, created_at DESC
        ),
        candidates AS (
          SELECT
            c.id AS customer_id,
            c.name AS customer_name,
            c.credit_limit::text AS credit_limit,
            c.credit_limit_source,
            la.final_limit::numeric AS engine_recommendation,
            c.engine_disabled_at,
            c.engine_disabled_reason,
            c.credit_limit_manual_set_at AS manual_set_at,
            c.credit_limit_manual_reason AS manual_reason,
            c.credit_limit_last_reviewed_at,
            c.credit_limit_reminder_days,
            floor(extract(epoch from (now() -
              COALESCE(c.credit_limit_last_reviewed_at, c.credit_limit_manual_set_at)
            )) / 86400)::int AS days_since_review_int,
            floor(extract(epoch from (now() - c.credit_limit_manual_set_at)) / 86400)::int
              AS days_since_set_int
          FROM customers c
          LEFT JOIN latest_assessment la ON la.customer_id = c.id
        ),
        classified AS (
          SELECT
            customer_id,
            customer_name,
            credit_limit,
            credit_limit_source,
            engine_recommendation,
            engine_disabled_reason,
            manual_set_at,
            manual_reason,
            days_since_review_int AS days_since_review,
            CASE
              WHEN manual_set_at IS NOT NULL THEN ($1::int - days_since_set_int)
              ELSE NULL
            END AS days_to_snooze_cap,
            CASE
              WHEN credit_limit_source = 'manual'
                AND manual_set_at IS NOT NULL
                AND days_since_review_int > COALESCE(credit_limit_reminder_days, $2::int)
                THEN 'stale_manual'
              WHEN engine_disabled_at IS NOT NULL
                THEN 'engine_disabled'
              WHEN credit_limit_source = 'manual'
                AND manual_set_at IS NOT NULL
                AND days_since_set_int > $3::int
                THEN 'near_snooze_cap'
              ELSE NULL
            END AS category
          FROM candidates
        )
      `;

      // Counts come from the same classification so they stay consistent with
      // the row data returned by the active tab.
      const countsResult = await pool.query<{
        stale_manual: string;
        engine_disabled: string;
        near_snooze_cap: string;
      }>(
        `${baseSelect}
         SELECT
           sum(CASE WHEN category = 'stale_manual' THEN 1 ELSE 0 END)::text AS stale_manual,
           sum(CASE WHEN category = 'engine_disabled' THEN 1 ELSE 0 END)::text AS engine_disabled,
           sum(CASE WHEN category = 'near_snooze_cap' THEN 1 ELSE 0 END)::text AS near_snooze_cap
         FROM classified`,
        [snoozeCapDays, reminderDefaultDays, nearCapThresholdDays]
      );

      const rowsResult = await pool.query<ReviewRowRaw>(
        `${baseSelect}
         SELECT
           customer_id,
           customer_name,
           credit_limit,
           credit_limit_source,
           engine_recommendation::text AS engine_recommendation,
           days_since_review::text AS days_since_review,
           days_to_snooze_cap::text AS days_to_snooze_cap,
           manual_set_at,
           manual_reason,
           category,
           engine_disabled_reason
         FROM classified
         WHERE category = $4
         ${orderBy}`,
        [snoozeCapDays, reminderDefaultDays, nearCapThresholdDays, filterTab]
      );

      const rows: ReviewRow[] = rowsResult.rows.map((r) => ({
        customerId: r.customer_id,
        customerName: r.customer_name,
        creditLimit: Number(r.credit_limit),
        source: r.credit_limit_source,
        engineRecommendation:
          r.engine_recommendation === null ? null : Number(r.engine_recommendation),
        daysSinceReview: r.days_since_review === null ? null : Number(r.days_since_review),
        daysToSnoozeCap:
          r.days_to_snooze_cap === null ? null : Number(r.days_to_snooze_cap),
        manualSetAt: r.manual_set_at,
        manualReason: r.manual_reason,
        category: r.category,
        engineDisabledReason: r.engine_disabled_reason
      }));

      const c = countsResult.rows[0];
      const counts = {
        staleManual: Number(c?.stale_manual ?? 0),
        engineDisabled: Number(c?.engine_disabled ?? 0),
        nearSnoozeCap: Number(c?.near_snooze_cap ?? 0)
      };

      return { rows, counts };
    }),

  /**
   * Recompute-queue health (operations dashboard). Manager+.
   * `staleProcessingCount`: rows stuck in 'processing' with
   * last_attempted_at older than 10 minutes (reaper candidates).
   */
  creditRecomputeQueueHealth: managerOrOwnerProcedure.query(async () => {
    const result = await pool.query<QueueHealthRowRaw>(
      `SELECT
         sum(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)::text AS pending_count,
         max(CASE
               WHEN status = 'pending'
               THEN extract(epoch from (now() - enqueued_at))
             END)::text AS oldest_pending_age_seconds,
         sum(CASE WHEN status = 'processing' THEN 1 ELSE 0 END)::text AS processing_count,
         sum(CASE WHEN status = 'done' THEN 1 ELSE 0 END)::text AS done_count,
         sum(CASE WHEN status = 'failed_terminal' THEN 1 ELSE 0 END)::text AS failed_terminal_count,
         sum(CASE
               WHEN status = 'processing'
                 AND last_attempted_at < now() - interval '10 minutes'
               THEN 1 ELSE 0
             END)::text AS stale_processing_count
       FROM credit_recompute_queue`
    );
    const r = result.rows[0];
    return {
      pendingCount: Number(r?.pending_count ?? 0),
      oldestPendingAgeSeconds:
        r?.oldest_pending_age_seconds === null || r?.oldest_pending_age_seconds === undefined
          ? null
          : Number(r.oldest_pending_age_seconds),
      processingCount: Number(r?.processing_count ?? 0),
      doneCount: Number(r?.done_count ?? 0),
      failedTerminalCount: Number(r?.failed_terminal_count ?? 0),
      staleProcessingCount: Number(r?.stale_processing_count ?? 0)
    };
  })
});

// Exported for unit tests so they can build mock callers without exporting
// the whole router internals.
export const _internal = { managerOrAbove, ownerOnly };
