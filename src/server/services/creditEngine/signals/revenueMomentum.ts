import type { Pool, PoolClient } from 'pg';
import { bucketConfidence, type ConfidenceLevel } from '../confidence';

export interface RevenueMomentumInput {
  recent: number;
  baseline: number;
  dataCount: number;
}

export interface SignalResult {
  score: number;
  confidence: ConfidenceLevel;
  dataCount: number;
}

export function scoreRevenueMomentum(input: RevenueMomentumInput): SignalResult {
  if (input.recent < 0 || input.baseline < 0 || input.dataCount < 0) {
    throw new Error('revenue momentum inputs must be non-negative');
  }
  const confidence = bucketConfidence(input.dataCount);
  if (input.baseline === 0 && input.recent === 0) {
    return { score: 50, confidence, dataCount: input.dataCount };
  }
  if (input.baseline === 0) {
    return { score: 75, confidence, dataCount: input.dataCount };
  }
  const growthRatio = (input.recent * 3) / input.baseline;
  const raw = 50 + (growthRatio - 1) * 50;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, confidence, dataCount: input.dataCount };
}

interface RevenueMomentumRow {
  recent: string;
  baseline: string;
  cnt: string;
}

/**
 * Fetches recent (last 90d) and baseline (180d window before that, i.e. 90-270d) invoice totals
 * for `customerId` as of `now`, then delegates to scoreRevenueMomentum.
 *
 * Applies §1.0 universal input guards inline: total >= 0, created_at <= now, status != 'voided'.
 */
export async function computeRevenueMomentum(
  client: Pool | PoolClient,
  customerId: string,
  now: Date = new Date()
): Promise<SignalResult> {
  const { rows } = await client.query<RevenueMomentumRow>(
    `
    SELECT
      COALESCE(SUM(CASE WHEN inv.created_at >= $2::timestamptz - INTERVAL '90 days'
                        THEN inv.total ELSE 0 END), 0)::text AS recent,
      COALESCE(SUM(CASE WHEN inv.created_at >= $2::timestamptz - INTERVAL '270 days'
                         AND inv.created_at <  $2::timestamptz - INTERVAL '90 days'
                        THEN inv.total ELSE 0 END), 0)::text AS baseline,
      COUNT(*)::text AS cnt
    FROM invoices inv
    WHERE inv.customer_id = $1
      AND inv.created_at >= $2::timestamptz - INTERVAL '270 days'
      AND inv.created_at <= $2::timestamptz
      AND inv.total >= 0
      AND inv.status != 'voided'
    `,
    [customerId, now]
  );
  const recent = Number(rows[0].recent);
  const baseline = Number(rows[0].baseline);
  const dataCount = Number(rows[0].cnt);
  return scoreRevenueMomentum({ recent, baseline, dataCount });
}
