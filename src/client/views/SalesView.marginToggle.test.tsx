// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { ColDef } from 'ag-grid-community';
import type { GridRow } from '../../shared/types';
import { selectVisibleSalesColumns, MARGIN_COLUMN_FIELDS } from './SalesView.columns';

// Issue #63 — Operator margin visibility toggle.
// The Sales workspace must be able to hide cost and margin columns when the
// operator is screen-sharing with a customer. This test pins down the pure
// helper that decides which columns to render given the toggle state.

describe('selectVisibleSalesColumns (#63)', () => {
  const sampleColumns: ColDef<GridRow>[] = [
    { field: 'orderNo' },
    { field: 'customer' },
    { field: 'unitPrice' },
    { field: 'unitCost' },
    { field: 'rangeBadge' },
    { field: 'internalMargin' },
    { field: 'estimatedMargin' },
    { field: 'qty' }
  ];

  it('returns all columns unchanged when showMargin is true', () => {
    const visible = selectVisibleSalesColumns(true, sampleColumns);
    expect(visible).toHaveLength(sampleColumns.length);
    const fields = visible.map((col) => col.field);
    expect(fields).toContain('unitCost');
    expect(fields).toContain('rangeBadge');
    expect(fields).toContain('internalMargin');
    expect(fields).toContain('estimatedMargin');
  });

  it('hides margin/cost columns when showMargin is false', () => {
    const visible = selectVisibleSalesColumns(false, sampleColumns);
    const fields = visible.map((col) => col.field);
    expect(fields).not.toContain('unitCost');
    expect(fields).not.toContain('rangeBadge');
    expect(fields).not.toContain('internalMargin');
    expect(fields).not.toContain('estimatedMargin');
  });

  it('keeps non-margin columns when showMargin is false', () => {
    const visible = selectVisibleSalesColumns(false, sampleColumns);
    const fields = visible.map((col) => col.field);
    expect(fields).toContain('orderNo');
    expect(fields).toContain('customer');
    expect(fields).toContain('unitPrice');
    expect(fields).toContain('qty');
  });

  it('returns a new array, never mutating the input', () => {
    const before = sampleColumns.slice();
    const result = selectVisibleSalesColumns(false, sampleColumns);
    expect(sampleColumns).toEqual(before); // no mutation
    expect(result).not.toBe(sampleColumns);
  });

  it('declares the canonical set of margin/cost fields', () => {
    // Pin the constant — if a future column like `landedCost` is added we
    // want a test failure to remind us to gate it on showMargin too.
    // #64 PR-2: `landedCostExceptionReason` gated here because the projected
    // exception reason (keep_margin, vendor_approval_pending, etc.) reveals
    // vendor/COGS relationship state that must not leak during customer screen-share.
    expect(new Set(MARGIN_COLUMN_FIELDS)).toEqual(
      new Set(['unitCost', 'rangeBadge', 'internalMargin', 'estimatedMargin', 'landedCostExceptionReason'])
    );
  });

  it('is a no-op for columns without a matching margin field', () => {
    const cols: ColDef<GridRow>[] = [{ field: 'orderNo' }, { field: 'qty' }];
    const visible = selectVisibleSalesColumns(false, cols);
    expect(visible).toHaveLength(2);
  });
});
