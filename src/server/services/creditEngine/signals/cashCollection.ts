import type { Pool, PoolClient } from 'pg';
import { bucketConfidence } from '../confidence';
import type { SignalResult } from './revenueMomentum';

export interface CashCollectionInput {
  invoiced: number;
  paid: number;
  dataCount: number;
}

export function scoreCashCollection(input: CashCollectionInput): SignalResult {
  if (input.invoiced < 0 || input.paid < 0 || input.dataCount < 0) {
    throw new Error('cash collection inputs must be non-negative');
  }
  const confidence = bucketConfidence(input.dataCount);
  if (input.invoiced === 0) {
    return { score: 50, confidence, dataCount: input.dataCount };
  }
  const rate = input.paid / input.invoiced;
  const score = Math.max(0, Math.min(100, Math.round(rate * 100)));
  return { score, confidence, dataCount: input.dataCount };
}

interface CashCollectionRow {
  invoiced: string;
  paid: string;
  cnt: string;
}

/**
 * Sums invoiced totals vs amount_paid for the last 365 days for `customerId` as of `now`.
 * Applies §1.0 universal input guards inline.
 */
export async function computeCashCollection(
  client: Pool | PoolClient,
  customerId: string,
  now: Date = new Date()
): Promise<SignalResult> {
  const { rows } = await client.query<CashCollectionRow>(
    `
    SELECT
      COALESCE(SUM(inv.total), 0)::text       AS invoiced,
      COALESCE(SUM(inv.amount_paid), 0)::text AS paid,
      COUNT(*)::text                          AS cnt
    FROM invoices inv
    WHERE inv.customer_id = $1
      AND inv.created_at >= $2::timestamptz - INTERVAL '365 days'
      AND inv.created_at <= $2::timestamptz
      AND inv.total >= 0
      AND inv.status NOT IN ('reversed', 'voided')
    `,
    [customerId, now]
  );
  const invoiced = Number(rows[0].invoiced);
  const paid = Number(rows[0].paid);
  const dataCount = Number(rows[0].cnt);
  return scoreCashCollection({ invoiced, paid, dataCount });
}
