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
