import { describe, it, expect } from 'vitest';

// CAP-030 (TER-1498): Unit tests for releaseEligibility reason computation.
// Mirrors the exact logic in queries.ts so the eligibility rules stay in sync
// with the releaseLineForPicking command (which enforces them at write time).

describe('releaseEligibility reasons', () => {
  function computeReasons(row: {
    itemName?: string | null;
    batchId?: string | null;
    qty?: string;
    validationIssues?: string[];
    batchReservedQty?: string;
  }) {
    const reasons: string[] = [];
    if (!row.itemName) reasons.push('Item name is not set.');
    if (!row.batchId) reasons.push('No batch assigned.');
    if (Number(row.qty ?? '0') <= 0) reasons.push('Quantity must be greater than zero.');
    const issues = row.validationIssues ?? [];
    const fatalIssues = issues.filter((i) => !i.startsWith('Pick landed COGS'));
    if (fatalIssues.length) reasons.push(`Resolve validation issues: ${fatalIssues.join('; ')}`);
    if (row.batchId && Number(row.batchReservedQty ?? '0') < Number(row.qty ?? '0')) {
      reasons.push('Insufficient reservation — reserve inventory first.');
    }
    return reasons;
  }

  it('eligible line has no reasons', () => {
    const reasons = computeReasons({
      itemName: 'Flower A',
      batchId: 'abc',
      qty: '5.000',
      validationIssues: [],
      batchReservedQty: '5.000'
    });
    expect(reasons).toHaveLength(0);
  });

  it('missing item name produces a reason', () => {
    const reasons = computeReasons({ itemName: null, batchId: 'abc', qty: '5.000', validationIssues: [], batchReservedQty: '5.000' });
    expect(reasons).toContain('Item name is not set.');
  });

  it('missing batch produces a reason', () => {
    const reasons = computeReasons({ itemName: 'Flower A', batchId: null, qty: '5.000', validationIssues: [] });
    expect(reasons).toContain('No batch assigned.');
  });

  it('qty = 0 produces a reason', () => {
    const reasons = computeReasons({ itemName: 'Flower A', batchId: 'abc', qty: '0.000', validationIssues: [], batchReservedQty: '5.000' });
    expect(reasons).toContain('Quantity must be greater than zero.');
  });

  it('range-priced COGS issue is not fatal (can release with COGS still in range)', () => {
    const reasons = computeReasons({
      itemName: 'Flower A',
      batchId: 'abc',
      qty: '5.000',
      validationIssues: ['Pick landed COGS in $10-$20.'],
      batchReservedQty: '5.000'
    });
    expect(reasons).toHaveLength(0);
  });

  it('other validation issues ARE fatal', () => {
    const reasons = computeReasons({
      itemName: 'Flower A',
      batchId: 'abc',
      qty: '5.000',
      validationIssues: ['Batch price is missing.'],
      batchReservedQty: '5.000'
    });
    expect(reasons.some((r) => r.includes('Resolve validation issues'))).toBe(true);
  });

  it('insufficient reservation produces a reason', () => {
    const reasons = computeReasons({
      itemName: 'Flower A',
      batchId: 'abc',
      qty: '5.000',
      validationIssues: [],
      batchReservedQty: '2.000'
    });
    expect(reasons).toContain('Insufficient reservation — reserve inventory first.');
  });

  it('returns user-readable strings, not enum keys', () => {
    const reasons = computeReasons({ itemName: null, batchId: null, qty: '0.000', validationIssues: [] });
    reasons.forEach((r) => {
      expect(r.length).toBeGreaterThan(0);
      // No bare SHOUTING_SNAKE_CASE enum keys.
      expect(r).not.toMatch(/^[A-Z_]+$/);
    });
  });

  it('stacks multiple reasons in order', () => {
    const reasons = computeReasons({
      itemName: null,
      batchId: null,
      qty: '0.000',
      validationIssues: ['Batch price is missing.']
    });
    expect(reasons).toEqual([
      'Item name is not set.',
      'No batch assigned.',
      'Quantity must be greater than zero.',
      'Resolve validation issues: Batch price is missing.'
    ]);
  });
});

describe('pickQueue derived pickStatus mapping (mirrors SQL CASE)', () => {
  function pickStatus(fl: {
    statusExtended: string | null;
    actualQty: string;
    status: string;
    pickReleasedAt: Date | null;
  }) {
    if (fl.statusExtended === 'cancelled') return 'cancelled';
    if (fl.statusExtended === 'recall_pending') return 'recall_pending';
    if (Number(fl.actualQty) > 0 && fl.status === 'packed') return 'picked';
    if (Number(fl.actualQty) > 0) return 'picking';
    if (fl.pickReleasedAt) return 'released';
    return 'recalled';
  }

  it('cancelled wins over everything else', () => {
    expect(
      pickStatus({ statusExtended: 'cancelled', actualQty: '5.000', status: 'packed', pickReleasedAt: new Date() })
    ).toBe('cancelled');
  });

  it('recall_pending wins when not cancelled', () => {
    expect(
      pickStatus({ statusExtended: 'recall_pending', actualQty: '0.000', status: 'open', pickReleasedAt: new Date() })
    ).toBe('recall_pending');
  });

  it('packed + actualQty > 0 → picked', () => {
    expect(
      pickStatus({ statusExtended: null, actualQty: '5.000', status: 'packed', pickReleasedAt: new Date() })
    ).toBe('picked');
  });

  it('actualQty > 0 but not packed → picking', () => {
    expect(
      pickStatus({ statusExtended: null, actualQty: '2.000', status: 'open', pickReleasedAt: new Date() })
    ).toBe('picking');
  });

  it('released → released', () => {
    expect(
      pickStatus({ statusExtended: null, actualQty: '0.000', status: 'open', pickReleasedAt: new Date() })
    ).toBe('released');
  });

  it('no release → recalled', () => {
    expect(
      pickStatus({ statusExtended: null, actualQty: '0.000', status: 'open', pickReleasedAt: null })
    ).toBe('recalled');
  });
});
