import { describe, it, expect } from 'vitest';
import { buildPurchaseOrderInternalPayload } from './poInternalBuilder';

const PO = {
  id: 'po-1', poNo: 'PO-2026-001', vendorId: 'v-1', status: 'finalized',
  expectedDate: new Date('2026-06-01T00:00:00Z'),
  orderedAt: null, receivedAt: null, cancelledAt: null,
  total: '6000.00', orderedBy: 'u-1',
  paymentTerms: 'net_14', prepaymentAmount: '1500.00',
  finalizedAt: new Date('2026-05-20T15:00:00Z'),
  buyerNotes: 'BUYER ONLY — do not share',
  internalNotes: 'INTERNAL — margin target 30%',
  externalNotes: 'Vendor: please confirm delivery window.',
  refereeRelationshipId: 'r-1',
  refereeCreditAmount: '50.00'
};
const VENDOR = { id: 'v-1', name: 'Acme Farms', alias: 'ACME' };
const LINES = [
  {
    id: 'l-1', purchaseOrderId: 'po-1', itemId: 'i-1',
    productName: 'Mendo Breath', category: 'Flower', tags: ['indoor'],
    qty: '5.000', receivedQty: '0.000', uom: 'lb',
    unitCost: '1200.00', unitPrice: '1800.00',
    costRangeLow: '1100.00', costRangeHigh: '1300.00',
    sourceCode: 'SRC-A', shorthand: 'MB', legacyMarker: null,
    ownershipStatus: 'C',
    notes: 'Generic line note',
    internalNotes: 'Internal target $1250',
    externalNotes: 'Vendor confirmed lot id',
    status: 'planned'
  }
];

describe('buildPurchaseOrderInternalPayload', () => {
  it('produces a full internal payload preserving every PO + line field plus vendor labels', () => {
    const payload = buildPurchaseOrderInternalPayload({ purchaseOrder: PO as any, vendor: VENDOR as any, lines: LINES as any });
    expect(payload.poNo).toBe('PO-2026-001');
    expect(payload.vendorName).toBe('Acme Farms');
    expect(payload.vendorAlias).toBe('ACME');
    expect(payload.internalNotes).toBe('INTERNAL — margin target 30%');
    expect(payload.buyerNotes).toBe('BUYER ONLY — do not share');
    expect(payload.externalNotes).toBe('Vendor: please confirm delivery window.');
    expect(payload.paymentTerms).toBe('net_14');
    expect(Number(payload.prepaymentAmount)).toBe(1500);
    expect(Number(payload.total)).toBe(6000);
    expect(payload.refereeRelationshipId).toBe('r-1');
    expect(Array.isArray(payload.lines)).toBe(true);
    expect((payload.lines as any[])[0]).toMatchObject({
      productName: 'Mendo Breath',
      category: 'Flower',
      qty: 5,
      uom: 'lb',
      unitCost: 1200,
      unitPrice: 1800,
      costRangeLow: 1100,
      costRangeHigh: 1300,
      externalNotes: 'Vendor confirmed lot id',
      internalNotes: 'Internal target $1250',
      notes: 'Generic line note'
    });
  });
  it('handles null vendor by setting vendorName to null and vendorAlias to null', () => {
    const payload = buildPurchaseOrderInternalPayload({ purchaseOrder: PO as any, vendor: null, lines: LINES as any });
    expect(payload.vendorName).toBeNull();
    expect(payload.vendorAlias).toBeNull();
  });
});
