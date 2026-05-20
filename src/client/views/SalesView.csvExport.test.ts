// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildCustomerOfferCsv, isCustomerShareReady } from './SalesView.csvExport';
import type { GridRow } from '../../shared/types';

// UX-A2 — customer-facing offer export must:
// 1. Skip rows where mediaStatus is not customer-share-ready.
// 2. Never include unit cost, internal margin, landed cost, or related
//    internal-only columns in the customer-facing CSV headers.

describe('isCustomerShareReady', () => {
  it('returns true when mediaStatus is done or ready', () => {
    expect(isCustomerShareReady('done')).toBe(true);
    expect(isCustomerShareReady('ready')).toBe(true);
    expect(isCustomerShareReady('DONE')).toBe(true);
  });

  it('returns false for in_progress, open, missing, or null', () => {
    expect(isCustomerShareReady('in_progress')).toBe(false);
    expect(isCustomerShareReady('open')).toBe(false);
    expect(isCustomerShareReady(null)).toBe(false);
    expect(isCustomerShareReady(undefined)).toBe(false);
    expect(isCustomerShareReady('')).toBe(false);
  });
});

describe('buildCustomerOfferCsv (UX-A2)', () => {
  const sampleRows: GridRow[] = [
    {
      id: 'line-1',
      itemName: 'Banana OG #1',
      qty: 5,
      unitPrice: 1000,
      unitCost: 600,
      internalMargin: 400,
      landedCostBasis: 580,
      sourceRowKey: 'BA-OG-1',
      mediaStatus: 'done'
    } as unknown as GridRow,
    {
      id: 'line-2',
      itemName: 'Strawberry Cough',
      qty: 3,
      unitPrice: 800,
      unitCost: 500,
      internalMargin: 300,
      landedCostBasis: 480,
      sourceRowKey: 'SC-2',
      mediaStatus: 'in_progress' // not share-ready, must be skipped
    } as unknown as GridRow,
    {
      id: 'line-3',
      itemName: 'Lemon Haze',
      qty: 2,
      unitPrice: 1200,
      unitCost: 700,
      internalMargin: 500,
      landedCostBasis: 690,
      sourceRowKey: 'LH-3',
      mediaStatus: 'ready'
    } as unknown as GridRow
  ];

  it('only includes rows that pass customerShareReady (skips in_progress/open)', () => {
    const csv = buildCustomerOfferCsv(sampleRows);
    expect(csv).toContain('Banana OG #1');
    expect(csv).toContain('Lemon Haze');
    expect(csv).not.toContain('Strawberry Cough');
  });

  it('does NOT include unit cost, internal margin, or landed cost headers', () => {
    const csv = buildCustomerOfferCsv(sampleRows);
    expect(csv.toLowerCase()).not.toContain('unitcost');
    expect(csv.toLowerCase()).not.toContain('internalmargin');
    expect(csv.toLowerCase()).not.toContain('landedcost');
    expect(csv).not.toContain('600');
    expect(csv).not.toContain('400');
  });

  it('includes customer-safe fields (item name, qty, unit price)', () => {
    const csv = buildCustomerOfferCsv(sampleRows);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toContain('itemName');
    expect(firstLine).toContain('qty');
    expect(firstLine).toContain('unitPrice');
  });

  it('returns header-only CSV when no rows are share-ready', () => {
    const rows: GridRow[] = [
      { id: 'a', itemName: 'X', qty: 1, unitPrice: 10, mediaStatus: 'open' } as unknown as GridRow
    ];
    const csv = buildCustomerOfferCsv(rows);
    const lines = csv.split('\n').filter((line) => line.length > 0);
    expect(lines).toHaveLength(1); // just the header
  });

  // Regression guard for #63 (operator margin visibility toggle):
  // The customer-facing CSV is independent of the operator UI margin toggle.
  // Margin/cost MUST never leak into the customer-facing CSV regardless of
  // the operator's screen-time setting. PR #80 already filters; this is the
  // belt-and-braces regression test so the export side stays gated.
  it('never includes margin/cost terms in the customer offer (regression for #63)', () => {
    const csv = buildCustomerOfferCsv(sampleRows);
    const lower = csv.toLowerCase();
    expect(lower).not.toContain('cost');
    expect(lower).not.toContain('margin');
    expect(lower).not.toContain('internal');
    expect(lower).not.toContain('landed');
    expect(lower).not.toContain('cogs');
    // Numeric values from cost/margin columns must not appear either
    expect(csv).not.toContain('600');
    expect(csv).not.toContain('400');
    expect(csv).not.toContain('580');
    expect(csv).not.toContain('500');
    expect(csv).not.toContain('300');
    expect(csv).not.toContain('480');
    expect(csv).not.toContain('700');
    expect(csv).not.toContain('690');
  });
});
