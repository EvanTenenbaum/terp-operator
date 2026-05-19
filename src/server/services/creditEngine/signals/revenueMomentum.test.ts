import { describe, it, expect } from 'vitest';
import { scoreRevenueMomentum } from './revenueMomentum';

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
