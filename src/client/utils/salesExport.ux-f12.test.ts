// @vitest-environment node
/**
 * UX-F12 (remainder) — below-floor reason annotation in exports.
 *
 * Contract:
 *  - INTERNAL sheet export includes the `belowFloorReason` annotation column
 *    (header AND row value).
 *  - CATALOG (customer-facing) export must NEVER include it — regardless of
 *    the showMargin toggle state.
 *  - The customer-offer CSV (SalesView.csvExport.ts) must never include it.
 */
import { describe, it, expect } from 'vitest';
import { buildSheetCsv, getCatalogHeaders, getInternalHeaders } from './salesExport';
import { buildCustomerOfferCsv } from '../views/SalesView.csvExport';
import { OFFER_FORBIDDEN_FIELDS, buildOfferText } from '../views/SalesView.ux-f01';
import type { GridRow } from '../../shared/types';

const sampleRows = [
  {
    id: 'row-1',
    batchCode: 'BC001',
    name: 'Flower A',
    itemName: 'Flower A',
    category: 'Flower',
    vendor: 'Acme',
    availableQty: 100,
    qty: 5,
    unitPrice: 50,
    unitCost: 30,
    estimatedMargin: 0.4,
    tags: ['indoor'],
    reason: 'Top seller',
    sourceRowKey: 'BC001',
    mediaStatus: 'done',
    belowFloorReason: 'price-match competitor quote'
  }
] as unknown as GridRow[];

describe('UX-F12 — internal sheet export includes belowFloorReason', () => {
  it('getInternalHeaders includes belowFloorReason', () => {
    expect(getInternalHeaders()).toContain('belowFloorReason');
  });

  it('internal CSV header line includes belowFloorReason', () => {
    const headerLine = buildSheetCsv(sampleRows, 'internal').split('\n')[0];
    expect(headerLine).toMatch(/belowFloorReason/);
  });

  it('internal CSV row carries the captured reason value', () => {
    const csv = buildSheetCsv(sampleRows, 'internal');
    expect(csv).toContain('price-match competitor quote');
  });

  it('internal CSV with showMargin: false still carries the annotation (not a cost/margin column)', () => {
    const csv = buildSheetCsv(sampleRows, 'internal', { showMargin: false });
    expect(csv.split('\n')[0]).toMatch(/belowFloorReason/);
    expect(csv).toContain('price-match competitor quote');
  });
});

describe('UX-F12 — catalog export must NEVER include belowFloorReason', () => {
  it('getCatalogHeaders does not include belowFloorReason', () => {
    expect(getCatalogHeaders()).not.toContain('belowFloorReason');
  });

  it('catalog CSV excludes the header and the value', () => {
    const csv = buildSheetCsv(sampleRows, 'catalog');
    expect(csv).not.toMatch(/belowFloorReason/);
    expect(csv).not.toContain('price-match competitor quote');
  });

  it('catalog CSV excludes it even with showMargin: true', () => {
    const csv = buildSheetCsv(sampleRows, 'catalog', { showMargin: true });
    expect(csv).not.toMatch(/belowFloorReason/);
    expect(csv).not.toContain('price-match competitor quote');
  });

  it('customer-offer CSV (buildCustomerOfferCsv) excludes the annotation', () => {
    const csv = buildCustomerOfferCsv(sampleRows);
    expect(csv).not.toMatch(/belowFloorReason/);
    expect(csv).not.toContain('price-match competitor quote');
  });

  it('customer-offer text (buildOfferText) excludes the annotation and the field is forbidden', () => {
    expect(OFFER_FORBIDDEN_FIELDS).toContain('belowFloorReason');
    const text = buildOfferText(sampleRows);
    expect(text.toLowerCase()).not.toContain('belowfloorreason');
    expect(text).not.toContain('price-match competitor quote');
  });
});
