import { describe, it, expect } from 'vitest';
import { scoreRepaymentVelocity } from './repaymentVelocity';

describe('scoreRepaymentVelocity', () => {
  it('returns 50 when no paid invoices', () => {
    const out = scoreRepaymentVelocity({ avgDaysLate: 0, dataCount: 0 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('none');
  });
  it('returns 100 when avg 0 days late', () => {
    const out = scoreRepaymentVelocity({ avgDaysLate: 0, dataCount: 10 });
    expect(out.score).toBe(100);
  });
  it('returns 60 at 10 days late (boundary)', () => {
    const out = scoreRepaymentVelocity({ avgDaysLate: 10, dataCount: 5 });
    expect(out.score).toBe(60);
  });
  it('returns 0 at 30+ days late', () => {
    const out = scoreRepaymentVelocity({ avgDaysLate: 30, dataCount: 4 });
    expect(out.score).toBe(0);
    const out2 = scoreRepaymentVelocity({ avgDaysLate: 90, dataCount: 4 });
    expect(out2.score).toBe(0);
  });
  it('throws on negative inputs', () => {
    expect(() => scoreRepaymentVelocity({ avgDaysLate: -1, dataCount: 1 })).toThrow();
    expect(() => scoreRepaymentVelocity({ avgDaysLate: 0, dataCount: -1 })).toThrow();
  });
});
