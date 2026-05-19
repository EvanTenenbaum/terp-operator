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
