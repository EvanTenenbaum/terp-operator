import { describe, it, expect } from 'vitest';
import { projectLandedCostException } from './landedCostException';

// #64 PR-2: server-side projection of the latest successful
// `setLineLandedCost` command journal `result.delta` onto
// `salesOrderLines` query rows. The helper is pure so we test the contract in
// isolation without a Postgres harness.
//
// Vocab: snake_case from BELOW_FLOOR_REASONS in saleLineCostExceptions.ts.
// Delta format: result.delta.exceptionReason / result.delta.exceptionNote
// (flat fields, as written by current commandBus.ts).

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

  it('returns the empty projection when the journal result has no delta.exceptionReason', () => {
    expect(projectLandedCostException({})).toEqual(EMPTY);
    expect(projectLandedCostException({ delta: { lineId: 'x', landedCost: '25.00' } })).toEqual(EMPTY);
    expect(projectLandedCostException({ delta: null })).toEqual(EMPTY);
    expect(projectLandedCostException({ delta: 'bogus' })).toEqual(EMPTY);
  });

  it('projects a vendor_approval_pending exception reason', () => {
    const projected = projectLandedCostException({
      delta: {
        lineId: 'abc',
        landedCost: '25.00',
        basis: 'manual',
        exceptionReason: 'vendor_approval_pending',
        exceptionNote: 'Awaiting buyer confirmation'
      }
    });
    expect(projected.landedCostExceptionReason).toBe('vendor_approval_pending');
    expect(projected.landedCostExceptionNote).toBe('Awaiting buyer confirmation');
    expect(projected.landedCostBelowRange).toBe(true);
  });

  it('projects a keep_margin exception reason', () => {
    const projected = projectLandedCostException({
      delta: {
        lineId: 'abc',
        landedCost: '25.00',
        basis: 'manual',
        exceptionReason: 'keep_margin'
      }
    });
    expect(projected.landedCostExceptionReason).toBe('keep_margin');
    expect(projected.landedCostBelowRange).toBe(true);
    expect(projected.landedCostExceptionNote).toBeNull();
  });

  it('projects a waive_margin exception reason', () => {
    const projected = projectLandedCostException({
      delta: {
        exceptionReason: 'waive_margin',
        exceptionNote: 'Held to win volume'
      }
    });
    expect(projected.landedCostExceptionReason).toBe('waive_margin');
    expect(projected.landedCostExceptionNote).toBe('Held to win volume');
    expect(projected.landedCostBelowRange).toBe(true);
  });

  it('projects a take_loss exception reason', () => {
    const projected = projectLandedCostException({
      delta: { exceptionReason: 'take_loss' }
    });
    expect(projected.landedCostExceptionReason).toBe('take_loss');
    expect(projected.landedCostBelowRange).toBe(true);
  });

  it('projects a renegotiate exception reason', () => {
    const projected = projectLandedCostException({
      delta: { exceptionReason: 'renegotiate' }
    });
    expect(projected.landedCostExceptionReason).toBe('renegotiate');
    expect(projected.landedCostBelowRange).toBe(true);
  });

  it('omits the note when the journal delta had none', () => {
    const projected = projectLandedCostException({
      delta: {
        exceptionReason: 'take_loss'
      }
    });
    expect(projected.landedCostExceptionNote).toBeNull();
  });

  it('ignores non-object delta shapes', () => {
    expect(projectLandedCostException({ delta: 'bogus' })).toEqual(EMPTY);
    expect(projectLandedCostException({ delta: 42 })).toEqual(EMPTY);
  });

  it('returns the empty projection when exceptionReason is not a string', () => {
    const projected = projectLandedCostException({
      delta: { exceptionReason: 42 }
    });
    expect(projected.landedCostExceptionReason).toBeNull();
  });

  it('returns null for range bounds since they are not in the flat delta', () => {
    const projected = projectLandedCostException({
      delta: { exceptionReason: 'keep_margin' }
    });
    expect(projected.landedCostExceptionRangeLow).toBeNull();
    expect(projected.landedCostExceptionRangeHigh).toBeNull();
  });
});
