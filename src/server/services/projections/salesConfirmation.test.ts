import { describe, it, expect } from 'vitest';
import { salesConfirmation } from './salesConfirmation';

describe('salesConfirmation external projector — leak fixture (spec §9.4)', () => {
  const fixture = {
    customerName: 'Big Buyer Co',
    soNo: 'SO-1',
    dateISO: '2026-05-20',
    internalNotes: 'INTERNAL: margin sensitive account',
    externalNotes: 'Ship by end of month',
    subtotal: 200,
    total: 200,
    lines: [
      {
        productName: 'Widget',
        qty: 20,
        unitPrice: 10,
        subtotal: 200,
        externalNotes: 'Standard grade',
        internalMargin: 40,
        unitCost: 8,
        unitCostResolved: true,
        sourceRowKey: 'SRC-ROW-42',
        legacyMarker: 'LEGACY_MARK',
        candidateSourceText: 'candidate text here'
      }
    ]
  };

  it('external projection omits all banned internal needles (spec §9.4)', () => {
    const ext = salesConfirmation.external(fixture);
    const serialized = JSON.stringify(ext);
    const banned = [
      'internalMargin',
      'unitCost',
      'unitCostResolved',
      'sourceRowKey',
      'legacyMarker',
      'candidateSourceText'
    ];
    for (const needle of banned) {
      expect(serialized, `serialized must not contain '${needle}'`).not.toContain(needle);
    }
  });

  it('external projection omits top-level internalNotes', () => {
    const ext = salesConfirmation.external(fixture);
    expect(ext).not.toHaveProperty('internalNotes');
    const serialized = JSON.stringify(ext);
    expect(serialized).not.toContain('INTERNAL: margin sensitive account');
  });

  it('external projection preserves external notes on lines', () => {
    const ext = salesConfirmation.external(fixture);
    expect(ext.lines[0].notes).toBe('Standard grade');
  });

  it('external projection does not carry the type-level witness key __EXTERNAL_PROJECTED__', () => {
    const ext = salesConfirmation.external(fixture);
    expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
  });

  it('external projection does not carry the internal-only witness key __INTERNAL_ONLY__', () => {
    const ext = salesConfirmation.external(fixture);
    expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
  });

  it('internal projection includes cogs and margin derived from line fields', () => {
    const int = salesConfirmation.internal(fixture);
    expect(int.internalNotes).toBe(fixture.internalNotes);
    expect(int.cogs?.perLine[0].unitCost).toBe(8);
    expect(int.margin?.perLine[0].marginAbs).toBe(40);
  });
});
