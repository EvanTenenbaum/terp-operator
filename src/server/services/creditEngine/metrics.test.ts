import { describe, it, expect, beforeEach } from 'vitest';
import { creditEngineMetrics } from './metrics';

/**
 * Unit tests for the credit-engine in-process metrics counter module
 * (Phase 7a observability — issue #68).
 */

beforeEach(() => {
  creditEngineMetrics.resetForTest();
});

describe('creditEngineMetrics.increment', () => {
  it('records a single increment for a bare counter', () => {
    creditEngineMetrics.increment('credit_engine.decision_issued');
    const counters = creditEngineMetrics.getCounters();
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatchObject({ name: 'credit_engine.decision_issued', value: 1 });
  });

  it('sums repeated increments for the same name + labels', () => {
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'true' });
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'true' });
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'true' });
    const counters = creditEngineMetrics.getCounters();
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatchObject({
      name: 'credit_engine.decision_issued',
      labels: { applied: 'true' },
      value: 3
    });
  });

  it('keeps separate buckets for different label sets', () => {
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'true' });
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'false' });
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'false' });
    const counters = creditEngineMetrics.getCounters();
    expect(counters).toHaveLength(2);
    const applied = counters.find((c) => c.labels?.applied === 'true');
    const notApplied = counters.find((c) => c.labels?.applied === 'false');
    expect(applied?.value).toBe(1);
    expect(notApplied?.value).toBe(2);
  });

  it('treats labels as order-independent when forming the bucket key', () => {
    creditEngineMetrics.increment('credit_engine.divergence_observed', { source: 'manual', direction: 'above' });
    creditEngineMetrics.increment('credit_engine.divergence_observed', { direction: 'above', source: 'manual' });
    const counters = creditEngineMetrics.getCounters();
    expect(counters).toHaveLength(1);
    expect(counters[0].value).toBe(2);
  });

  it('supports incrementBy with a positive delta', () => {
    creditEngineMetrics.increment('credit_engine.override_applied', undefined, 5);
    const counters = creditEngineMetrics.getCounters();
    expect(counters[0].value).toBe(5);
  });

  it('clamps non-positive deltas to zero (no-op)', () => {
    creditEngineMetrics.increment('credit_engine.override_applied', undefined, 0);
    creditEngineMetrics.increment('credit_engine.override_applied', undefined, -3);
    const counters = creditEngineMetrics.getCounters();
    expect(counters).toEqual([]);
  });
});

describe('creditEngineMetrics.getCounter', () => {
  it('returns 0 when the counter has never been incremented', () => {
    expect(creditEngineMetrics.getCounter('credit_engine.decision_issued')).toBe(0);
  });

  it('returns the summed value for a name across all label sets when labels omitted', () => {
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'true' });
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'false' });
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'false' });
    expect(creditEngineMetrics.getCounter('credit_engine.decision_issued')).toBe(3);
  });

  it('returns the value for a specific label set when labels provided', () => {
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'true' });
    creditEngineMetrics.increment('credit_engine.decision_issued', { applied: 'false' });
    expect(creditEngineMetrics.getCounter('credit_engine.decision_issued', { applied: 'true' })).toBe(1);
  });
});

describe('creditEngineMetrics.resetForTest', () => {
  it('clears every counter', () => {
    creditEngineMetrics.increment('credit_engine.decision_issued');
    creditEngineMetrics.increment('credit_engine.override_applied');
    creditEngineMetrics.resetForTest();
    expect(creditEngineMetrics.getCounters()).toEqual([]);
  });
});

describe('credit-engine well-known counter names (assertion of contract)', () => {
  const expectedNames = [
    'credit_engine.decision_issued',
    'credit_engine.override_applied',
    'credit_engine.divergence_observed',
    'credit_engine.shadow_mode_miss',
    'credit_engine.worker_stalled'
  ] as const;

  it.each(expectedNames)('accepts increment for %s without throwing', (name) => {
    expect(() => creditEngineMetrics.increment(name)).not.toThrow();
    expect(creditEngineMetrics.getCounter(name)).toBe(1);
  });
});
