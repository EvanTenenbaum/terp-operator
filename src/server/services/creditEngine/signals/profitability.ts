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
