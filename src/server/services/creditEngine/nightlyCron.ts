import type { Pool } from 'pg';
import { recomputeAllCustomers } from './orchestrator';

/**
 * Phase 9 — nightly safety-net cron.
 *
 * Drift threshold:  `CREDIT_ENGINE_DRIFT_THRESHOLD_PCT` (default 25)
 * Stuck threshold:  `CREDIT_ENGINE_STUCK_AGE_MIN`        (default 30)
 *
 * This module exposes a single function, `runNightlyCreditEngineAudit`, that:
 *   1. Re-runs every active customer through the recompute orchestrator so
 *      every engine-eligible customer has a fresh assessment row.
 *   2. Scans for customers whose manually-set `credit_limit` has drifted more
 *      than the threshold from the engine's latest `recommended_limit` and
 *      surfaces them so operators can review.
 *   3. Detects queue items stuck in `pending`/`processing` longer than the
 *      stuck threshold — these indicate a worker has wedged or the queue is
 *      backed up. The reaper handles `processing > 10min`; this is a wider
 *      net and includes long-pending rows the reaper would never touch.
 *   4. UPSERTs a single row into `credit_engine_daily_audit` for the local
 *      day so repeated invocations on the same day overwrite the previous
 *      summary rather than create duplicates.
 *
 * No external alerting wiring lives here — the operator's host (DigitalOcean
 * App Platform scheduled job, k8s CronJob, etc.) invokes this via
 * `pnpm cron:credit-engine-nightly`. Downstream dashboards / alert rules
 * read `credit_engine_daily_audit` directly.
 */

const DEFAULT_DRIFT_PCT = 25;
const DEFAULT_STUCK_AGE_MIN = 30;

export interface DriftedCustomer {
  customerId: string;
  customerName: string;
  creditLimit: number;
  recommendedLimit: number;
  driftPct: number;
}

export interface StuckQueueItem {
  id: string;
  customerId: string;
  status: 'pending' | 'processing';
  enqueuedAt: Date;
  attempts: number;
  ageMinutes: number;
}

export interface NightlyAuditSummary {
  day: string; // YYYY-MM-DD
  runStartedAt: Date;
  runCompletedAt: Date;
  decisionsIssued: number;
  customersDrifted: number;
  stuckQueueItems: number;
  driftedCustomers: DriftedCustomer[];
  stuckItems: StuckQueueItem[];
  recompute: {
    enqueued: number;
    processed: number;
    failed: number;
    skipped: number;
  };
}

/**
 * Format a Date as a UTC `YYYY-MM-DD` day string. We use UTC so the
 * "day" partition matches the timestamp the operator scheduled — running
 * at 05:00 UTC on May 20 always lands in `2026-05-20`, regardless of the
 * host's TZ.
 */
