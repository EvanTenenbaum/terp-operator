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
