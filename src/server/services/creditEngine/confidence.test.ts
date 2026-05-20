import { describe, it, expect } from 'vitest';
import { bucketConfidence, type ConfidenceLevel } from './confidence';

describe('bucketConfidence', () => {
  it('returns "high" for >= 10 data points', () => {
    expect(bucketConfidence(10)).toBe('high' satisfies ConfidenceLevel);
    expect(bucketConfidence(47)).toBe('high');
  });
  it('returns "medium" for 3..9', () => {
    expect(bucketConfidence(3)).toBe('medium');
    expect(bucketConfidence(9)).toBe('medium');
  });
  it('returns "low" for 1..2', () => {
    expect(bucketConfidence(1)).toBe('low');
    expect(bucketConfidence(2)).toBe('low');
  });
  it('returns "none" for 0', () => {
    expect(bucketConfidence(0)).toBe('none');
  });
  it('throws for negative counts', () => {
    expect(() => bucketConfidence(-1)).toThrow('dataCount must be non-negative');
  });
  it('throws for non-integer counts', () => {
    expect(() => bucketConfidence(3.5)).toThrow('dataCount must be an integer');
  });
});
