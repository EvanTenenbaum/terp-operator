import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from '../../../db';
import { scoreCashCollection, computeCashCollection } from './cashCollection';

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

describe('computeCashCollection (integration)', () => {
  let customerId = '';

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(`
      SELECT customer_id AS id FROM invoices
       WHERE total > 0
       GROUP BY customer_id
       HAVING COUNT(*) >= 3
       LIMIT 1
    `);
    if (rows.length === 0) {
      throw new Error('No seeded customer with >= 3 invoices; run pnpm db:seed:realistic');
    }
    customerId = rows[0].id;
  });

  it('returns a valid SignalResult shape against seeded data', async () => {
    const result = await computeCashCollection(pool, customerId);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['high', 'medium', 'low', 'none']).toContain(result.confidence);
    expect(result.dataCount).toBeGreaterThan(0);
  });

  it('returns score=50 / confidence=none for an unknown customer', async () => {
    const result = await computeCashCollection(pool, '00000000-0000-0000-0000-000000000000');
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('none');
    expect(result.dataCount).toBe(0);
  });
});
