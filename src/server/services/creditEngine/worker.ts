import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  aggregateOverallScore,
  mapScoreToMultiplier,
  type Weights,
  type SignalScores
} from './scoring';
import { computeBaseAmount } from './base';
import { resolveEffectiveStanceId } from './effectiveStance';
import { isColdStartReady } from './coldStart';
import { computeRevenueMomentum } from './signals/revenueMomentum';
import { computeCashCollection } from './signals/cashCollection';
import { computeProfitability } from './signals/profitability';
import { computeDebtAging } from './signals/debtAging';
import { computeRepaymentVelocity } from './signals/repaymentVelocity';
import { computeTenureDepth } from './signals/tenureDepth';

/**
 * Result of `processOneRecompute`.
 * - `skipped`: true when the queue row was not in 'pending' (already claimed by
 *   another worker, already done, terminally failed, or missing).
 * - `assessmentId`: present whenever an assessment row was written or located
 *   via the idempotency_key fallback. Null only when skipped.
 * - `applied`: mirrors the `applied` column on the assessment row. Always false
 *   in shadow mode, when the customer is in manual mode, when the engine is
 *   disabled for the customer, or when the cold-start gate has not yet opened.
 * - `finalLimit`: the clamped recommendation. Note this is what the engine
 *   would recommend; it is only written back to `customers.credit_limit` when
 *   `applied = true`.
 *
 * Maximum recommended_limit/final_limit is clamped to 100,000,000 to satisfy
 * the DB CHECK constraint on `customer_credit_assessments`.
 */
export interface ProcessResult {
  skipped: boolean;
  assessmentId: string | null;
  applied: boolean;
  finalLimit: number | null;
}

const MAX_LIMIT = 100_000_000;
const MAX_ATTEMPTS = 5;

/**
 * Process one row from `credit_recompute_queue` end-to-end:
 *   1. Claim the row (transitions pending -> processing, increments attempts).
 *   2. Load + row-lock the customer.
 *   3. Compute the 6 signals via the compose layer.
 *   4. Resolve the effective stance + its weights.
 *   5. Aggregate overall_score, base, multiplier, and clamp final_limit.
 *   6. Insert the assessment with an idempotency key (`sha256(customerId:queueId)`).
 *      On unique-conflict, fall back to SELECT — this protects against partial
 *      commit / retry scenarios per spec §5.3 step 9 patch.
 *   7. Apply the result to `customers` when shadow_mode is off and the customer
 *      is in engine mode. Otherwise just update `last_assessment_id`.
 *   8. Mark the queue row done. COMMIT.
 *
 * On any error in steps 3-8 the transaction rolls back and the row is reset to
 * 'pending' on a separate connection (or 'failed_terminal' once attempts hits
 * MAX_ATTEMPTS). The error message is captured to `last_error` for operator
 * visibility. The reaper in Task 2.4 will surface terminal failures.
 *
 * The polling loop, advisory locking, and skip-locked semantics land in
 * Task 2.4 — this function only handles per-row processing.
 */
