import { describe, expect, it } from 'vitest';
import {
  validateLandedCost,
  validateBelowFloorChoice,
  computeOrderExceptionTotals,
  canConfirmOrPost,
  BELOW_FLOOR_REASONS,
  VENDOR_APPROVAL_STATES,
  LANDED_COST_BASIS_VALUES
} from './saleLineCostExceptions';

// Tight, focused unit tests for the #64 cost-range exception / below-floor
// reason / vendor-approval pure helpers. These are framework-free so the
// confirm/post gates and the setLineLandedCost / setLineBelowFloorReason /
// resolveVendorApproval commands can lean on the same invariants.

describe('validateLandedCost', () => {
  const range = { low: 800, high: 1000 };

  it('accepts a landed cost inside the batch range with a normal basis', () => {
    const result = validateLandedCost({
      landedCost: 900,
      range,
      basis: 'manual',
      role: 'operator',
      reason: null
    });
    expect(result).toEqual({ ok: true, basisRecord: 'manual' });
  });

  it('accepts pick-mid as basis when value matches mid', () => {
    const result = validateLandedCost({
      landedCost: 900,
      range,
      basis: 'pick-mid',
      role: 'operator',
      reason: null
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.basisRecord).toBe('pick-mid');
  });

  it('rejects an out-of-range landed cost when basis is not override', () => {
    const result = validateLandedCost({
      landedCost: 1200,
      range,
      basis: 'manual',
      role: 'manager',
      reason: 'why-not'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/outside batch range/i);
  });

  it('rejects override by a non-manager role even with reason', () => {
    const result = validateLandedCost({
      landedCost: 1200,
      range,
      basis: 'override',
      role: 'operator',
      reason: 'urgent buyer'
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/manager or owner/i);
  });

  it('rejects override without a reason', () => {
    const result = validateLandedCost({
      landedCost: 1200,
      range,
      basis: 'override',
      role: 'manager',
      reason: null
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/reason/i);
  });

  it('accepts override by a manager with reason for an out-of-range cost', () => {
    const result = validateLandedCost({
      landedCost: 1200,
      range,
      basis: 'override',
      role: 'manager',
      reason: 'rebate adjustment'
    });
    expect(result).toEqual({ ok: true, basisRecord: 'override' });
  });

  it('rejects a negative landed cost', () => {
    const result = validateLandedCost({
      landedCost: -1,
      range,
      basis: 'manual',
      role: 'manager',
      reason: null
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown basis value', () => {
    const result = validateLandedCost({
      landedCost: 900,
      range,
      // @ts-expect-error testing runtime guard
      basis: 'whatever',
      role: 'manager',
      reason: null
    });
    expect(result.ok).toBe(false);
  });
});

describe('validateBelowFloorChoice', () => {
  it('returns ok when unit price meets the floor', () => {
    const result = validateBelowFloorChoice({
      unitPrice: 1000,
      priceFloor: 950,
      reason: null
    });
    expect(result).toEqual({ ok: true, requiresVendorApproval: false });
  });

  it('returns ok when no floor is recorded', () => {
    const result = validateBelowFloorChoice({
      unitPrice: 100,
      priceFloor: null,
      reason: null
    });
    expect(result.ok).toBe(true);
  });

  it('requires a reason when unit price is below the floor', () => {
    const result = validateBelowFloorChoice({
      unitPrice: 800,
      priceFloor: 950,
      reason: null
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/below[- ]floor reason/i);
  });

  it('rejects an unknown below-floor reason', () => {
    const result = validateBelowFloorChoice({
      unitPrice: 800,
      priceFloor: 950,
      // @ts-expect-error testing runtime guard
      reason: 'random-string'
    });
    expect(result.ok).toBe(false);
  });

  it('accepts known reasons and flags vendor_approval_pending', () => {
    expect(
      validateBelowFloorChoice({ unitPrice: 800, priceFloor: 950, reason: 'waive_margin' })
    ).toEqual({ ok: true, requiresVendorApproval: false });

    expect(
      validateBelowFloorChoice({ unitPrice: 800, priceFloor: 950, reason: 'take_loss' })
    ).toEqual({ ok: true, requiresVendorApproval: false });

    expect(
      validateBelowFloorChoice({ unitPrice: 800, priceFloor: 950, reason: 'vendor_approval_pending' })
    ).toEqual({ ok: true, requiresVendorApproval: true });
  });
});

describe('computeOrderExceptionTotals', () => {
  it('returns zeros when there are no exception lines', () => {
    const totals = computeOrderExceptionTotals([
      { qty: 2, unitPrice: 1000, unitCost: 500, priceFloor: 900, belowFloorReason: null, vendorApprovalState: 'none' }
    ]);
    expect(totals).toEqual({
      marginWaivedTotal: 0,
      lossRecognizedTotal: 0,
      vendorApprovalPending: false
    });
  });

  it('sums waived margin as (priceFloor - unitPrice) * qty for waive_margin lines', () => {
    const totals = computeOrderExceptionTotals([
      { qty: 3, unitPrice: 800, unitCost: 700, priceFloor: 1000, belowFloorReason: 'waive_margin', vendorApprovalState: 'none' },
      { qty: 1, unitPrice: 500, unitCost: 400, priceFloor: 600, belowFloorReason: 'waive_margin', vendorApprovalState: 'none' }
    ]);
    // (1000 - 800) * 3 + (600 - 500) * 1 = 600 + 100 = 700
    expect(totals.marginWaivedTotal).toBe(700);
    expect(totals.lossRecognizedTotal).toBe(0);
  });

  it('sums recognized loss as (unitCost - unitPrice) * qty for take_loss lines selling below cost', () => {
    const totals = computeOrderExceptionTotals([
      { qty: 2, unitPrice: 400, unitCost: 500, priceFloor: 700, belowFloorReason: 'take_loss', vendorApprovalState: 'none' },
      // take_loss but price >= cost -> contributes 0
      { qty: 5, unitPrice: 510, unitCost: 500, priceFloor: 700, belowFloorReason: 'take_loss', vendorApprovalState: 'none' }
    ]);
    expect(totals.lossRecognizedTotal).toBe(200);
    expect(totals.marginWaivedTotal).toBe(0);
  });

  it('flags vendorApprovalPending when any line is pending', () => {
    const totals = computeOrderExceptionTotals([
      { qty: 1, unitPrice: 900, unitCost: 800, priceFloor: 1000, belowFloorReason: 'vendor_approval_pending', vendorApprovalState: 'pending' }
    ]);
    expect(totals.vendorApprovalPending).toBe(true);
  });
});

describe('canConfirmOrPost', () => {
  const baseLine = {
    batchId: 'batch-1',
    itemName: 'Sour Diesel',
    unitCostResolved: true,
    unitPrice: 1000,
    unitCost: 700,
    priceFloor: 900,
    belowFloorReason: null,
    vendorApprovalState: 'none' as const
  };

  it('returns null when nothing blocks confirm or post', () => {
    expect(canConfirmOrPost(baseLine)).toBeNull();
  });

  it('blocks when a range batch line has unresolved landed COGS', () => {
    expect(
      canConfirmOrPost({ ...baseLine, unitCostResolved: false })
    ).toBe('cogs_unresolved');
  });

  it('blocks when unit price is below floor with no below-floor reason', () => {
    expect(
      canConfirmOrPost({ ...baseLine, unitPrice: 800, priceFloor: 900, belowFloorReason: null })
    ).toBe('below_floor_reason_missing');
  });

  it('blocks when vendor approval is pending', () => {
    expect(
      canConfirmOrPost({ ...baseLine, vendorApprovalState: 'pending', belowFloorReason: 'vendor_approval_pending', unitPrice: 800 })
    ).toBe('vendor_approval_pending');
  });

  it('blocks when vendor approval is declined (must reprice or re-request approval)', () => {
    expect(
      canConfirmOrPost({
        ...baseLine,
        vendorApprovalState: 'declined',
        belowFloorReason: 'vendor_approval_pending',
        unitPrice: 800
      })
    ).toBe('vendor_approval_declined');
  });

  it('allows below-floor lines with a non-pending reason set', () => {
    expect(
      canConfirmOrPost({ ...baseLine, unitPrice: 800, priceFloor: 900, belowFloorReason: 'waive_margin' })
    ).toBeNull();
  });
});

describe('exported constants', () => {
  it('exposes the canonical below-floor reasons', () => {
    expect(BELOW_FLOOR_REASONS).toEqual([
      'keep_margin',
      'renegotiate',
      'waive_margin',
      'take_loss',
      'vendor_approval_pending'
    ]);
  });

  it('exposes the canonical vendor approval states', () => {
    expect(VENDOR_APPROVAL_STATES).toEqual(['none', 'pending', 'approved', 'declined']);
  });

  it('exposes the canonical landed cost basis values', () => {
    expect(LANDED_COST_BASIS_VALUES).toEqual([
      'fixed',
      'pick-low',
      'pick-mid',
      'pick-high',
      'manual',
      'override'
    ]);
  });
});
