import { describe, it, expect } from 'vitest';
import { scoreProfitability } from './profitability';

describe('scoreProfitability', () => {
  it('returns 50 when no revenue in window', () => {
    const out = scoreProfitability({ revenue: 0, cogs: 0, dataCount: 0 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('none');
  });
  it('returns 100 at 50% margin', () => {
    const out = scoreProfitability({ revenue: 10000, cogs: 5000, dataCount: 12 });
    expect(out.score).toBe(100);
  });
  it('returns 50 at 25% margin', () => {
    const out = scoreProfitability({ revenue: 10000, cogs: 7500, dataCount: 6 });
    expect(out.score).toBe(50);
  });
  it('returns 0 at 0% margin', () => {
    const out = scoreProfitability({ revenue: 10000, cogs: 10000, dataCount: 4 });
    expect(out.score).toBe(0);
  });
  it('clamps to 0 if cogs exceeds revenue (loss-making)', () => {
    const out = scoreProfitability({ revenue: 10000, cogs: 12000, dataCount: 5 });
    expect(out.score).toBe(0);
  });
  it('clamps to 100 above 50% margin', () => {
    const out = scoreProfitability({ revenue: 10000, cogs: 2000, dataCount: 8 });
    expect(out.score).toBe(100);
  });
  it('throws on negative inputs', () => {
    expect(() => scoreProfitability({ revenue: -1, cogs: 0, dataCount: 1 })).toThrow();
    expect(() => scoreProfitability({ revenue: 100, cogs: -1, dataCount: 1 })).toThrow();
    expect(() => scoreProfitability({ revenue: 100, cogs: 50, dataCount: -1 })).toThrow();
  });
});
