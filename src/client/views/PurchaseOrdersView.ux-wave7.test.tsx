// @vitest-environment jsdom
/**
 * Wave-7 PurchaseOrdersView tests covering:
 *  UX-H08 — PO rows expose prepaymentAmount (original), prepaidAmount,
 *             and remainingPrepay columns in columnsByView.
 *  UX-H09 — the PO header strip carries the sticky CSS class.
 *  UX-H07 — legacyMarker and ownershipStatus columns in columnsByView.inventory
 *             have tooltipValueGetter functions that return legend text.
 */
import { describe, it, expect } from 'vitest';
import { columnsByView } from './operations/shared';
import { markerTooltip } from '../utils/markerLegend';

// ─── UX-H08: prepayment columns ─────────────────────────────────────────────

describe('UX-H08 — PO grid prepayment columns', () => {
  const poCols = columnsByView.purchaseOrders ?? [];

  it('has a prepaymentAmount (original) column', () => {
    const col = poCols.find((c) => c.field === 'prepaymentAmount');
    expect(col).toBeDefined();
    expect(col?.headerName).toBe('Prepay');
  });

  it('has a prepaidAmount column', () => {
    const col = poCols.find((c) => c.field === 'prepaidAmount');
    expect(col).toBeDefined();
  });

  it('has a remainingPrepay column', () => {
    const col = poCols.find((c) => c.field === 'remainingPrepay');
    expect(col).toBeDefined();
  });

  it('prepaidAmount has a descriptive headerTooltip', () => {
    const col = poCols.find((c) => c.field === 'prepaidAmount');
    expect(col?.headerTooltip).toBeTruthy();
  });

  it('remainingPrepay has a descriptive headerTooltip', () => {
    const col = poCols.find((c) => c.field === 'remainingPrepay');
    expect(col?.headerTooltip).toBeTruthy();
  });

  it('prepaidAmount and remainingPrepay are numeric columns', () => {
    const prepaid = poCols.find((c) => c.field === 'prepaidAmount');
    const remaining = poCols.find((c) => c.field === 'remainingPrepay');
    expect(prepaid?.type).toBe('numericColumn');
    expect(remaining?.type).toBe('numericColumn');
  });
});

// ─── UX-H07: inventory marker/ownership tooltip columns ─────────────────────

describe('UX-H07 — inventory column marker legend tooltips', () => {
  const inventoryCols = columnsByView.inventory ?? [];

  it('legacyMarker column has a tooltipValueGetter', () => {
    const col = inventoryCols.find((c) => c.field === 'legacyMarker');
    expect(typeof col?.tooltipValueGetter).toBe('function');
  });

  it('legacyMarker tooltipValueGetter returns inferred legend for "C"', () => {
    const col = inventoryCols.find((c) => c.field === 'legacyMarker');
    const tip = col?.tooltipValueGetter?.({ value: 'C', data: {} } as unknown as Parameters<NonNullable<typeof col.tooltipValueGetter>>[0]);
    expect(tip).toContain('inferred');
  });

  it('ownershipStatus column has a tooltipValueGetter', () => {
    const col = inventoryCols.find((c) => c.field === 'ownershipStatus');
    expect(typeof col?.tooltipValueGetter).toBe('function');
  });

  it('ownershipStatus tooltipValueGetter returns confirmed legend for "OWN"', () => {
    const col = inventoryCols.find((c) => c.field === 'ownershipStatus');
    const tip = col?.tooltipValueGetter?.({ value: 'OWN', data: {} } as unknown as Parameters<NonNullable<typeof col.tooltipValueGetter>>[0]);
    expect(tip).toContain('[Confirmed]');
  });

  it('markerTooltip returns undefined for unknown values', () => {
    expect(markerTooltip('', 'legacy')).toBeUndefined();
    expect(markerTooltip('ZZZZ', 'ownership')).toBeUndefined();
  });
});

// ─── UX-H09: sticky PO header (CSS class check) ─────────────────────────────

describe('UX-H09 — PO header strip CSS includes sticky', () => {
  it('po-header-strip class includes sticky positioning via styles.css', async () => {
    // We verify the CSS rule was applied by reading the styles.css content.
    // The actual rendering test is browser-only but the CSS change is
    // verified against the file content.
    const path = await import('node:path');
    const fs = await import('node:fs');
    const cssPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../../client/styles.css'
    );
    const css = fs.readFileSync(cssPath, 'utf-8');
    const poHeaderBlock = css.match(/\.po-header-strip\s*\{([^}]+)\}/)?.[1] ?? '';
    // The block must reference sticky positioning
    expect(poHeaderBlock).toMatch(/sticky/);
  });
});
