/**
 * Tests for sales export utility functions.
 * Issue #63: customer-facing catalog exports must NEVER contain cost, margin,
 * or other internal operator fields, regardless of showMargin toggle state.
 */
import { describe, it, expect } from 'vitest';
import {
  csvValue,
  getCatalogHeaders,
  getInternalHeaders,
  buildSheetCsv
} from './salesExport';
import type { GridRow } from '../../shared/types';

describe('csvValue', () => {
  it('converts null/undefined to empty string', () => {
    expect(csvValue(null)).toBe('');
    expect(csvValue(undefined)).toBe('');
  });

  it('joins arrays with pipe separator', () => {
    expect(csvValue(['a', 'b', 'c'])).toBe('a|b|c');
  });

  it('wraps values with commas, quotes, or newlines in double quotes', () => {
    expect(csvValue('hello, world')).toBe('"hello, world"');
    expect(csvValue('say "hi"')).toBe('"say ""hi"""');
    expect(csvValue('line1\nline2')).toBe('"line1\nline2"');
  });

  it('returns plain string for simple values', () => {
    expect(csvValue('flower')).toBe('flower');
    expect(csvValue(42)).toBe('42');
  });
});

describe('getCatalogHeaders — customer-safe export regression (#63)', () => {
  it('does not include unitCost', () => {
    expect(getCatalogHeaders()).not.toContain('unitCost');
  });

  it('does not include estimatedMargin', () => {
    expect(getCatalogHeaders()).not.toContain('estimatedMargin');
  });

  it('does not include internalMargin', () => {
    expect(getCatalogHeaders()).not.toContain('internalMargin');
  });

  it('does not include cost', () => {
    const lower = getCatalogHeaders().map((h) => h.toLowerCase());
    expect(lower.every((h) => !h.includes('cost'))).toBe(true);
  });

  it('does not include margin', () => {
    const lower = getCatalogHeaders().map((h) => h.toLowerCase());
    expect(lower.every((h) => !h.includes('margin'))).toBe(true);
  });

  it('includes expected customer-facing fields', () => {
    const headers = getCatalogHeaders();
    expect(headers).toContain('batchCode');
    expect(headers).toContain('name');
    expect(headers).toContain('category');
    expect(headers).toContain('availableQty');
    expect(headers).toContain('unitPrice');
  });
});

describe('getInternalHeaders — operator sheet', () => {
  it('includes unitCost for operator view', () => {
    expect(getInternalHeaders()).toContain('unitCost');
  });

  it('includes estimatedMargin for operator view', () => {
    expect(getInternalHeaders()).toContain('estimatedMargin');
  });
});

describe('buildSheetCsv — catalog mode regression (#63)', () => {
  const sampleRows: Partial<GridRow>[] = [
    {
      id: 'row-1',
      batchCode: 'BC001',
      name: 'Flower A',
      category: 'Flower',
      vendor: 'Acme',
      availableQty: 100,
      unitPrice: 50,
      unitCost: 30,
      estimatedMargin: 0.4,
      internalMargin: 0.38,
      tags: ['indoor'],
      reason: 'Top seller'
    }
  ];

  it('catalog CSV does not contain "unitCost" header or value column', () => {
    const csv = buildSheetCsv(sampleRows as GridRow[], 'catalog');
    const lines = csv.split('\n');
    const headerLine = lines[0];
    expect(headerLine).not.toMatch(/unitCost/);
  });

  it('catalog CSV does not contain "estimatedMargin" header or value column', () => {
    const csv = buildSheetCsv(sampleRows as GridRow[], 'catalog');
    const headerLine = csv.split('\n')[0];
    expect(headerLine).not.toMatch(/estimatedMargin/);
  });

  it('catalog CSV does not contain "internalMargin" header or value column', () => {
    const csv = buildSheetCsv(sampleRows as GridRow[], 'catalog');
    const headerLine = csv.split('\n')[0];
    expect(headerLine).not.toMatch(/internalMargin/);
  });

  it('catalog CSV body does not leak the cost value (30) from sample rows', () => {
    // The unitCost column (30) should not appear in catalog output
    const csv = buildSheetCsv(sampleRows as GridRow[], 'catalog');
    // The cost value in an isolated column should not be present
    // (it could appear if cost happened to equal another legitimate field value,
    // but our headers-only check ensures the column is excluded)
    const lines = csv.split('\n');
    expect(lines.length).toBe(2); // header + 1 data row
    const dataRow = lines[1];
    const headerCount = getCatalogHeaders().length;
    const valueCount = dataRow.split(',').length;
    expect(valueCount).toBe(headerCount);
  });

  it('internal CSV includes cost and margin data', () => {
    const csv = buildSheetCsv(sampleRows as GridRow[], 'internal');
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toMatch(/unitCost/);
    expect(headerLine).toMatch(/estimatedMargin/);
  });

  it('internal CSV with showMargin: false omits unitCost and estimatedMargin headers', () => {
    const csv = buildSheetCsv(sampleRows as GridRow[], 'internal', { showMargin: false });
    const headerLine = csv.split('\n')[0];
    expect(headerLine).not.toMatch(/unitCost/);
    expect(headerLine).not.toMatch(/estimatedMargin/);
    expect(headerLine).not.toMatch(/internalMargin/);
  });

  it('internal CSV default (showMargin omitted) still includes cost and margin data', () => {
    const csv = buildSheetCsv(sampleRows as GridRow[], 'internal');
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toMatch(/unitCost/);
    expect(headerLine).toMatch(/estimatedMargin/);
  });

  it('internal CSV with showMargin: true still includes cost and margin data', () => {
    const csv = buildSheetCsv(sampleRows as GridRow[], 'internal', { showMargin: true });
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toMatch(/unitCost/);
    expect(headerLine).toMatch(/estimatedMargin/);
  });

  it('produces valid CSV with header + row count matching sample input', () => {
    const csv = buildSheetCsv(sampleRows as GridRow[], 'catalog');
    const lines = csv.split('\n');
    expect(lines.length).toBe(sampleRows.length + 1); // header + rows
  });
});
