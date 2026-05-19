import { describe, it, expect } from 'vitest';
import { scoreTenureDepth } from './tenureDepth';

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
