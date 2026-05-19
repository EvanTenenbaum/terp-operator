import type { Pool, PoolClient } from 'pg';
import { bucketConfidence } from '../confidence';
import type { SignalResult } from './revenueMomentum';

export interface DebtAgingInvoice {
  balance: number;
  daysOverdue: number;
}

export interface DebtAgingInput {
  invoices: DebtAgingInvoice[];
  dataCount: number;
}

export function scoreDebtAging(input: DebtAgingInput): SignalResult {
  if (input.dataCount < 0) {
    throw new Error('dataCount must be non-negative');
  }
  for (const inv of input.invoices) {
    if (inv.balance < 0) {
      throw new Error('invoice balance must be non-negative');
    }
    if (inv.daysOverdue < 0) {
      throw new Error('daysOverdue must be non-negative');
    }
  }
  const confidence = bucketConfidence(input.dataCount);
  const totalBalance = input.invoices.reduce((a, b) => a + b.balance, 0);
  if (totalBalance === 0) {
    return { score: 100, confidence, dataCount: input.dataCount };
  }
  const weightedOverdue =
    input.invoices.reduce((sum, inv) => sum + inv.daysOverdue * inv.balance, 0) / totalBalance;

  let rawScore: number;
  if (weightedOverdue === 0)            rawScore = 100;
  else if (weightedOverdue < 15)        rawScore = 100 - weightedOverdue * (30 / 15);
  else if (weightedOverdue < 30)        rawScore = 70  - (weightedOverdue - 15) * (30 / 15);
  else if (weightedOverdue < 60)        rawScore = 40  - (weightedOverdue - 30) * (30 / 30);
  else                                  rawScore = 10;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  return { score, confidence, dataCount: input.dataCount };
}

interface DebtAgingRow {
  balance: string;
  days_overdue: string;
}

/**
 * Fetches outstanding invoice balances for `customerId` as of `now`, excluding any
 * invoices with an active dispute (status IN ('open','investigating')).
 *
 * Open-balance criterion: status IN ('open','partial','posted') AND total > amount_paid.
 *
 * Note: Phase 0 audit confirmed disputes use both 'open' and 'investigating' as active
 * statuses (see docs/credit-engine-data-audit-2026-05-18.md).
 */
export async function computeDebtAging(
  client: Pool | PoolClient,
  customerId: string,
  now: Date = new Date()
): Promise<SignalResult> {
  const { rows } = await client.query<DebtAgingRow>(
    `
    SELECT
      (inv.total - inv.amount_paid)::text                                                   AS balance,
      GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - inv.due_date)) / 86400)::text       AS days_overdue
    FROM invoices inv
    WHERE inv.customer_id = $1
      AND inv.status IN ('open', 'partial', 'posted')
      AND inv.total > inv.amount_paid
      AND inv.total >= 0
      AND inv.created_at <= $2::timestamptz
      AND inv.status != 'voided'
      AND NOT EXISTS (
        SELECT 1 FROM invoice_disputes d
        WHERE d.invoice_id = inv.id
          AND d.status IN ('open', 'investigating')
      )
    `,
    [customerId, now]
  );
  const invoices: DebtAgingInvoice[] = rows.map((r) => ({
    balance: Number(r.balance),
    daysOverdue: Number(r.days_overdue)
  }));
  return scoreDebtAging({ invoices, dataCount: invoices.length });
}
