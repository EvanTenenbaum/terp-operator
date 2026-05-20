import { describe, it, expect, beforeAll } from 'vitest';
import { pool } from '../../../db';
import { scoreTenureDepth, computeTenureDepth } from './tenureDepth';

describe('scoreTenureDepth', () => {
  it('returns 0 for brand new customer (0 days)', () => {
    expect(scoreTenureDepth({ daysActive: 0 }).score).toBe(0);
  });
  it('returns 50 at 180 days', () => {
    expect(scoreTenureDepth({ daysActive: 180 }).score).toBe(50);
  });
  it('returns 75 at 365 days', () => {
    expect(scoreTenureDepth({ daysActive: 365 }).score).toBe(75);
  });
  it('returns 90 at 730 days', () => {
    expect(scoreTenureDepth({ daysActive: 730 }).score).toBe(90);
  });
  it('returns 100 at 1095+ days', () => {
    expect(scoreTenureDepth({ daysActive: 1095 }).score).toBe(100);
    expect(scoreTenureDepth({ daysActive: 5000 }).score).toBe(100);
  });
  it('linearly interpolates between checkpoints (e.g., 90 days)', () => {
    expect(scoreTenureDepth({ daysActive: 90 }).score).toBe(25);
  });
  it('confidence is always "high"', () => {
    expect(scoreTenureDepth({ daysActive: 30 }).confidence).toBe('high');
    expect(scoreTenureDepth({ daysActive: 1000 }).confidence).toBe('high');
  });
  it('throws on negative tenure', () => {
    expect(() => scoreTenureDepth({ daysActive: -1 })).toThrow();
  });
});

describe('computeTenureDepth (integration)', () => {
  let customerId = '';

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM customers LIMIT 1`);
    if (rows.length === 0) {
      throw new Error('No seeded customers; run pnpm db:seed:realistic');
    }
    customerId = rows[0].id;
  });

  it('returns a valid SignalResult shape against a seeded customer', async () => {
    const result = await computeTenureDepth(pool, customerId);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.confidence).toBe('high');
    expect(result.dataCount).toBe(1);
  });

  it('returns score=0 for a missing customer (treated as 0 days active)', async () => {
    const result = await computeTenureDepth(pool, '00000000-0000-0000-0000-000000000000');
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('high');
  });

  it('accepts a deterministic clock to score tenure at a future date (mature customer)', async () => {
    // Pin "now" 3+ years past the customer's createdAt to force the 100 score branch.
    const result = await computeTenureDepth(pool, customerId, new Date('2099-12-31T00:00:00Z'));
    expect(result.score).toBe(100);
  });

  it('clamps negative tenure to 0 when "now" precedes customer creation', async () => {
    const result = await computeTenureDepth(pool, customerId, new Date('1990-01-01T00:00:00Z'));
    expect(result.score).toBe(0);
  });
});
