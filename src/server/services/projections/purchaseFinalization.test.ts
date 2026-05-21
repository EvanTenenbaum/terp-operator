import { describe, it, expect } from 'vitest';
import { purchaseFinalization } from './purchaseFinalization';

describe('purchaseFinalization external projector — leak fixture (spec §9.3)', () => {
  const fixture = {
    vendorName: 'Acme',
    poNo: 'PO-1',
    dateISO: '2026-05-20',
    internalNotes: 'INTERNAL: vendor pays freight, 2pct early-pay discount',
    externalNotes: 'Net 30',
    lines: [
      {
        productName: 'Widget',
        qty: 10,
        unitPrice: 5,
        subtotal: 50,
        externalNotes: 'Grade A',
        internalNotes: 'INTERNAL: COGS 3.20',
        landedCost: 3.20,
        margin: { abs: 1.80, pct: 36 },
        diagnostics: { unresolvedSources: ['ROW#42'] }
      }
    ],
    subtotal: 50,
    total: 50
  };

  it('external projection omits all banned internal needles (spec §9.3)', () => {
    const ext = purchaseFinalization.external(fixture);
    const serialized = JSON.stringify(ext);
    const banned = [
      'INTERNAL:',
      'landedCost',
      'margin',
      'unresolvedSources',
      'ROW#42',
      'internalNotes',
      'vendorTermsInternal'
    ];
    for (const needle of banned) {
      expect(serialized, `serialized must not contain '${needle}'`).not.toContain(needle);
    }
  });

  it('external projection preserves external notes on lines', () => {
    const ext = purchaseFinalization.external(fixture);
    expect(ext.lines[0].notes).toBe('Grade A');
  });

  it('external projection does not carry the type-level witness key __EXTERNAL_PROJECTED__', () => {
    const ext = purchaseFinalization.external(fixture);
    expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
  });

  it('external projection does not carry the internal-only witness key __INTERNAL_ONLY__', () => {
    const ext = purchaseFinalization.external(fixture);
    expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
  });

  it('internal projection includes the expected internal fields', () => {
    const int = purchaseFinalization.internal(fixture);
    expect(int.internalNotes).toBe(fixture.internalNotes);
    expect(int.cogs).toBeDefined();
    expect(int.margin).toBeDefined();
    expect(int.diagnostics?.unresolvedSources).toContain('ROW#42');
  });
});
