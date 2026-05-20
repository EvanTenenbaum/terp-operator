// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  buildCsvExportOptions,
  isRestrictedColumnForRole,
  RESTRICTED_VIEWER_COLUMNS
} from './OperatorGrid.csvExport';

// UX-A2 — CSV export must role-gate cost/margin/balance columns.
//
// Viewer role should never receive unit cost, internal margin, or customer
// balance values in exported CSV — those are operator-internal data.

describe('isRestrictedColumnForRole (UX-A2)', () => {
  it('returns true for cost columns when role is viewer', () => {
    expect(isRestrictedColumnForRole('unitCost', 'viewer')).toBe(true);
    expect(isRestrictedColumnForRole('cost', 'viewer')).toBe(true);
    expect(isRestrictedColumnForRole('landedCostBasis', 'viewer')).toBe(true);
  });

  it('returns true for margin columns when role is viewer', () => {
    expect(isRestrictedColumnForRole('internalMargin', 'viewer')).toBe(true);
    expect(isRestrictedColumnForRole('estimatedMargin', 'viewer')).toBe(true);
  });

  it('returns true for customer balance columns when role is viewer', () => {
    expect(isRestrictedColumnForRole('balance', 'viewer')).toBe(true);
    expect(isRestrictedColumnForRole('creditLimit', 'viewer')).toBe(true);
  });

  it('returns false for non-restricted columns regardless of role', () => {
    expect(isRestrictedColumnForRole('orderNo', 'viewer')).toBe(false);
    expect(isRestrictedColumnForRole('status', 'viewer')).toBe(false);
    expect(isRestrictedColumnForRole('qty', 'viewer')).toBe(false);
  });

  it('returns false for restricted columns when role is operator/manager/owner', () => {
    for (const col of RESTRICTED_VIEWER_COLUMNS) {
      expect(isRestrictedColumnForRole(col, 'operator')).toBe(false);
      expect(isRestrictedColumnForRole(col, 'manager')).toBe(false);
      expect(isRestrictedColumnForRole(col, 'owner')).toBe(false);
    }
  });

  it('treats undefined role conservatively (no role = no access to restricted)', () => {
    // When role is undefined (auth not loaded), assume viewer-level access
    // to avoid leaking cost/margin before me.data resolves.
    expect(isRestrictedColumnForRole('unitCost', undefined)).toBe(true);
    expect(isRestrictedColumnForRole('internalMargin', undefined)).toBe(true);
  });
});

describe('buildCsvExportOptions (UX-A2)', () => {
  it('returns the requested fileName', () => {
    const opts = buildCsvExportOptions({ view: 'sales', role: 'owner' });
    expect(opts.fileName).toBe('terp-operator-sales.csv');
  });

  it('omits processCellCallback when role is operator/manager/owner', () => {
    expect(buildCsvExportOptions({ view: 'sales', role: 'operator' }).processCellCallback).toBeUndefined();
    expect(buildCsvExportOptions({ view: 'sales', role: 'manager' }).processCellCallback).toBeUndefined();
    expect(buildCsvExportOptions({ view: 'sales', role: 'owner' }).processCellCallback).toBeUndefined();
  });

  it('installs processCellCallback when role is viewer and strips restricted columns', () => {
    const opts = buildCsvExportOptions({ view: 'sales', role: 'viewer' });
    expect(typeof opts.processCellCallback).toBe('function');

    // Restricted column returns ''
    const restricted = opts.processCellCallback!({
      column: { getColId: () => 'unitCost' },
      value: 42.5
    } as never);
    expect(restricted).toBe('');

    // Non-restricted column passes through
    const nonRestricted = opts.processCellCallback!({
      column: { getColId: () => 'orderNo' },
      value: 'SO-1234'
    } as never);
    expect(nonRestricted).toBe('SO-1234');
  });

  it('installs processCellCallback when role is undefined (auth not loaded)', () => {
    const opts = buildCsvExportOptions({ view: 'sales', role: undefined });
    expect(typeof opts.processCellCallback).toBe('function');
    const restricted = opts.processCellCallback!({
      column: { getColId: () => 'internalMargin' },
      value: 100
    } as never);
    expect(restricted).toBe('');
  });

  it('falls back to column field when colId is unavailable', () => {
    const opts = buildCsvExportOptions({ view: 'sales', role: 'viewer' });
    const stripped = opts.processCellCallback!({
      column: { getColId: () => undefined, getColDef: () => ({ field: 'unitCost' }) },
      value: 1
    } as never);
    expect(stripped).toBe('');
  });
});
