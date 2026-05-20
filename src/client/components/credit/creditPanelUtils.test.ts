import { describe, it, expect } from 'vitest';
import {
  bucketSignal,
  formatMoney,
  formatDateish,
  progressGlyph,
  classifyDelta,
  shouldShowSalesCreditIndicator,
  formatWeightsSummary,
} from './creditPanelUtils';

describe('bucketSignal', () => {
  it('returns Cold-start when confidence is none regardless of score', () => {
    expect(bucketSignal(0, 'none')).toBe('Cold-start');
    expect(bucketSignal(50, 'none')).toBe('Cold-start');
    expect(bucketSignal(100, 'none')).toBe('Cold-start');
  });

  it.each([
    [0, 'Critical'],
    [19, 'Critical'],
    [20, 'Weak'],
    [39, 'Weak'],
    [40, 'OK'],
    [59, 'OK'],
    [60, 'Strong'],
    [79, 'Strong'],
    [80, 'Excellent'],
    [100, 'Excellent'],
  ] as const)('buckets score %i into %s', (score, expected) => {
    expect(bucketSignal(score, 'high')).toBe(expected);
    expect(bucketSignal(score, 'medium')).toBe(expected);
    expect(bucketSignal(score, 'low')).toBe(expected);
  });

  it('clamps negative scores to 0', () => {
    expect(bucketSignal(-10, 'high')).toBe('Critical');
    expect(bucketSignal(-100, 'high')).toBe('Critical');
  });

  it('clamps scores above 100 to 100', () => {
    expect(bucketSignal(101, 'high')).toBe('Excellent');
    expect(bucketSignal(500, 'high')).toBe('Excellent');
  });
});

describe('formatMoney', () => {
  it('returns "$0" for nullish values', () => {
    expect(formatMoney(null)).toBe('$0');
    expect(formatMoney(undefined)).toBe('$0');
  });

  it('formats whole dollars without cents', () => {
    expect(formatMoney(200)).toBe('$200');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(1234567)).toBe('$1,234,567');
  });

  it('formats values with cents using 2 fraction digits', () => {
    expect(formatMoney(200.5)).toBe('$200.50');
    expect(formatMoney(0.99)).toBe('$0.99');
    expect(formatMoney(1234.56)).toBe('$1,234.56');
  });
});

