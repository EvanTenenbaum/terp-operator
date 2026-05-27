import { formatMoney } from '../../utils/format';

export type SignalConfidence = 'high' | 'medium' | 'low' | 'none';

export type SignalBucket =
  | 'Critical'
  | 'Weak'
  | 'OK'
  | 'Strong'
  | 'Excellent'
  | 'Cold-start';

export function bucketSignal(
  score: number,
  confidence: SignalConfidence
): SignalBucket {
  if (confidence === 'none') {
    return 'Cold-start';
  }

  const clamped = Math.min(100, Math.max(0, score));

  if (clamped < 20) return 'Critical';
  if (clamped < 40) return 'Weak';
  if (clamped < 60) return 'OK';
  if (clamped < 80) return 'Strong';
  return 'Excellent';
}

export { formatMoney };

export function formatDateish(
  value: Date | string | null | undefined
): string {
  if (value === null || value === undefined) {
    return '-';
  }

  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString();
}

export function progressGlyph(
  current: number,
  required: number
): '✓' | '○' {
  return current >= required ? '✓' : '○';
}

export function classifyDelta(
  delta:
    | {
        direction: 'above' | 'below' | 'within';
        deltaDollars: number;
        deltaPct: number;
      }
    | null
    | undefined
): string {
  if (delta === null || delta === undefined) {
    return 'No engine recommendation yet';
  }

  if (delta.direction === 'within') {
    return 'Matches engine recommendation';
  }

  const absDollars = Math.abs(delta.deltaDollars);
  const displayPct = delta.deltaPct * 100;
  const pctStr = `${displayPct >= 0 ? '+' : ''}${displayPct.toFixed(1)}%`;

  if (delta.direction === 'above') {
    return `${formatMoney(absDollars)} above engine (${pctStr})`;
  }

  return `${formatMoney(absDollars)} below engine (${pctStr})`;
}

export function shouldShowSalesCreditIndicator({
  balance,
  orderTotal,
  manualLimit,
  engineRecommendation,
  source,
}: {
  balance: number;
  orderTotal: number;
  manualLimit: number;
  engineRecommendation: number | null | undefined;
  source: string;
}): boolean {
  if (source !== 'manual') return false;
  if (engineRecommendation == null || !Number.isFinite(engineRecommendation)) return false;
  if (engineRecommendation >= manualLimit) return false;
  const projected = balance + orderTotal;
  return projected > engineRecommendation && projected <= manualLimit;
}

export interface CreditEngineWeights {
  revenueMomentum: number;
  cashCollection: number;
  profitability: number;
  debtAging: number;
  repaymentVelocity: number;
  tenureDepth: number;
}

export interface CreditEngineStance {
  id: string;
  name: string;
  description: string | null;
  weights: CreditEngineWeights;
  isSeeded: boolean;
  customerCount: number;
}

export interface CreditEngineConfig {
  globalDefaultStanceId: string;
  coldStartMinPostedInvoices: number;
  coldStartMinTenureDays: number;
  manualOverrideReminderDefaultDays: number;
  manualOverrideSnoozeCapDays: number;
  shadowMode: boolean;
}

export function formatWeightsSummary(weights: CreditEngineWeights): string {
  return [
    `R:${weights.revenueMomentum}`,
    `C:${weights.cashCollection}`,
    `P:${weights.profitability}`,
    `D:${weights.debtAging}`,
    `V:${weights.repaymentVelocity}`,
    `T:${weights.tenureDepth}`,
  ].join(' ');
}
