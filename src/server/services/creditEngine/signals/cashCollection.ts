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
