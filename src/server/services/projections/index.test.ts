// GH #152 — direct negative unit tests for validateExternalShape / validateInternalShape.
// GH #153 — value-type checks for load-bearing scalar fields (dateISO, documentNo,
//            totals.subtotal, totals.total, lines[i].qty, lines[i].subtotal).
//
// The validators in index.ts already check key-name allowlists and reject
// non-object / array roots. These tests verify that the guard paths throw on
// invalid inputs and that the value-type checks added for GH #153 fire correctly.

import { describe, it, expect } from 'vitest';
import { validateExternalShape, validateInternalShape } from './index';
import type { SnapshotKind } from './types';

const KIND: SnapshotKind = 'purchase_finalization';

/** Minimal valid external projection for purchase_finalization. */
const VALID_EXTERNAL = {
  kind: KIND,
  header: { title: 'PO Receipt', counterparty: 'Acme Farms', dateISO: '2026-05-22', documentNo: 'PO-001' },
  lines: [{ name: 'Mendo Breath', qty: 1, subtotal: 1200 }],
  totals: { subtotal: 1200, total: 1200 },
  footer: {},
  projectionVersion: 1,
};

/** Minimal valid internal projection for purchase_finalization. */
const VALID_INTERNAL = {
  ...VALID_EXTERNAL,
  internalNotes: 'margin target 30%',
};

// ---------------------------------------------------------------------------
// GH #152 — root-level guard tests
// ---------------------------------------------------------------------------

