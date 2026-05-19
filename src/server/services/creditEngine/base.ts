export interface BaseInput {
  avgMonthlyRevenue6mo: number;
  invoiceTotals12mo: number[];
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeBaseAmount(input: BaseInput): number {
  if (input.avgMonthlyRevenue6mo < 0) {
    throw new Error('avgMonthlyRevenue6mo must be non-negative');
  }
  for (const v of input.invoiceTotals12mo) {
    if (v < 0) throw new Error('invoice totals must be non-negative');
  }
  return Math.max(input.avgMonthlyRevenue6mo, median(input.invoiceTotals12mo));
}
