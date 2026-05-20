import type { Pool, PoolClient } from 'pg';
import { bucketConfidence } from '../confidence';
import type { SignalResult } from './revenueMomentum';

export interface ProfitabilityInput {
  revenue: number;
  cogs: number;
  dataCount: number;
}

export function scoreProfitability(input: ProfitabilityInput): SignalResult {
  if (input.revenue < 0 || input.cogs < 0 || input.dataCount < 0) {
    throw new Error('profitability inputs must be non-negative');
  }
  const confidence = bucketConfidence(input.dataCount);
  if (input.revenue === 0) {
    return { score: 50, confidence, dataCount: input.dataCount };
  }
  const marginRate = (input.revenue - input.cogs) / input.revenue;
  const raw = marginRate * 200;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, confidence, dataCount: input.dataCount };
}

interface ProfitabilityRow {
  revenue: string;
  cogs: string;
  cnt: string;
}

/**
 * Computes revenue (sum of sales_orders.total) and COGS (sum of sales_order_lines.qty * unit_cost)
 * for `customerId` over the last 365 days as of `now`.
 * Applies §1.0 input guards: sales orders (total >= 0, not reversed/voided,
 * created_at <= now) and order lines (qty > 0, unit_cost > 0). Sales orders
 * are reversed (not voided) by the application; voided is tolerated defensively.
 */
export async function computeProfitability(
  client: Pool | PoolClient,
  customerId: string,
  now: Date = new Date()
): Promise<SignalResult> {
  const { rows } = await client.query<ProfitabilityRow>(
    `
    WITH eligible_orders AS (
      SELECT so.id, so.total
      FROM sales_orders so
      WHERE so.customer_id = $1
        AND so.created_at >= $2::timestamptz - INTERVAL '365 days'
        AND so.created_at <= $2::timestamptz
        AND so.total >= 0
        AND so.status NOT IN ('reversed', 'voided')
    ),
    line_cogs AS (
      SELECT COALESCE(SUM(sol.qty * sol.unit_cost), 0) AS cogs
      FROM sales_order_lines sol
      JOIN eligible_orders eo ON eo.id = sol.order_id
      WHERE sol.qty > 0 AND sol.unit_cost > 0
    )
    SELECT
      COALESCE((SELECT SUM(total) FROM eligible_orders), 0)::text AS revenue,
      (SELECT cogs FROM line_cogs)::text                          AS cogs,
      (SELECT COUNT(*) FROM eligible_orders)::text                AS cnt
    `,
    [customerId, now]
  );
  const revenue = Number(rows[0].revenue);
  const cogs = Number(rows[0].cogs);
  const dataCount = Number(rows[0].cnt);
  return scoreProfitability({ revenue, cogs, dataCount });
}
