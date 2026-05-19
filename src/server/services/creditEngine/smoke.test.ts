import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../../db';
import {
  aggregateOverallScore,
  mapScoreToMultiplier,
  computeBaseAmount,
  type Weights,
  type SignalScores
} from './index';

describe('engine smoke', () => {
  beforeAll(async () => {
    const { rows } = await pool.query<{ name: string }>(
      `SELECT name FROM credit_engine_stances WHERE name = 'Balanced'`
    );
    if (rows.length === 0) {
      throw new Error('Balanced stance not seeded — run pnpm db:seed first');
    }
  });

  afterAll(async () => {
    // Don't pool.end() — vitest may reuse the connection across files
  });

  it('reproduces the §2.3 Harbor Logistics worked example', () => {
    const weights: Weights = {
      revenueMomentum: 20, cashCollection: 20, profitability: 15,
      debtAging: 15, repaymentVelocity: 20, tenureDepth: 10
    };
    const scores: SignalScores = {
      revenueMomentum: 60, cashCollection: 92, profitability: 44,
      debtAging: 84, repaymentVelocity: 68, tenureDepth: 71
    };
    const overall = aggregateOverallScore(scores, weights);
    expect(overall).toBe(70);

    const multiplier = mapScoreToMultiplier(overall);
    expect(multiplier).toBe(2.0);

    const base = computeBaseAmount({ avgMonthlyRevenue6mo: 15000, invoiceTotals12mo: [12000, 15000, 18000] });
    expect(base).toBe(15000);

    expect(base * multiplier).toBe(30000);
  });
});
