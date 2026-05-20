import type { Pool, PoolClient } from 'pg';
import { bucketConfidence } from '../confidence';
import type { SignalResult } from './revenueMomentum';

export interface RepaymentVelocityInput {
  avgDaysLate: number;
  dataCount: number;
}

export function scoreRepaymentVelocity(input: RepaymentVelocityInput): SignalResult {
  if (input.avgDaysLate < 0 || input.dataCount < 0) {
    throw new Error('repayment velocity inputs must be non-negative');
  }
  const confidence = bucketConfidence(input.dataCount);
  if (input.dataCount === 0) {
    return { score: 50, confidence, dataCount: 0 };
  }
  const raw = 100 - input.avgDaysLate * 4;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, confidence, dataCount: input.dataCount };
}

interface RepaymentVelocityRow {
  avg_days_late: string | null;
  cnt: string;
}

/**
 * Computes average days-late on paid invoices for `customerId` over the last 365 days,
 * using updated_at as a proxy for paid_at on status='paid' invoices.
 *
 * Lateness is clamped to >= 0 (early payments contribute 0, not negative days).
 * Applies §1.0 universal input guards inline.
 */
export async function computeRepaymentVelocity(
  client: Pool | PoolClient,
  customerId: string,
  now: Date = new Date()
): Promise<SignalResult> {
  const { rows } = await client.query<RepaymentVelocityRow>(
    `
    SELECT
      AVG(GREATEST(0, EXTRACT(EPOCH FROM (inv.updated_at - inv.due_date)) / 86400))::text AS avg_days_late,
      COUNT(*)::text                                                                       AS cnt
    FROM invoices inv
    WHERE inv.customer_id = $1
      AND inv.status = 'paid'
      AND inv.created_at >= $2::timestamptz - INTERVAL '365 days'
      AND inv.created_at <= $2::timestamptz
      AND inv.total >= 0
    `,
    [customerId, now]
  );
  const dataCount = Number(rows[0].cnt);
  const avgDaysLate = rows[0].avg_days_late === null ? 0 : Number(rows[0].avg_days_late);
  return scoreRepaymentVelocity({ avgDaysLate, dataCount });
}
