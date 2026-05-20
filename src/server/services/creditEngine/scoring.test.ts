import { describe, it, expect } from 'vitest';
import { aggregateOverallScore, mapScoreToMultiplier, type Weights, type SignalScores } from './scoring';

const balancedWeights: Weights = {
  revenueMomentum: 20, cashCollection: 20, profitability: 15,
  debtAging: 15, repaymentVelocity: 20, tenureDepth: 10
};

describe('aggregateOverallScore', () => {
  it('combines signals using weights', () => {
    const scores: SignalScores = {
      revenueMomentum: 60, cashCollection: 92, profitability: 44,
      debtAging: 84, repaymentVelocity: 68, tenureDepth: 71
    };
    expect(aggregateOverallScore(scores, balancedWeights)).toBe(70);
  });
  it('returns 0 when all scores are 0', () => {
    const scores: SignalScores = {
      revenueMomentum: 0, cashCollection: 0, profitability: 0,
      debtAging: 0, repaymentVelocity: 0, tenureDepth: 0
    };
    expect(aggregateOverallScore(scores, balancedWeights)).toBe(0);
  });
  it('returns 100 when all scores are 100', () => {
    const scores: SignalScores = {
      revenueMomentum: 100, cashCollection: 100, profitability: 100,
      debtAging: 100, repaymentVelocity: 100, tenureDepth: 100
    };
    expect(aggregateOverallScore(scores, balancedWeights)).toBe(100);
  });
  it('throws if weights do not sum to 100', () => {
    const bad: Weights = { ...balancedWeights, tenureDepth: 50 };
    const scores: SignalScores = {
      revenueMomentum: 50, cashCollection: 50, profitability: 50,
      debtAging: 50, repaymentVelocity: 50, tenureDepth: 50
    };
    expect(() => aggregateOverallScore(scores, bad)).toThrow('weights must sum to 100');
  });
  it('throws if any score is out of range', () => {
    const scores: SignalScores = {
      revenueMomentum: -1, cashCollection: 50, profitability: 50,
      debtAging: 50, repaymentVelocity: 50, tenureDepth: 50
    };
    expect(() => aggregateOverallScore(scores, balancedWeights)).toThrow('score');
  });
});

describe('mapScoreToMultiplier', () => {
  it('maps scores to default multiplier table', () => {
    expect(mapScoreToMultiplier(0)).toBe(0.0);
    expect(mapScoreToMultiplier(19)).toBe(0.0);
    expect(mapScoreToMultiplier(20)).toBe(0.5);
    expect(mapScoreToMultiplier(39)).toBe(0.5);
    expect(mapScoreToMultiplier(40)).toBe(1.0);
    expect(mapScoreToMultiplier(59)).toBe(1.0);
    expect(mapScoreToMultiplier(60)).toBe(2.0);
    expect(mapScoreToMultiplier(70)).toBe(2.0);
    expect(mapScoreToMultiplier(79)).toBe(2.0);
    expect(mapScoreToMultiplier(80)).toBe(3.0);
    expect(mapScoreToMultiplier(89)).toBe(3.0);
    expect(mapScoreToMultiplier(90)).toBe(4.0);
    expect(mapScoreToMultiplier(100)).toBe(4.0);
  });
  it('throws on out-of-range scores', () => {
    expect(() => mapScoreToMultiplier(-1)).toThrow();
    expect(() => mapScoreToMultiplier(101)).toThrow();
    expect(() => mapScoreToMultiplier(50.5)).toThrow();
  });
});
