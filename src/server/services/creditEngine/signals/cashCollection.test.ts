import { describe, it, expect } from 'vitest';
import { scoreCashCollection } from './cashCollection';

describe('scoreCashCollection', () => {
  it('returns 50 when no invoices in window', () => {
    const out = scoreCashCollection({ invoiced: 0, paid: 0, dataCount: 0 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('none');
  });
  it('returns 100 when fully paid', () => {
    const out = scoreCashCollection({ invoiced: 10000, paid: 10000, dataCount: 12 });
    expect(out.score).toBe(100);
    expect(out.confidence).toBe('high');
  });
  it('returns 50 when half paid', () => {
    const out = scoreCashCollection({ invoiced: 10000, paid: 5000, dataCount: 8 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('medium');
  });
  it('returns 0 when nothing paid', () => {
    const out = scoreCashCollection({ invoiced: 10000, paid: 0, dataCount: 3 });
    expect(out.score).toBe(0);
  });
  it('clamps to 100 if paid exceeds invoiced (refund edge case)', () => {
    const out = scoreCashCollection({ invoiced: 10000, paid: 12000, dataCount: 5 });
    expect(out.score).toBe(100);
  });
  it('throws on negative inputs', () => {
    expect(() => scoreCashCollection({ invoiced: -1, paid: 0, dataCount: 1 })).toThrow();
    expect(() => scoreCashCollection({ invoiced: 100, paid: -1, dataCount: 1 })).toThrow();
    expect(() => scoreCashCollection({ invoiced: 100, paid: 100, dataCount: -1 })).toThrow();
  });
});