describe('validateExternalShape — root type guards (GH #152)', () => {
  it('throws when root is null', () => {
    expect(() => validateExternalShape(null, KIND))
      .toThrow(/expected JSON object at root/i);
  });

  it('throws when root is an array', () => {
    expect(() => validateExternalShape([], KIND))
      .toThrow(/expected JSON object at root/i);
  });

  it('throws when root is a string', () => {
    expect(() => validateExternalShape('not-an-object', KIND))
      .toThrow(/expected JSON object at root/i);
  });

  it('throws when root is a number', () => {
    expect(() => validateExternalShape(42, KIND))
      .toThrow(/expected JSON object at root/i);
  });

  it('throws on banned witness key __EXTERNAL_PROJECTED__ at root', () => {
    expect(() =>
      validateExternalShape({ ...VALID_EXTERNAL, __EXTERNAL_PROJECTED__: true }, KIND)
    ).toThrow(/__EXTERNAL_PROJECTED__/);
  });

  it('throws on banned witness key __INTERNAL_ONLY__ at root', () => {
    expect(() =>
      validateExternalShape({ ...VALID_EXTERNAL, __INTERNAL_ONLY__: true }, KIND)
    ).toThrow(/__INTERNAL_ONLY__/);
  });

  it('does NOT throw on valid minimal shape', () => {
    expect(() => validateExternalShape(VALID_EXTERNAL, KIND)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GH #152 — nested key guard tests
// ---------------------------------------------------------------------------

describe('validateExternalShape — nested key guards (GH #152)', () => {
  it('throws on unknown top-level key', () => {
    expect(() =>
      validateExternalShape({ ...VALID_EXTERNAL, unknownTopKey: 1 }, KIND)
    ).toThrow(/unknownTopKey/);
  });

  it('throws on unknown header key', () => {
    expect(() =>
      validateExternalShape(
        { ...VALID_EXTERNAL, header: { ...VALID_EXTERNAL.header, unknownHeaderKey: 'x' } },
        KIND,
      )
    ).toThrow(/unknownHeaderKey/);
  });

  it('throws when header is not an object', () => {
    expect(() =>
      validateExternalShape({ ...VALID_EXTERNAL, header: 'flat-string' }, KIND)
    ).toThrow(/expected object at header/i);
  });

  it('throws on unknown line key', () => {
    expect(() =>
      validateExternalShape(
        { ...VALID_EXTERNAL, lines: [{ name: 'Widget', qty: 1, subtotal: 100, unknownLineKey: 'x' }] },
        KIND,
      )
    ).toThrow(/unknownLineKey/);
  });

  it('throws when lines is not an array', () => {
    expect(() =>
      validateExternalShape({ ...VALID_EXTERNAL, lines: 'not-an-array' }, KIND)
    ).toThrow(/expected array at lines/i);
  });

  it('throws when a line element is not an object', () => {
    expect(() =>
      validateExternalShape({ ...VALID_EXTERNAL, lines: ['not-an-object'] }, KIND)
    ).toThrow(/expected object at lines\[0\]/i);
  });

  it('throws on unknown totals key', () => {
    expect(() =>
      validateExternalShape(
        { ...VALID_EXTERNAL, totals: { subtotal: 100, total: 100, unknownTotalsKey: 99 } },
        KIND,
      )
    ).toThrow(/unknownTotalsKey/);
  });

  it('throws when totals is not an object', () => {
    expect(() =>
      validateExternalShape({ ...VALID_EXTERNAL, totals: 42 }, KIND)
    ).toThrow(/expected object at totals/i);
  });

  it('throws on __INTERNAL_ONLY__ nested in header', () => {
    expect(() =>
      validateExternalShape(
        { ...VALID_EXTERNAL, header: { ...VALID_EXTERNAL.header, __INTERNAL_ONLY__: true } },
        KIND,
      )
    ).toThrow(/__INTERNAL_ONLY__/);
  });
});

// ---------------------------------------------------------------------------
// GH #152 — validateInternalShape root and nested guards
// ---------------------------------------------------------------------------

describe('validateInternalShape — root and nested guards (GH #152)', () => {
  it('throws when root is null', () => {
    expect(() => validateInternalShape(null, KIND))
      .toThrow(/expected JSON object at root/i);
  });

  it('throws when root is an array', () => {
    expect(() => validateInternalShape([], KIND))
      .toThrow(/expected JSON object at root/i);
  });

  it('throws on unknown top-level key', () => {
    expect(() =>
      validateInternalShape({ ...VALID_INTERNAL, unknownInternalKey: 'x' }, KIND)
    ).toThrow(/unknownInternalKey/);
  });

  it('throws on unknown cogs key (when cogs is present)', () => {
    const withCogs = {
      ...VALID_INTERNAL,
      cogs: { perLine: [], total: 0, unknownCogsKey: 'x' },
    };
    expect(() => validateInternalShape(withCogs, KIND)).toThrow(/unknownCogsKey/);
  });

  it('throws on unknown cogs.perLine[i] key', () => {
    const withCogs = {
      ...VALID_INTERNAL,
      cogs: { perLine: [{ name: 'Widget', landedCost: 80, unknownCogsLineKey: 'x' }], total: 80 },
    };
    expect(() => validateInternalShape(withCogs, KIND)).toThrow(/unknownCogsLineKey/);
  });

  it('throws on unknown margin key (when margin is present)', () => {
    const withMargin = {
      ...VALID_INTERNAL,
      margin: { perLine: [], total: 0, unknownMarginKey: 'x' },
    };
    expect(() => validateInternalShape(withMargin, KIND)).toThrow(/unknownMarginKey/);
  });

  it('throws on unknown diagnostics key (when diagnostics is present)', () => {
    const withDiag = {
      ...VALID_INTERNAL,
      diagnostics: { unresolvedSources: [], legacyMarkers: [], unknownDiagKey: 'x' },
    };
    expect(() => validateInternalShape(withDiag, KIND)).toThrow(/unknownDiagKey/);
  });

  it('does NOT throw on valid internal shape', () => {
    expect(() => validateInternalShape(VALID_INTERNAL, KIND)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GH #153 — value-type checks for load-bearing scalar fields
// ---------------------------------------------------------------------------

describe('validateExternalShape — value-type checks (GH #153)', () => {
  it('throws when totals.subtotal is not a number', () => {
    expect(() =>
      validateExternalShape(
        { ...VALID_EXTERNAL, totals: { subtotal: { evil: 1 }, total: 1200 } },
        KIND,
      )
    ).toThrow(/totals\.subtotal must be a number/i);
  });

  it('throws when totals.total is not a number', () => {
    expect(() =>
      validateExternalShape(
        { ...VALID_EXTERNAL, totals: { subtotal: 1200, total: '$1200' } },
        KIND,
      )
    ).toThrow(/totals\.total must be a number/i);
  });

  it('throws when header.dateISO is not a string', () => {
    expect(() =>
      validateExternalShape(
        { ...VALID_EXTERNAL, header: { ...VALID_EXTERNAL.header, dateISO: 20260522 } },
        KIND,
      )
    ).toThrow(/header\.dateISO must be a string/i);
  });

  it('throws when header.documentNo is not a string', () => {
    expect(() =>
      validateExternalShape(
        { ...VALID_EXTERNAL, header: { ...VALID_EXTERNAL.header, documentNo: null } },
        KIND,
      )
    ).toThrow(/header\.documentNo must be a string/i);
  });

  it('throws when lines[0].qty is not a number', () => {
    expect(() =>
      validateExternalShape(
        { ...VALID_EXTERNAL, lines: [{ name: 'Widget', qty: 'one', subtotal: 100 }] },
        KIND,
      )
    ).toThrow(/lines\[0\]\.qty must be a number/i);
  });

  it('throws when lines[0].subtotal is not a number', () => {
    expect(() =>
      validateExternalShape(
        { ...VALID_EXTERNAL, lines: [{ name: 'Widget', qty: 1, subtotal: 'hundred' }] },
        KIND,
      )
    ).toThrow(/lines\[0\]\.subtotal must be a number/i);
  });

  it('does NOT throw when value-type fields are present with correct types', () => {
    expect(() => validateExternalShape(VALID_EXTERNAL, KIND)).not.toThrow();
  });
});