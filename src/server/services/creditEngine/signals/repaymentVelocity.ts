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