export async function processOneRecompute(
  pool: Pool,
  queueRowId: string | number | bigint
): Promise<ProcessResult> {
  // Step 2: claim the row in its own short transaction so the attempts
  // increment + status='processing' transition survives a rollback of the
  // main work transaction below. Without this split a failing recompute
  // would roll the attempts counter back to 0 forever and the row would
  // never hit `failed_terminal`.
  const claimRes = await pool.query<{
    customer_id: string;
    enqueued_by: string;
    command_id: string | null;
    attempts: number;
  }>(
    `UPDATE credit_recompute_queue
        SET status = 'processing',
            last_attempted_at = now(),
            attempts = attempts + 1
      WHERE id = $1 AND status = 'pending'
      RETURNING customer_id, enqueued_by, command_id, attempts`,
    [queueRowId]
  );
  if (claimRes.rowCount === 0) {
    return { skipped: true, assessmentId: null, applied: false, finalLimit: null };
  }
  const { customer_id: customerId, enqueued_by: enqueuedBy, command_id: commandId } = claimRes.rows[0];

  // Step 2a: derive idempotency key. (customerId, queueRowId) uniquely
  // identifies this attempt; if the function crashes mid-way and we retry,
  // we recompute the same key so the ON CONFLICT branch kicks in.
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${customerId}:${queueRowId}`)
    .digest('hex');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      // Step 3: load + lock the customer. FOR UPDATE blocks concurrent writes
      // to credit_limit / engine_enabled / last_assessment_id during this txn.
      const customerRes = await client.query<{
        id: string;
        engine_max: string | null;
        stance_id: string | null;
        credit_limit_source: string;
        engine_enabled: boolean;
        engine_disabled_at: Date | null;
        created_at: Date;
      }>(
        `SELECT id, engine_max, stance_id, credit_limit_source, engine_enabled,
                engine_disabled_at, created_at
           FROM customers
          WHERE id = $1
          FOR UPDATE`,
        [customerId]
      );
      if (customerRes.rowCount === 0) {
        // Customer was deleted between enqueue and now. Mark the row done so
        // it doesn't loop forever. No assessment is written.
        await client.query(`UPDATE credit_recompute_queue SET status = 'done' WHERE id = $1`, [queueRowId]);
        await client.query('COMMIT');
        return { skipped: true, assessmentId: null, applied: false, finalLimit: null };
      }
      const customer = customerRes.rows[0];

      // Step 4-7 prep: load engine config + stance weights.
      const config = await loadConfig(client);
      const stanceId = resolveEffectiveStanceId({
        customerStanceId: customer.stance_id,
        globalDefaultStanceId: config.globalDefaultStanceId
      });
      const weights = await loadStanceWeights(client, stanceId);

      // Step 6: compute the 6 signals (always — even when applied=false, we
      // need them on the assessment row so operators can see "what the engine
      // would have said"). Run sequentially because a single pg client cannot
      // multiplex queries; concurrent client.query() calls are deprecated and
      // would land out of order on the same connection.
      const now = new Date();
      const revMom = await computeRevenueMomentum(client, customerId, now);
      const cashC = await computeCashCollection(client, customerId, now);
      const profit = await computeProfitability(client, customerId, now);
      const debt = await computeDebtAging(client, customerId, now);
      const vel = await computeRepaymentVelocity(client, customerId, now);
      const tenure = await computeTenureDepth(client, customerId, now);

      // Base amount: max(6mo avg monthly revenue, median of 12mo invoice totals).
      const base = await computeBaseFromDb(client, customerId, now);

      // Step 5: cold-start gate.
      const postedInvoiceCount = await countPostedInvoices(client, customerId, now);
      const tenureDays = Math.max(
        0,
        Math.floor((now.getTime() - customer.created_at.getTime()) / 86_400_000)
      );
      const coldStartReady = isColdStartReady({
        postedInvoiceCount,
        tenureDays,
        computedBase: base,
        config: {
          minPostedInvoices: config.coldStartMinPostedInvoices,
          minTenureDays: config.coldStartMinTenureDays
        }
      });

      // Decide `applied` BEFORE inserting the assessment row. Order matters
      // for the precedence rules in spec §5.3:
      //   1. engine_disabled_at set  -> never apply
      //   2. shadow_mode global flag -> never apply
      //   3. credit_limit_source='manual' -> never apply (customer opted out)
      //   4. engine not enabled and cold-start gate not yet open -> not applied
      //   5. otherwise -> applied
      const engineDisabled = customer.engine_disabled_at !== null;
      let applied: boolean;
      if (engineDisabled) {
        applied = false;
      } else if (config.shadowMode) {
        applied = false;
      } else if (customer.credit_limit_source === 'manual') {
        applied = false;
      } else if (!customer.engine_enabled && !coldStartReady) {
        applied = false;
      } else {
        applied = true;
      }

      // If cold-start gate just opened (and engine is not disabled), flip the
      // engine_enabled flag so future recomputes can apply. This is the only
      // place that auto-enables the engine for a customer.
      if (!customer.engine_enabled && coldStartReady && !engineDisabled) {
        await client.query(
          `UPDATE customers SET engine_enabled = true WHERE id = $1`,
          [customerId]
        );
      }

      // Step 8: aggregate overall score + multiplier + recommended limit.
      const scores: SignalScores = {
        revenueMomentum: revMom.score,
        cashCollection: cashC.score,
        profitability: profit.score,
        debtAging: debt.score,
        repaymentVelocity: vel.score,
        tenureDepth: tenure.score
      };
      const overallScore = aggregateOverallScore(scores, weights);
      const multiplier = mapScoreToMultiplier(overallScore);
      const rawRecommended = Math.min(MAX_LIMIT, base * multiplier);
      const engineMax = customer.engine_max !== null ? Number(customer.engine_max) : null;
      const finalLimit = engineMax !== null ? Math.min(rawRecommended, engineMax) : rawRecommended;

      // Step 9: insert the assessment with the idempotency key. ON CONFLICT
      // (idempotency_key) DO NOTHING + RETURNING gives us a zero-row response
      // if the row already exists; we then look it up by key and use that id.
      const insertRes = await client.query<{ id: string }>(
        `INSERT INTO customer_credit_assessments (
           customer_id, stance_id,
           score_revenue_momentum, score_cash_collection, score_profitability,
           score_debt_aging, score_repayment_velocity, score_tenure_depth,
           confidence_revenue_momentum, confidence_cash_collection, confidence_profitability,
           confidence_debt_aging, confidence_repayment_velocity, confidence_tenure_depth,
           overall_score, base_amount, multiplier, recommended_limit,
           engine_max_applied, final_limit,
           triggered_by, triggered_by_command_id, applied, idempotency_key
         ) VALUES (
           $1, $2,
           $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14,
           $15, $16, $17, $18,
           $19, $20,
           $21, $22, $23, $24
         )
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [
          customerId, stanceId,
          revMom.score, cashC.score, profit.score, debt.score, vel.score, tenure.score,
          revMom.confidence, cashC.confidence, profit.confidence,
          debt.confidence, vel.confidence, tenure.confidence,
          overallScore, base, multiplier, rawRecommended,
          engineMax, finalLimit,
          enqueuedBy, commandId, applied, idempotencyKey
        ]
      );

      let assessmentId: string;
      if (insertRes.rowCount && insertRes.rowCount > 0 && insertRes.rows[0]?.id) {
        assessmentId = insertRes.rows[0].id;
      } else {
        // Conflict path: a prior partial-commit retry already inserted the
        // row. Re-use that id so the customers FK still points at a valid
        // assessment.
        const lookup = await client.query<{ id: string }>(
          `SELECT id FROM customer_credit_assessments WHERE idempotency_key = $1`,
          [idempotencyKey]
        );
        if (lookup.rowCount === 0) {
          throw new Error(
            `processOneRecompute: idempotency_key collision returned no row (key=${idempotencyKey})`
          );
        }
        assessmentId = lookup.rows[0].id;
      }

      // Step 10: write the customer denorm. `last_assessment_id` is required
      // when credit_limit_source='engine' (see customers_engine_source_has_assessment
      // constraint) — so we always set it, even when applied=false.
      if (applied) {
        await client.query(
          `UPDATE customers SET credit_limit = $2, last_assessment_id = $3 WHERE id = $1`,
          [customerId, finalLimit, assessmentId]
        );
      } else {
        await client.query(
          `UPDATE customers SET last_assessment_id = $2 WHERE id = $1`,
          [customerId, assessmentId]
        );
      }

      // Step 11: mark the queue row done.
      await client.query(
        `UPDATE credit_recompute_queue SET status = 'done' WHERE id = $1`,
        [queueRowId]
      );

      await client.query('COMMIT');
      return { skipped: false, assessmentId, applied, finalLimit };
    } catch (err) {
      // Roll back the in-flight work txn. The claim transaction already
      // committed, so the attempts increment + processing status persist.
      // We then write the failure state on a fresh connection because the
      // current client is in an aborted-txn state.
      try {
        await client.query('ROLLBACK');
      } catch {
        // Client may already be in a dead state; ignore so we still write
        // the failure marker via pool below.
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      // Status flips to terminal once we've exhausted retries; otherwise we
      // go back to pending for the next worker. `attempts` was already
      // bumped by the claim transaction, so this compare is correct.
      await pool.query(
        `UPDATE credit_recompute_queue
            SET status = CASE
                           WHEN attempts >= $2 THEN 'failed_terminal'
                           ELSE 'pending'
                         END,
                last_error = $3
          WHERE id = $1`,
        [queueRowId, MAX_ATTEMPTS, errMsg]
      );
      throw err;
    }
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

interface EngineConfig {
  globalDefaultStanceId: string;
  coldStartMinPostedInvoices: number;
  coldStartMinTenureDays: number;
  shadowMode: boolean;
}

async function loadConfig(client: PoolClient): Promise<EngineConfig> {
  const { rows } = await client.query<{
    global_default_stance_id: string;
    cold_start_min_posted_invoices: number;
    cold_start_min_tenure_days: number;
    shadow_mode: boolean;
  }>(
    `SELECT global_default_stance_id,
            cold_start_min_posted_invoices,
            cold_start_min_tenure_days,
            shadow_mode
       FROM credit_engine_config
      LIMIT 1`
  );
  if (rows.length === 0) {
    throw new Error('credit_engine_config row missing — run pnpm db:seed first');
  }
  return {
    globalDefaultStanceId: rows[0].global_default_stance_id,
    coldStartMinPostedInvoices: rows[0].cold_start_min_posted_invoices,
    coldStartMinTenureDays: rows[0].cold_start_min_tenure_days,
    shadowMode: rows[0].shadow_mode
  };
}

async function loadStanceWeights(client: PoolClient, stanceId: string): Promise<Weights> {
  const { rows } = await client.query<{
    weight_revenue_momentum: number;
    weight_cash_collection: number;
    weight_profitability: number;
    weight_debt_aging: number;
    weight_repayment_velocity: number;
    weight_tenure_depth: number;
  }>(
    `SELECT weight_revenue_momentum, weight_cash_collection, weight_profitability,
            weight_debt_aging, weight_repayment_velocity, weight_tenure_depth
       FROM credit_engine_stances
      WHERE id = $1`,
    [stanceId]
  );
  if (rows.length === 0) {
    throw new Error(`Stance ${stanceId} not found in credit_engine_stances`);
  }
  const r = rows[0];
  return {
    revenueMomentum: r.weight_revenue_momentum,
    cashCollection: r.weight_cash_collection,
    profitability: r.weight_profitability,
    debtAging: r.weight_debt_aging,
    repaymentVelocity: r.weight_repayment_velocity,
    tenureDepth: r.weight_tenure_depth
  };
}

/**
 * Computes the engine base amount from DB rows:
 *   - 6mo avg monthly revenue: sum(invoice.total over last 180d, valid) / 6
 *   - 12mo invoice totals: array of invoice.total over last 365d, valid
 * Returns max(avgMonthly, median(totals)) via computeBaseAmount.
 *
 * Applies §1.0 universal guards inline: total >= 0, not reversed/voided,
 * created_at <= now. The application-level cancellation marker is 'reversed';
 * legacy 'voided' is tolerated defensively.
 */
async function computeBaseFromDb(
  client: PoolClient,
  customerId: string,
  now: Date
): Promise<number> {
  const { rows } = await client.query<{ avg_monthly: string; totals: string }>(
    `
    WITH valid_12mo AS (
      SELECT total, created_at
        FROM invoices
       WHERE customer_id = $1
         AND created_at >= $2::timestamptz - INTERVAL '365 days'
         AND created_at <= $2::timestamptz
         AND total >= 0
         AND status NOT IN ('reversed', 'voided')
    )
    SELECT
      COALESCE(
        (SELECT SUM(total) / 6.0
           FROM valid_12mo
          WHERE created_at >= $2::timestamptz - INTERVAL '180 days'),
        0
      )::text AS avg_monthly,
      COALESCE(
        (SELECT json_agg(total) FROM valid_12mo)::text,
        '[]'
      ) AS totals
    `,
    [customerId, now]
  );
  const avgMonthly = Number(rows[0].avg_monthly);
  const totals: number[] = (JSON.parse(rows[0].totals) as Array<string | number>).map((v) =>
    Number(v)
  );
  return computeBaseAmount({
    avgMonthlyRevenue6mo: avgMonthly,
    invoiceTotals12mo: totals
  });
}

/**
 * Counts invoices considered "posted" for the cold-start gate.
 *
 * §1.0 guard: total >= 0, created_at <= now. The actual invoice statuses are
 * `open | partial | paid | reversed`; "posted" here means "invoice was issued
 * and is not reversed" (paid invoices still count as posted history toward
 * cold-start eligibility — see spec §5.3 cold-start gate). Reversed invoices
 * are explicitly excluded; legacy `voided` is also excluded defensively.
 */
async function countPostedInvoices(
  client: PoolClient,
  customerId: string,
  now: Date
): Promise<number> {
  const { rows } = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
       FROM invoices
      WHERE customer_id = $1
        AND status IN ('open','partial','paid')
        AND total >= 0
        AND created_at <= $2::timestamptz`,
    [customerId, now]
  );
  return Number(rows[0].cnt);
}
