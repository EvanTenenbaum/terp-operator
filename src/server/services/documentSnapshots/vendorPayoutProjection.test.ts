import { describe, it, expect } from 'vitest';
import {
  EXTERNAL_FIELDS,
  INTERNAL_FIELDS,
  PROJECTION_VERSION,
  projectExternal,
  renderPlainTextExternal,
  renderPlainTextInternal,
} from './vendorPayoutProjection';

const INTERNAL = {
  kind: 'vendor_payout',
  paymentDate: '2026-05-21',
  amount: '2400.00',
  method: 'ach',
  reference: 'ACH-7791',
  vendorName: 'Summit Genetics',
  billNo: 'VBILL-0042',
  notes: null,
  vendorId: 'v-summit-1',
  vendorBillId: 'vb-88',
  purchaseOrderId: 'po-55',
  status: 'posted',
};

describe('vendor_payout projection — field constants', () => {
  it('PROJECTION_VERSION is a positive integer', () => {
    expect(typeof PROJECTION_VERSION).toBe('number');
    expect(PROJECTION_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(PROJECTION_VERSION)).toBe(true);
  });

  it('EXTERNAL_FIELDS includes the expected vendor-facing keys', () => {
    expect([...EXTERNAL_FIELDS].sort()).toEqual([
      'amount',
      'billNo',
      'kind',
      'method',
      'notes',
      'paymentDate',
      'reference',
      'vendorName',
    ]);
  });

  it('INTERNAL_FIELDS is a superset of EXTERNAL_FIELDS', () => {
    for (const field of EXTERNAL_FIELDS) {
      expect(INTERNAL_FIELDS).toContain(field);
    }
  });
});

describe('vendor_payout projection — projectExternal', () => {
  it('returns only EXTERNAL_FIELDS keys (leak guard)', () => {
    const { payload } = projectExternal(INTERNAL);
    expect(Object.keys(payload).sort()).toEqual([...EXTERNAL_FIELDS].sort());
  });

  it('does NOT include vendorId in external payload', () => {
    const { payload } = projectExternal(INTERNAL);
    expect((payload as Record<string, unknown>).vendorId).toBeUndefined();
  });

  it('does NOT include vendorBillId, purchaseOrderId, status in external payload', () => {
    const { payload } = projectExternal(INTERNAL);
    expect((payload as Record<string, unknown>).vendorBillId).toBeUndefined();
    expect((payload as Record<string, unknown>).purchaseOrderId).toBeUndefined();
    expect((payload as Record<string, unknown>).status).toBeUndefined();
  });

  it('preserves external-safe values correctly', () => {
    const { payload } = projectExternal(INTERNAL);
    expect(payload.amount).toBe('2400.00');
    expect(payload.vendorName).toBe('Summit Genetics');
    expect(payload.billNo).toBe('VBILL-0042');
    expect(payload.method).toBe('ach');
    expect(payload.reference).toBe('ACH-7791');
  });

  it('returns projectionVersion equal to PROJECTION_VERSION', () => {
    const { projectionVersion } = projectExternal(INTERNAL);
    expect(projectionVersion).toBe(PROJECTION_VERSION);
  });

  it('snapshot on EXTERNAL_FIELDS list is stable (version guard)', () => {
    expect([...EXTERNAL_FIELDS].sort()).toMatchInlineSnapshot(`
      [
        "amount",
        "billNo",
        "kind",
        "method",
        "notes",
        "paymentDate",
        "reference",
        "vendorName",
      ]
    `);
    expect(PROJECTION_VERSION).toBe(1);
  });
});

describe('vendor_payout projection — renderers', () => {
  it('renderPlainTextExternal returns a readable string with amount and vendor name', () => {
    const text = renderPlainTextExternal(projectExternal(INTERNAL).payload);
    expect(text).toMatch(/Summit Genetics/);
    expect(text).toMatch(/2400\.00/);
    expect(text).toMatch(/ach/);
    expect(text).toMatch(/VBILL-0042/);
    expect(text).toMatch(/ACH-7791/);
    expect(text).not.toMatch(/INTERNAL/i);
    expect(text).not.toMatch(/vendorId/i);
  });

  it('renderPlainTextInternal starts with INTERNAL — DO NOT SEND', () => {
    const text = renderPlainTextInternal(INTERNAL);
    expect(text.startsWith('INTERNAL — DO NOT SEND')).toBe(true);
  });

  it('renderPlainTextInternal includes vendorBillId and purchaseOrderId', () => {
    const text = renderPlainTextInternal(INTERNAL);
    expect(text).toMatch(/vb-88/);
    expect(text).toMatch(/po-55/);
  });

  it('renderPlainTextInternal includes vendor name and amount', () => {
    const text = renderPlainTextInternal(INTERNAL);
    expect(text).toMatch(/Summit Genetics/);
    expect(text).toMatch(/2400\.00/);
  });

  it('renderPlainTextInternal includes status', () => {
    const text = renderPlainTextInternal(INTERNAL);
    expect(text).toMatch(/posted/);
  });
});
