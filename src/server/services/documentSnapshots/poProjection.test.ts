import { describe, it, expect } from 'vitest';
import {
  EXTERNAL_FIELDS,
  EXTERNAL_LINE_FIELDS,
  PROJECTION_VERSION,
  projectExternal,
  renderPlainTextExternal,
  renderPlainTextInternal
} from './poProjection';

const INTERNAL = {
  poNo: 'PO-2026-001',
  vendorId: 'v-1',
  vendorName: 'Acme Farms',
  vendorAlias: 'ACME',
  status: 'finalized',
  expectedDate: '2026-06-01T00:00:00.000Z',
  orderedAt: null,
  finalizedAt: '2026-05-20T15:00:00.000Z',
  paymentTerms: 'net_14',
  prepaymentAmount: 1500,
  total: 6000,
  buyerNotes: 'BUYER ONLY — do not share',
  internalNotes: 'INTERNAL — margin target 30%',
  externalNotes: 'Vendor: please confirm delivery window.',
  refereeRelationshipId: 'r-1',
  refereeCreditAmount: 50,
  lines: [
    {
      id: 'l-1', purchaseOrderId: 'po-1', itemId: 'i-1',
      productName: 'Mendo Breath', category: 'Flower', tags: ['indoor'],
      qty: 5, receivedQty: 0, uom: 'lb',
      unitCost: 1200, unitPrice: 1800,
      costRangeLow: 1100, costRangeHigh: 1300,
      sourceCode: 'SRC-A', shorthand: 'MB', legacyMarker: null,
      ownershipStatus: 'C',
      notes: 'Generic line note',
      internalNotes: 'Internal target $1250',
      externalNotes: 'Vendor confirmed lot id',
      status: 'planned'
    }
  ]
};

describe('PO projection — header allowlist', () => {
  it('PROJECTION_VERSION is 1 for Tranche 1', () => {
    expect(PROJECTION_VERSION).toBe(1);
  });
  it('EXTERNAL_FIELDS lists exactly the locked header keys', () => {
    expect([...EXTERNAL_FIELDS].sort()).toEqual([
      'expectedDate', 'externalNotes', 'finalizedAt', 'lines',
      'paymentTerms', 'poNo', 'prepaymentAmount', 'total',
      'vendorAlias', 'vendorName'
    ]);
  });
});

describe('PO projection — projectExternal', () => {
  it('returns only allowlisted header keys', () => {
    const { payload } = projectExternal(INTERNAL);
    expect(Object.keys(payload).sort()).toEqual([...EXTERNAL_FIELDS].sort());
  });
  it('lines contain only allowlisted line keys (no unitPrice, no internalNotes, no notes)', () => {
    const { payload } = projectExternal(INTERNAL);
    const line = (payload.lines as any[])[0];
    expect(Object.keys(line).sort()).toEqual([
      'category', 'costRangeHigh', 'costRangeLow',
      'externalNotes', 'productName', 'qty', 'unitCost', 'uom'
    ]);
    expect((line as Record<string, unknown>).unitPrice).toBeUndefined();
    expect((line as Record<string, unknown>).internalNotes).toBeUndefined();
    expect((line as Record<string, unknown>).notes).toBeUndefined();
    expect((line as Record<string, unknown>).sourceCode).toBeUndefined();
  });
  it('drops internalNotes, buyerNotes, refereeRelationshipId, refereeCreditAmount from header', () => {
    const { payload } = projectExternal(INTERNAL);
    expect((payload as any).internalNotes).toBeUndefined();
    expect((payload as any).buyerNotes).toBeUndefined();
    expect((payload as any).refereeRelationshipId).toBeUndefined();
    expect((payload as any).refereeCreditAmount).toBeUndefined();
    expect((payload as any).status).toBeUndefined();
  });
  it('returns projectionVersion equal to PROJECTION_VERSION', () => {
    const { projectionVersion } = projectExternal(INTERNAL);
    expect(projectionVersion).toBe(PROJECTION_VERSION);
  });
  it('throws when a required header key is missing from internal payload', () => {
    const broken = { ...INTERNAL } as Record<string, unknown>;
    delete broken.poNo;
    expect(() => projectExternal(broken)).toThrow(/poNo/);
  });
  it('throws when an extra (unknown) line key would leak via a bypass', async () => {
    const fake = { unitCost: 100, leakField: 'secret' };
    const { assertExternalLineShape } = await import('./poProjection');
    expect(() => assertExternalLineShape(fake)).toThrow(/leakField/);
  });
  it('fails if EXTERNAL_FIELDS changes but PROJECTION_VERSION was not bumped', () => {
    const sortedAllowlists = [
      [...EXTERNAL_FIELDS].sort(),
      [...EXTERNAL_LINE_FIELDS].sort()
    ];
    expect(sortedAllowlists).toMatchInlineSnapshot(`
      [
        [
          "expectedDate",
          "externalNotes",
          "finalizedAt",
          "lines",
          "paymentTerms",
          "poNo",
          "prepaymentAmount",
          "total",
          "vendorAlias",
          "vendorName",
        ],
        [
          "category",
          "costRangeHigh",
          "costRangeLow",
          "externalNotes",
          "productName",
          "qty",
          "unitCost",
          "uom",
        ],
      ]
    `);
    expect(PROJECTION_VERSION).toBe(1);
  });
});

describe('PO projection — renderers', () => {
  it('renderPlainTextExternal produces human-readable sentences and contains no internal terms', () => {
    const text = renderPlainTextExternal(projectExternal(INTERNAL).payload);
    expect(text).toMatch(/PO-2026-001/);
    expect(text).toMatch(/Acme Farms/);
    expect(text).toMatch(/Vendor unit price/i);
    expect(text).toMatch(/Vendor price range/i);
    expect(text).not.toMatch(/INTERNAL/i);
    expect(text).not.toMatch(/internalNotes/i);
    expect(text).not.toMatch(/unitPrice/i);
    expect(text).not.toMatch(/BUYER ONLY/);
  });
  it('renderPlainTextInternal includes the INTERNAL — DO NOT SEND watermark and internal-only fields', () => {
    const text = renderPlainTextInternal(INTERNAL);
    expect(text.startsWith('INTERNAL — DO NOT SEND')).toBe(true);
    expect(text).toMatch(/margin target 30%/);
    expect(text).toMatch(/BUYER ONLY/);
    expect(text).toMatch(/Resale\/markup/i);
  });
});
