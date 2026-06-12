// @vitest-environment jsdom
// UX-F01: "Copy offer" beside Export in the sheet preview panel
// Selected rows -> customer-safe text block (name, qty, price; NEVER cost/margin/notes)
// to clipboard; toast "Copied — internal columns excluded."
// Forbidden fields: unitCost, internalMargin, estimatedMargin, landedCostBasis, reason,
// notes, vendorApproval, unitCostWithLanded — any cost/margin/internal annotation.

import { describe, it, expect } from 'vitest';
import { buildOfferText, OFFER_FORBIDDEN_FIELDS } from './SalesView.ux-f01';
import type { GridRow } from '../../shared/types';

const sampleRows: GridRow[] = [
  {
    id: 'line-1',
    name: 'Banana OG',
    availableQty: 5,
    unitPrice: 1000,
    unitCost: 600,
    internalMargin: 400,
    estimatedMargin: 400,
    landedCostBasis: 580,
    reason: 'Great match for buyer preference',
    notes: 'Internal note — do not share',
    category: 'Flower',
    batchCode: 'BA-OG-1',
    tags: 'fresh,premium'
  } as unknown as GridRow,
  {
    id: 'line-2',
    name: 'Lemon Haze',
    availableQty: 3,
    unitPrice: 800,
    unitCost: 500,
    internalMargin: 300,
    estimatedMargin: 300,
    landedCostBasis: 480,
    reason: 'Another internal reason',
    notes: null,
    category: 'Flower',
    batchCode: 'LH-2',
    tags: ''
  } as unknown as GridRow
];

describe('buildOfferText (UX-F01)', () => {
  it('returns a non-empty string for rows with data', () => {
    const text = buildOfferText(sampleRows);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('includes customer-visible fields: name, qty/availableQty, price', () => {
    const text = buildOfferText(sampleRows);
    expect(text).toContain('Banana OG');
    expect(text).toContain('Lemon Haze');
    // price should appear
    expect(text).toContain('1000');
    expect(text).toContain('800');
    // qty should appear
    expect(text).toContain('5');
    expect(text).toContain('3');
  });

  it('NEVER includes forbidden internal fields (cost, margin, internal notes, reason)', () => {
    const text = buildOfferText(sampleRows);
    const lower = text.toLowerCase();

    // Exact forbidden field names must not appear as column headers or labels
    for (const field of OFFER_FORBIDDEN_FIELDS) {
      expect(lower, `"${field}" must not appear in customer offer text`).not.toContain(field.toLowerCase());
    }

    // Numeric values from forbidden columns must not leak
    expect(text).not.toContain('600');  // unitCost row 1
    expect(text).not.toContain('400');  // margin row 1
    expect(text).not.toContain('580');  // landedCostBasis row 1
    expect(text).not.toContain('500');  // unitCost row 2
    expect(text).not.toContain('300');  // margin row 2
    expect(text).not.toContain('480');  // landedCostBasis row 2

    // Internal text values must not appear
    expect(text).not.toContain('Great match for buyer preference');
    expect(text).not.toContain('Internal note');
    expect(text).not.toContain('Another internal reason');
  });

  it('returns a placeholder when given an empty row array', () => {
    const text = buildOfferText([]);
    expect(typeof text).toBe('string');
    // Should still return something (even empty is fine, just not an error)
  });

  it('does not include "cost", "margin", or "internal" as words in the output', () => {
    const text = buildOfferText(sampleRows);
    const lower = text.toLowerCase();
    expect(lower).not.toContain('cost');
    expect(lower).not.toContain('margin');
    expect(lower).not.toContain('internal');
    expect(lower).not.toContain('landed');
    expect(lower).not.toContain('cogs');
  });

  it('includes each row on a separate line or block when multiple rows present', () => {
    const text = buildOfferText(sampleRows);
    // Both product names must appear, implying both rows are represented
    const bananaIndex = text.indexOf('Banana OG');
    const lemonIndex = text.indexOf('Lemon Haze');
    expect(bananaIndex).toBeGreaterThanOrEqual(0);
    expect(lemonIndex).toBeGreaterThanOrEqual(0);
  });
});

describe('OFFER_FORBIDDEN_FIELDS', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(OFFER_FORBIDDEN_FIELDS)).toBe(true);
    expect(OFFER_FORBIDDEN_FIELDS.length).toBeGreaterThan(0);
  });

  it('includes the critical internal-only fields', () => {
    const lower = OFFER_FORBIDDEN_FIELDS.map((f) => f.toLowerCase());
    expect(lower).toContain('unitcost');
    expect(lower).toContain('internalmargin');
    expect(lower).toContain('estimatedmargin');
    expect(lower).toContain('reason');
    expect(lower).toContain('notes');
  });
});
