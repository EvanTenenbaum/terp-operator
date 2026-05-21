import { describe, it, expect } from 'vitest';
import { projectLandedCostException } from './landedCostException';

// #64 PR-2: server-side projection of the latest successful
// `setLineLandedCost` command journal `result.delta.exception` onto
// `salesOrderLines` query rows. The helper is pure so we test the contract in
// isolation without a Postgres harness; the SQL query in queries.ts feeds the
// raw `command_journal.result` JSONB into this helper to inflate the per-line
// exception fields.

describe('projectLandedCostException (#64 PR-2)', () => {
  const EMPTY = {
    landedCostExceptionReason: null,
    landedCostExceptionNote: null,
    landedCostBelowRange: false,
    landedCostExceptionRangeLow: null,
    landedCostExceptionRangeHigh: null
  };

  it('returns the empty projection for null/undefined input', () => {
    expect(projectLandedCostException(null)).toEqual(EMPTY);
    expect(projectLandedCostException(undefined)).toEqual(EMPTY);
  });

  it('returns the empty projection when the journal result has no delta.exception', () => {
    expect(projectLandedCostException({})).toEqual(EMPTY);
    expect(projectLandedCostException({ delta: { lineId: 'x', landedCost: '25.00' } })).toEqual(EMPTY);
    expect(projectLandedCostException({ delta: null })).toEqual(EMPTY);
    expect(projectLandedCostException({ delta: 'bogus' })).toEqual(EMPTY);
  });

  it('projects a full below-range vendor-approval-pending exception', () => {
    const projected = projectLandedCostException({
      delta: {
        lineId: 'abc',
        landedCost: '25.00',
        basis: 'manual',
        exception: {
          reason: 'vendor-approval-pending',
          note: 'Awaiting buyer confirmation',
          belowRange: true,
          priceRange: { low: 50, high: 100 }
        }
      }
    });
    expect(projected).toEqual({
      landedCostExceptionReason: 'vendor-approval-pending',
      landedCostExceptionNote: 'Awaiting buyer confirmation',
      landedCostBelowRange: true,
      landedCostExceptionRangeLow: 50,
      landedCostExceptionRangeHigh: 100
    });
  });

  it('omits the note when the journal exception had none', () => {
    const projected = projectLandedCostException({
      delta: {
        exception: {
          reason: 'take-loss',
          belowRange: true,
          priceRange: { low: 50, high: 100 }
        }
      }
    });
    expect(projected.landedCostExceptionReason).toBe('take-loss');
    expect(projected.landedCostExceptionNote).toBeNull();
    expect(projected.landedCostBelowRange).toBe(true);
    expect(projected.landedCostExceptionRangeLow).toBe(50);
    expect(projected.landedCostExceptionRangeHigh).toBe(100);
  });

  it('coerces numeric-string price-range bounds to numbers', () => {
    // Postgres JSONB sometimes hands strings back through `node-postgres` if a
    // caller wrote `"50"` not `50`. The projection should tolerate either.
    const projected = projectLandedCostException({
      delta: {
        exception: {
          reason: 'keep-margin',
          belowRange: true,
          priceRange: { low: '50', high: '100' }
        }
      }
    });
    expect(projected.landedCostExceptionRangeLow).toBe(50);
    expect(projected.landedCostExceptionRangeHigh).toBe(100);
  });

  it('treats belowRange as false when the journal value is not strictly true', () => {
    const projected = projectLandedCostException({
      delta: {
        exception: {
          reason: 'keep-margin',
          belowRange: 'yes',
          priceRange: { low: 50, high: 100 }
        }
      }
    });
    expect(projected.landedCostBelowRange).toBe(false);
  });

  it('ignores non-object exception shapes', () => {
    expect(projectLandedCostException({ delta: { exception: 'bogus' } })).toEqual(EMPTY);
    expect(projectLandedCostException({ delta: { exception: 42 } })).toEqual(EMPTY);
  });

  it('returns the empty projection when reason is not a string', () => {
    const projected = projectLandedCostException({
      delta: {
        exception: { reason: 42, belowRange: true, priceRange: { low: 50, high: 100 } }
      }
    });
    expect(projected.landedCostExceptionReason).toBeNull();
  });
});
