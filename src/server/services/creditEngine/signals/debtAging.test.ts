import { describe, it, expect } from 'vitest';
import { scoreDebtAging } from './debtAging';

describe('scoreDebtAging', () => {
  it('returns 100 when no open invoices', () => {
    const out = scoreDebtAging({ invoices: [], dataCount: 0 });
    expect(out.score).toBe(100);
    expect(out.confidence).toBe('none');
  });
  it('returns 100 when invoices exist but none are overdue', () => {
    const out = scoreDebtAging({
      invoices: [{ balance: 1000, daysOverdue: 0 }, { balance: 500, daysOverdue: 0 }],
      dataCount: 2
    });
    expect(out.score).toBe(100);
    expect(out.confidence).toBe('low');
  });
  it('scores ~70 at 15 days overdue (boundary)', () => {
    const out = scoreDebtAging({ invoices: [{ balance: 1000, daysOverdue: 15 }], dataCount: 1 });
    expect(out.score).toBe(70);
  });
  it('scores ~40 at 30 days overdue (boundary)', () => {
    const out = scoreDebtAging({ invoices: [{ balance: 1000, daysOverdue: 30 }], dataCount: 1 });
    expect(out.score).toBe(40);
  });
  it('scores 10 at 60+ days overdue', () => {
    const out = scoreDebtAging({ invoices: [{ balance: 1000, daysOverdue: 60 }], dataCount: 1 });
    expect(out.score).toBe(10);
    const out2 = scoreDebtAging({ invoices: [{ balance: 1000, daysOverdue: 120 }], dataCount: 1 });
    expect(out2.score).toBe(10);
  });
  it('weights aging by balance', () => {
    const out = scoreDebtAging({
      invoices: [{ balance: 1000, daysOverdue: 30 }, { balance: 9000, daysOverdue: 0 }],
      dataCount: 2
    });
    expect(out.score).toBe(94);
  });
  it('throws on negative inputs', () => {
    expect(() => scoreDebtAging({ invoices: [{ balance: -1, daysOverdue: 0 }], dataCount: 1 })).toThrow();
    expect(() => scoreDebtAging({ invoices: [{ balance: 1, daysOverdue: -1 }], dataCount: 1 })).toThrow();
    expect(() => scoreDebtAging({ invoices: [], dataCount: -1 })).toThrow();
  });
});
