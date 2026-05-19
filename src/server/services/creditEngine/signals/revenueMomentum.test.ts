import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from '../../../db';
import { scoreRevenueMomentum, computeRevenueMomentum } from './revenueMomentum';

describe('scoreRevenueMomentum', () => {
  it('returns 50 when both windows have zero revenue (dataCount=0 → confidence none)', () => {
    const out = scoreRevenueMomentum({ recent: 0, baseline: 0, dataCount: 0 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('none');
  });
  it('returns 75 when baseline is zero but recent is positive', () => {
    const out = scoreRevenueMomentum({ recent: 5000, baseline: 0, dataCount: 4 });
    expect(out.score).toBe(75);
    expect(out.confidence).toBe('medium');
  });
  it('returns 50 when recent matches baseline-normalized (flat trend)', () => {
    const out = scoreRevenueMomentum({ recent: 6000, baseline: 18000, dataCount: 20 });
    expect(out.score).toBe(50);
    expect(out.confidence).toBe('high');
  });
  it('returns 100 when 2x baseline-normalized growth', () => {
    const out = scoreRevenueMomentum({ recent: 12000, baseline: 18000, dataCount: 15 });
    expect(out.score).toBe(100);
  });
  it('clamps to 0 on extreme decline', () => {
    const out = scoreRevenueMomentum({ recent: 0, baseline: 18000, dataCount: 10 });
    expect(out.score).toBe(0);
  });
  it('clamps to 100 on extreme growth', () => {
    const out = scoreRevenueMomentum({ recent: 60000, baseline: 18000, dataCount: 14 });
    expect(out.score).toBe(100);
  });
  it('throws on negative inputs', () => {
    expect(() => scoreRevenueMomentum({ recent: -1, baseline: 100, dataCount: 1 })).toThrow();
    expect(() => scoreRevenueMomentum({ recent: 100, baseline: -1, dataCount: 1 })).toThrow();
    expect(() => scoreRevenueMomentum({ recent: 100, baseline: 100, dataCount: -1 })).toThrow();
  });
});

describe('computeRevenueMomentum (integration)', () => {
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
    const result = await computeRevenueMomentum(pool, customerId);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['high', 'medium', 'low', 'none']).toContain(result.confidence);
    expect(result.dataCount).toBeGreaterThan(0);
  });

  it('returns score=50 / confidence=none for an unknown customer', async () => {
    const result = await computeRevenueMomentum(pool, '00000000-0000-0000-0000-000000000000');
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('none');
    expect(result.dataCount).toBe(0);
  });

  it('accepts a deterministic clock (now param)', async () => {
    // Pin "now" to far in the past so the customer has zero invoices in window.
    const result = await computeRevenueMomentum(pool, customerId, new Date('2000-01-01T00:00:00Z'));
    expect(result.dataCount).toBe(0);
    expect(result.score).toBe(50);
  });
});
