import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from '../../../db';
import { scoreRepaymentVelocity, computeRepaymentVelocity } from './repaymentVelocity';

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

describe('computeRepaymentVelocity (integration)', () => {
  let customerWithPaidInvoices: string | null = null;

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(`
      SELECT customer_id AS id FROM invoices
       WHERE status = 'paid'
       GROUP BY customer_id
       HAVING COUNT(*) >= 1
       LIMIT 1
    `);
    customerWithPaidInvoices = rows.length === 0 ? null : rows[0].id;
  });

  it('returns a valid SignalResult shape against seeded data', async () => {
    if (customerWithPaidInvoices === null) {
      // Seeded data has no paid invoices on any customer — fall back to a structural check
      // on an unknown customer (the no-paid-invoices branch).
      const result = await computeRepaymentVelocity(pool, '00000000-0000-0000-0000-000000000000');
      expect(result.dataCount).toBe(0);
      expect(result.score).toBe(50);
      expect(result.confidence).toBe('none');
      return;
    }
    const result = await computeRepaymentVelocity(pool, customerWithPaidInvoices);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['high', 'medium', 'low', 'none']).toContain(result.confidence);
    expect(result.dataCount).toBeGreaterThan(0);
  });

  it('returns score=50 / confidence=none for an unknown customer (no paid invoices)', async () => {
    const result = await computeRepaymentVelocity(pool, '00000000-0000-0000-0000-000000000000');
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('none');
    expect(result.dataCount).toBe(0);
  });
});
