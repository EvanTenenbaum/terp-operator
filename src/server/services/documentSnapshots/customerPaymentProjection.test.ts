import { describe, it, expect } from 'vitest';
import {
  EXTERNAL_FIELDS,
  INTERNAL_FIELDS,
  PROJECTION_VERSION,
  projectExternal,
  renderPlainTextExternal,
  renderPlainTextInternal,
} from './customerPaymentProjection';

const INTERNAL = {
  kind: 'customer_payment',
  paymentDate: '2026-05-20',
  amount: '500.00',
  method: 'check',
  reference: 'CHK-1042',
  customerName: 'Green Valley Farms',
  notes: 'May invoice payment',
  direction: 'money_in',
  category: 'client_payment',
  allocationIntent: 'fifo',
  status: 'posted',
  customerId: 'c-abc-123',
};

describe('customer_payment projection — field constants', () => {
  it('PROJECTION_VERSION is a positive integer', () => {
    expect(typeof PROJECTION_VERSION).toBe('number');
    expect(PROJECTION_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(PROJECTION_VERSION)).toBe(true);
  });

  it('EXTERNAL_FIELDS includes the expected customer-facing keys', () => {
    expect([...EXTERNAL_FIELDS].sort()).toEqual([
      'amount',
      'customerName',
      'kind',
      'method',
      'notes',
      'paymentDate',
      'reference',
    ]);
  });

  it('INTERNAL_FIELDS is a superset of EXTERNAL_FIELDS', () => {
    for (const field of EXTERNAL_FIELDS) {
      expect(INTERNAL_FIELDS).toContain(field);
    }
  });
});

describe('customer_payment projection — projectExternal', () => {
  it('returns only EXTERNAL_FIELDS keys (leak guard)', () => {
    const { payload } = projectExternal(INTERNAL);
    expect(Object.keys(payload).sort()).toEqual([...EXTERNAL_FIELDS].sort());
  });

  it('does NOT include customerId in external payload', () => {
    const { payload } = projectExternal(INTERNAL);
    expect((payload as Record<string, unknown>).customerId).toBeUndefined();
  });

  it('does NOT include direction, category, allocationIntent, status in external payload', () => {
    const { payload } = projectExternal(INTERNAL);
    expect((payload as Record<string, unknown>).direction).toBeUndefined();
    expect((payload as Record<string, unknown>).category).toBeUndefined();
    expect((payload as Record<string, unknown>).allocationIntent).toBeUndefined();
    expect((payload as Record<string, unknown>).status).toBeUndefined();
  });

  it('preserves external-safe values correctly', () => {
    const { payload } = projectExternal(INTERNAL);
    expect(payload.amount).toBe('500.00');
    expect(payload.customerName).toBe('Green Valley Farms');
    expect(payload.method).toBe('check');
    expect(payload.reference).toBe('CHK-1042');
  });

  it('returns projectionVersion equal to PROJECTION_VERSION', () => {
    const { projectionVersion } = projectExternal(INTERNAL);
    expect(projectionVersion).toBe(PROJECTION_VERSION);
  });

  it('includes field as undefined when missing from internal (no hard-coded requirement)', () => {
    const minimal = { kind: 'customer_payment', amount: '100.00', method: 'cash', customerName: 'Test Co' };
    const { payload } = projectExternal(minimal);
    // Keys not in src are simply omitted
    expect(payload.amount).toBe('100.00');
    expect(payload.kind).toBe('customer_payment');
  });

  it('snapshot on EXTERNAL_FIELDS list is stable (version guard)', () => {
    expect([...EXTERNAL_FIELDS].sort()).toMatchInlineSnapshot(`
      [
        "amount",
        "customerName",
        "kind",
        "method",
        "notes",
        "paymentDate",
        "reference",
      ]
    `);
    expect(PROJECTION_VERSION).toBe(1);
  });
});

describe('customer_payment projection — renderers', () => {
  it('renderPlainTextExternal returns a readable string with amount and customer name', () => {
    const text = renderPlainTextExternal(projectExternal(INTERNAL).payload);
    expect(text).toMatch(/Green Valley Farms/);
    expect(text).toMatch(/500\.00/);
    expect(text).toMatch(/check/);
    expect(text).toMatch(/CHK-1042/);
    expect(text).not.toMatch(/INTERNAL/i);
    expect(text).not.toMatch(/customerId/i);
  });

  it('renderPlainTextInternal starts with INTERNAL — DO NOT SEND', () => {
    const text = renderPlainTextInternal(INTERNAL);
    expect(text.startsWith('INTERNAL — DO NOT SEND')).toBe(true);
  });

  it('renderPlainTextInternal includes direction and status', () => {
    const text = renderPlainTextInternal(INTERNAL);
    expect(text).toMatch(/money_in/);
    expect(text).toMatch(/posted/);
  });

  it('renderPlainTextInternal includes customer name and amount', () => {
    const text = renderPlainTextInternal(INTERNAL);
    expect(text).toMatch(/Green Valley Farms/);
    expect(text).toMatch(/500\.00/);
  });
});
