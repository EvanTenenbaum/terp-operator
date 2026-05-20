import type { Pool, PoolClient } from 'pg';
import type { SignalResult } from './revenueMomentum';

export interface TenureDepthInput {
  daysActive: number;
}

export function scoreTenureDepth(input: TenureDepthInput): SignalResult {
  if (input.daysActive < 0) {
    throw new Error('daysActive must be non-negative');
  }
  let raw: number;
  if (input.daysActive < 180) raw = (input.daysActive * 50) / 180;
  else if (input.daysActive < 365) raw = 50 + ((input.daysActive - 180) * 25) / 185;
  else if (input.daysActive < 730) raw = 75 + ((input.daysActive - 365) * 15) / 365;
  else if (input.daysActive < 1095) raw = 90 + ((input.daysActive - 730) * 10) / 365;
  else raw = 100;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, confidence: 'high', dataCount: 1 };
}

interface TenureDepthRow {
  days_active: string | null;
}

/**
 * Computes how many days `customerId` has been on file as of `now`.
 * Days are floor'd to integer; missing/future-dated customers clamp to 0.
 */
export async function computeTenureDepth(
  client: Pool | PoolClient,
  customerId: string,
  now: Date = new Date()
): Promise<SignalResult> {
  const { rows } = await client.query<TenureDepthRow>(
    `
    SELECT FLOOR(GREATEST(0, EXTRACT(EPOCH FROM ($2::timestamptz - c.created_at)) / 86400))::text AS days_active
    FROM customers c
    WHERE c.id = $1
    `,
    [customerId, now]
  );
  const daysActive = rows.length === 0 || rows[0].days_active === null ? 0 : Number(rows[0].days_active);
  return scoreTenureDepth({ daysActive });
}
