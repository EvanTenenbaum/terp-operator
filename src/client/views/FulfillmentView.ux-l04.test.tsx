// @vitest-environment jsdom
/**
 * UX-L04: "Labels ✓ / Manifest ✓" chips on fulfillment pick rows.
 *
 * Spec:
 *  (1) labelsPrinted=true → "Labels ✓" chip (finder-chip success).
 *  (2) labelsPrinted=false → muted "Labels —" span (no success chip).
 *  (3) manifestPath non-empty → "Manifest ✓" chip (finder-chip success).
 *  (4) manifestPath null/empty → muted "Manifest —" span (no success chip).
 *  (5) fulfillmentPickColumns length matches columnsByView.fulfillment length
 *      (no columns are added or removed, only replaced).
 *  (6) fulfillmentPickColumns preserves non-chip columns unchanged
 *      (e.g., 'pickNo' col is the original shared column).
 *
 * These tests exercise the exported column-def functions directly, avoiding
 * a full component mount — the same pattern used in format.test.ts for
 * boolCol/valueFormatter assertions.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fulfillmentPickColumns } from './FulfillmentView';
import { columnsByView } from './operations/shared';
import type { ColDef } from 'ag-grid-community';
import type { GridRow } from '../../shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Finds a column by field name in fulfillmentPickColumns. */
function col(field: string): ColDef<GridRow> | undefined {
  return fulfillmentPickColumns.find((c) => c.field === field);
}

/** Calls a ColDef's cellRenderer with a synthetic params object. */
function renderCell(
  colDef: ColDef<GridRow> | undefined,
  value: unknown,
  data?: GridRow
): HTMLElement {
  expect(colDef).toBeDefined();
  const renderer = colDef!.cellRenderer as (p: { value: unknown; data?: GridRow }) => React.ReactNode;
  expect(typeof renderer).toBe('function');
  const container = document.createElement('div');
  const { unmount } = render(renderer({ value, data }), { container });
  void unmount; // we read from the DOM via container
  return container;
}

// ---------------------------------------------------------------------------
// UX-L04: labelsPrinted chip column
// ---------------------------------------------------------------------------

describe('UX-L04 — labelsPrinted chip column', () => {
  it('renders "Labels ✓" success chip when labelsPrinted is true', () => {
    const container = renderCell(col('labelsPrinted'), true);
    const chip = container.querySelector('.finder-chip.success');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe('Labels ✓');
  });

  it('renders muted dash span (no success chip) when labelsPrinted is false', () => {
    const container = renderCell(col('labelsPrinted'), false);
    expect(container.querySelector('.finder-chip.success')).toBeNull();
    // The span must contain "Labels —" text
    expect(container.textContent).toContain('Labels');
  });

  it('renders muted dash span when labelsPrinted is null/undefined', () => {
    const container = renderCell(col('labelsPrinted'), null);
    expect(container.querySelector('.finder-chip.success')).toBeNull();
  });

  it('has headerName "Labels"', () => {
    expect(col('labelsPrinted')?.headerName).toBe('Labels');
  });

  it('has agSetColumnFilter for keyboard-accessible filtering', () => {
    expect(col('labelsPrinted')?.filter).toBe('agSetColumnFilter');
  });
});

// ---------------------------------------------------------------------------
// UX-L04: manifestPath chip column
// ---------------------------------------------------------------------------

describe('UX-L04 — manifestPath chip column', () => {
  it('renders "Manifest ✓" success chip when manifestPath is a non-empty string', () => {
    const container = renderCell(col('manifestPath'), '/archives/manifests/PK-001.csv');
    const chip = container.querySelector('.finder-chip.success');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toBe('Manifest ✓');
  });

  it('renders muted dash span when manifestPath is null', () => {
    const container = renderCell(col('manifestPath'), null);
    expect(container.querySelector('.finder-chip.success')).toBeNull();
    expect(container.textContent).toContain('Manifest');
  });

  it('renders muted dash span when manifestPath is an empty string', () => {
    const container = renderCell(col('manifestPath'), '');
    expect(container.querySelector('.finder-chip.success')).toBeNull();
  });

  it('renders muted dash span when manifestPath is whitespace only', () => {
    const container = renderCell(col('manifestPath'), '   ');
    expect(container.querySelector('.finder-chip.success')).toBeNull();
  });

  it('has headerName "Manifest"', () => {
    expect(col('manifestPath')?.headerName).toBe('Manifest');
  });

  it('has agSetColumnFilter for keyboard-accessible filtering', () => {
    expect(col('manifestPath')?.filter).toBe('agSetColumnFilter');
  });
});

// ---------------------------------------------------------------------------
// UX-L04: fulfillmentPickColumns structure invariants
// ---------------------------------------------------------------------------

describe('UX-L04 — fulfillmentPickColumns structure', () => {
  const sharedCols = columnsByView.fulfillment ?? [];

  it('has the same column count as columnsByView.fulfillment (no additions or removals)', () => {
    expect(fulfillmentPickColumns.length).toBe(sharedCols.length);
  });

  it('replaces labelsPrinted and manifestPath with cellRenderer columns (not boolCol/text)', () => {
    const labelCol = col('labelsPrinted');
    const manifestCol = col('manifestPath');
    // Chip cols have cellRenderer; boolCol uses valueFormatter only
    expect(typeof labelCol?.cellRenderer).toBe('function');
    expect(typeof manifestCol?.cellRenderer).toBe('function');
  });

  it('preserves non-chip columns unchanged (e.g., pickNo is the shared original)', () => {
    const shared = sharedCols.find((c) => c.field === 'pickNo');
    const derived = col('pickNo');
    // Same object reference — not replaced
    expect(derived).toBe(shared);
  });

  it('preserves alertCount column (the pinned-left chip column) unchanged', () => {
    const shared = sharedCols.find((c) => c.field === 'alertCount');
    const derived = col('alertCount');
    expect(derived).toBe(shared);
  });
});
