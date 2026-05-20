import { describe, it, expect } from 'vitest';
import { computeBaseAmount, median } from './base';

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });
  it('returns middle element of odd-length sorted array', () => {
    expect(median([10, 50, 30])).toBe(30);
  });
  it('returns mean of two middle elements of even-length array', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe('computeBaseAmount', () => {
  it('returns 0 when no signals at all', () => {
    expect(computeBaseAmount({ avgMonthlyRevenue6mo: 0, invoiceTotals12mo: [] })).toBe(0);
  });
  it('takes max(avgMonthlyRevenue, medianInvoice)', () => {
    expect(computeBaseAmount({ avgMonthlyRevenue6mo: 10000, invoiceTotals12mo: [5000, 7000, 9000] })).toBe(10000);
    expect(computeBaseAmount({ avgMonthlyRevenue6mo: 5000, invoiceTotals12mo: [15000, 20000] })).toBe(17500);
  });
  it('throws on negative monthly revenue', () => {
    expect(() => computeBaseAmount({ avgMonthlyRevenue6mo: -1, invoiceTotals12mo: [] })).toThrow();
  });
  it('throws on any negative invoice total', () => {
    expect(() => computeBaseAmount({ avgMonthlyRevenue6mo: 0, invoiceTotals12mo: [100, -1] })).toThrow();
  });
});
