import { describe, it, expect } from 'vitest';
import { invoice } from './invoice';

describe('invoice external projector — leak fixture', () => {
  const fixture = {
    customerName: 'Big Buyer Co',
    soNo: 'SO-1',
    invoiceNo: 'INV-001',
    dueDateISO: '2026-06-20',
    dateISO: '2026-05-20',
    internalNotes: 'INTERNAL: margin sensitive account',
    externalNotes: 'Net 30',
    subtotal: 200,
    total: 200,
    lines: [{
      productName: 'Widget',
      qty: 20,
      unitPrice: 10,
      subtotal: 200,
      externalNotes: 'Standard grade',
      internalMargin: 40,
      unitCost: 8,
      unitCostResolved: true,
      sourceRowKey: 'SRC-42',
      legacyMarker: 'LM1',
      candidateSourceText: 'candidate text'
    }]
  };

  it('external projection omits all banned internal line fields', () => {
    const ext = invoice.external(fixture);
    const serialized = JSON.stringify(ext);
    for (const needle of [
      'internalMargin', 'unitCost', 'unitCostResolved',
      'sourceRowKey', 'legacyMarker', 'candidateSourceText'
    ]) {
      expect(serialized, `must not contain '${needle}'`).not.toContain(needle);
    }
  });

  it('external projection omits top-level internalNotes', () => {
    const ext = invoice.external(fixture);
    expect(ext).not.toHaveProperty('internalNotes');
    expect(JSON.stringify(ext)).not.toContain('INTERNAL:');
  });

  it('external projection does not carry witness keys', () => {
    const ext = invoice.external(fixture);
    expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
    expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
  });
});