function toUtcDay(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export async function runNightlyCreditEngineAudit(
  pool: Pool,
  now: Date
): Promise<NightlyAuditSummary> {
  const runStartedAt = new Date(now.getTime());
  const driftThresholdPct = readIntEnv('CREDIT_ENGINE_DRIFT_THRESHOLD_PCT', DEFAULT_DRIFT_PCT);
  const stuckAgeMin = readIntEnv('CREDIT_ENGINE_STUCK_AGE_MIN', DEFAULT_STUCK_AGE_MIN);

  // 1. Re-run all engine-eligible customers. `skipEngineDisabled: true` keeps
  //    explicitly-disabled customers out of the loop — they're surfaced
  //    separately via the credit review queue.
  const recompute = await recomputeAllCustomers(pool, {
    source: 'nightly',
    skipEngineDisabled: true
  });

  // 2. Drift scan — compare the customer's current `credit_limit` against the
  //    most recent assessment's `recommended_limit`. Drift % is computed
  //    against the recommended_limit so a customer with a $1000 recommendation
  //    and a $1500 manual limit reads as 50% drift.
  //
  //    We intentionally include customers with credit_limit_source IN ('manual','engine')
  //    because an engine-source customer whose denorm row got out of sync with
  //    the assessments table also constitutes drift worth surfacing.
  const driftRes = await pool.query<{
    customer_id: string;
    customer_name: string;
    credit_limit: string;
    recommended_limit: string;
    drift_pct: string;
  }>(
    `
    WITH latest AS (
      SELECT DISTINCT ON (customer_id)
        customer_id, recommended_limit
      FROM customer_credit_assessments
      ORDER BY customer_id, created_at DESC
    )
    SELECT
      c.id   AS customer_id,
      c.name AS customer_name,
      c.credit_limit::text,
      l.recommended_limit::text,
      CASE
        WHEN l.recommended_limit IS NULL OR l.recommended_limit = 0 THEN '0'
        ELSE (ABS(c.credit_limit - l.recommended_limit) * 100.0 / l.recommended_limit)::text
      END AS drift_pct
    FROM customers c
    JOIN latest l ON l.customer_id = c.id
    WHERE c.engine_disabled_at IS NULL
      AND l.recommended_limit IS NOT NULL
      AND l.recommended_limit > 0
    `
  );

  const driftedCustomers: DriftedCustomer[] = driftRes.rows
    .map(r => ({
      customerId: r.customer_id,
      customerName: r.customer_name,
      creditLimit: Number(r.credit_limit),
      recommendedLimit: Number(r.recommended_limit),
      driftPct: Number(r.drift_pct)
    }))
    .filter(r => r.driftPct > driftThresholdPct);

  // 3. Stuck-queue scan. A pending row's age is measured from enqueued_at; a
  //    processing row's age is measured from last_attempted_at (the worker
  //    claimed it at that timestamp). We treat both buckets as "stuck" if
  //    they exceed the threshold.
  const stuckRes = await pool.query<{
    id: string;
    customer_id: string;
    status: 'pending' | 'processing';
    enqueued_at: Date;
    attempts: number;
    age_minutes: string;
  }>(
    `
    SELECT
      id::text,
      customer_id,
      status,
      enqueued_at,
      attempts,
      EXTRACT(EPOCH FROM (
        now() - COALESCE(last_attempted_at, enqueued_at)
      )) / 60.0 AS age_minutes
    FROM credit_recompute_queue
    WHERE status IN ('pending', 'processing')
      AND COALESCE(last_attempted_at, enqueued_at) < now() - make_interval(mins => $1)
    ORDER BY enqueued_at
    LIMIT 100
    `,
    [stuckAgeMin]
  );

  const stuckItems: StuckQueueItem[] = stuckRes.rows.map(r => ({
    id: r.id,
    customerId: r.customer_id,
    status: r.status,
    enqueuedAt: r.enqueued_at,
    attempts: r.attempts,
    ageMinutes: Number(r.age_minutes)
  }));

  const runCompletedAt = new Date();
  const day = toUtcDay(now);

  // 4. UPSERT the daily audit row. `summary` carries the full drift + stuck
  //    payload as JSON so operators reading from the audit table don't have
  //    to cross-join.
  const summaryPayload = JSON.stringify({
    drifted: driftedCustomers,
    stuck: stuckItems,
    recompute,
    thresholds: {
      driftPct: driftThresholdPct,
      stuckAgeMin
    }
  });

  await pool.query(
    `
    INSERT INTO credit_engine_daily_audit (
      day, decisions_issued, customers_drifted, stuck_queue_items,
      run_started_at, run_completed_at, summary
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    ON CONFLICT (day) DO UPDATE SET
      decisions_issued  = EXCLUDED.decisions_issued,
      customers_drifted = EXCLUDED.customers_drifted,
      stuck_queue_items = EXCLUDED.stuck_queue_items,
      run_started_at    = EXCLUDED.run_started_at,
      run_completed_at  = EXCLUDED.run_completed_at,
      summary           = EXCLUDED.summary
    `,
    [
      day,
      recompute.processed,
      driftedCustomers.length,
      stuckItems.length,
      runStartedAt,
      runCompletedAt,
      summaryPayload
    ]
  );

  return {
    day,
    runStartedAt,
    runCompletedAt,
    decisionsIssued: recompute.processed,
    customersDrifted: driftedCustomers.length,
    stuckQueueItems: stuckItems.length,
    driftedCustomers,
    stuckItems,
    recompute
  };
}
