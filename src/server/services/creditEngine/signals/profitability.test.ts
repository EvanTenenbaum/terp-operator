import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from '../../../db';
import { scoreProfitability, computeProfitability } from './profitability';

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

describe('computeProfitability (integration)', () => {
  let customerId = '';

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(`
      SELECT customer_id AS id FROM sales_orders
       WHERE total > 0
       GROUP BY customer_id
       HAVING COUNT(*) >= 3
       LIMIT 1
    `);
    if (rows.length === 0) {
      throw new Error('No seeded customer with >= 3 sales orders; run pnpm db:seed:realistic');
    }
    customerId = rows[0].id;
  });

  it('returns a valid SignalResult shape against seeded data', async () => {
    const result = await computeProfitability(pool, customerId);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['high', 'medium', 'low', 'none']).toContain(result.confidence);
    expect(result.dataCount).toBeGreaterThan(0);
  });

  it('returns score=50 / confidence=none for an unknown customer', async () => {
    const result = await computeProfitability(pool, '00000000-0000-0000-0000-000000000000');
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('none');
    expect(result.dataCount).toBe(0);
  });
});