describe('formatDateish', () => {
  it('returns "-" for nullish values', () => {
    expect(formatDateish(null)).toBe('-');
    expect(formatDateish(undefined)).toBe('-');
  });

  it('returns String(value) for invalid dates', () => {
    expect(formatDateish('not-a-date')).toBe('not-a-date');
    expect(formatDateish('')).toBe('');
    expect(formatDateish(new Date('invalid'))).toBe('Invalid Date');
  });

  it('returns a locale date string for valid dates', () => {
    const date = new Date(2024, 5, 15);
    const result = formatDateish(date);
    expect(result).not.toBe('-');
    expect(result).not.toBe(String(date));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a locale date string for valid date strings', () => {
    const result = formatDateish('2024-06-15');
    expect(result).not.toBe('-');
    expect(result).not.toBe('2024-06-15');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('progressGlyph', () => {
  it('returns "✓" when current >= required', () => {
    expect(progressGlyph(5, 5)).toBe('✓');
    expect(progressGlyph(10, 5)).toBe('✓');
    expect(progressGlyph(0, 0)).toBe('✓');
  });

  it('returns "○" when current < required', () => {
    expect(progressGlyph(4, 5)).toBe('○');
    expect(progressGlyph(0, 1)).toBe('○');
    expect(progressGlyph(-1, 0)).toBe('○');
  });
});

describe('classifyDelta', () => {
  it('returns fallback for nullish', () => {
    const expected = 'No engine recommendation yet';
    expect(classifyDelta(null)).toBe(expected);
    expect(classifyDelta(undefined)).toBe(expected);
  });

  it('returns match text for within', () => {
    expect(
      classifyDelta({ direction: 'within', deltaDollars: 0, deltaPct: 0 })
    ).toBe('Matches engine recommendation');
  });

  it('formats above correctly with ratio input', () => {
    expect(
      classifyDelta({ direction: 'above', deltaDollars: 200, deltaPct: 0.25 })
    ).toBe('$200 above engine (+25.0%)');
    expect(
      classifyDelta({ direction: 'above', deltaDollars: 200, deltaPct: 1.5 })
    ).toBe('$200 above engine (+150.0%)');
  });

  it('formats below correctly with ratio input', () => {
    expect(
      classifyDelta({ direction: 'below', deltaDollars: -150, deltaPct: -0.125 })
    ).toBe('$150 below engine (-12.5%)');
  });
});

describe('shouldShowSalesCreditIndicator', () => {
  it('returns false when source is not manual', () => {
    expect(
      shouldShowSalesCreditIndicator({
        balance: 100,
        orderTotal: 50,
        manualLimit: 200,
        engineRecommendation: 120,
        source: 'engine',
      })
    ).toBe(false);
  });

  it('returns false when engineRecommendation is null or undefined', () => {
    expect(
      shouldShowSalesCreditIndicator({
        balance: 100,
        orderTotal: 50,
        manualLimit: 200,
        engineRecommendation: null,
        source: 'manual',
      })
    ).toBe(false);

    expect(
      shouldShowSalesCreditIndicator({
        balance: 100,
        orderTotal: 50,
        manualLimit: 200,
        engineRecommendation: undefined,
        source: 'manual',
      })
    ).toBe(false);
  });

  it('returns false when engineRecommendation is not lower than manualLimit', () => {
    expect(
      shouldShowSalesCreditIndicator({
        balance: 100,
        orderTotal: 50,
        manualLimit: 200,
        engineRecommendation: 200,
        source: 'manual',
      })
    ).toBe(false);

    expect(
      shouldShowSalesCreditIndicator({
        balance: 100,
        orderTotal: 50,
        manualLimit: 200,
        engineRecommendation: 250,
        source: 'manual',
      })
    ).toBe(false);
  });

  it('returns false when projected total is within engine recommendation', () => {
    expect(
      shouldShowSalesCreditIndicator({
        balance: 50,
        orderTotal: 50,
        manualLimit: 200,
        engineRecommendation: 120,
        source: 'manual',
      })
    ).toBe(false);
  });

  it('returns false when projected total exceeds manualLimit', () => {
    expect(
      shouldShowSalesCreditIndicator({
        balance: 150,
        orderTotal: 100,
        manualLimit: 200,
        engineRecommendation: 120,
        source: 'manual',
      })
    ).toBe(false);
  });

  it('returns true when projected total is above engine recommendation but within manual limit', () => {
    expect(
      shouldShowSalesCreditIndicator({
        balance: 100,
        orderTotal: 50,
        manualLimit: 200,
        engineRecommendation: 120,
        source: 'manual',
      })
    ).toBe(true);
  });

  it('returns true when balance alone exceeds engine recommendation but is within manual limit', () => {
    expect(
      shouldShowSalesCreditIndicator({
        balance: 130,
        orderTotal: 0,
        manualLimit: 200,
        engineRecommendation: 120,
        source: 'manual',
      })
    ).toBe(true);
  });
});

describe('formatWeightsSummary', () => {
  it('formats weights into a compact summary', () => {
    expect(
      formatWeightsSummary({
        revenueMomentum: 10,
        cashCollection: 20,
        profitability: 30,
        debtAging: 15,
        repaymentVelocity: 5,
        tenureDepth: 20,
      })
    ).toBe('R:10 C:20 P:30 D:15 V:5 T:20');
  });

  it('handles zero weights', () => {
    expect(
      formatWeightsSummary({
        revenueMomentum: 0,
        cashCollection: 0,
        profitability: 0,
        debtAging: 0,
        repaymentVelocity: 0,
        tenureDepth: 0,
      })
    ).toBe('R:0 C:0 P:0 D:0 V:0 T:0');
  });
});
