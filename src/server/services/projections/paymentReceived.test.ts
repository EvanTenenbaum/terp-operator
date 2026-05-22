import { describe, it, expect } from 'vitest';
import { paymentReceived } from './paymentReceived';

describe('paymentReceived external projector — leak fixture (Phase 1 stub)', () => {
  const fixture = {
    customerName: 'Big Buyer Co',
    paymentRef: 'PAY-001',
    dateISO: '2026-05-20',
    amount: 500,
    internalReconciliationNotes: 'INTERNAL: partial allocation, 2 open invoices'
  };

  it('external projection does not contain internalReconciliationNotes', () => {
    const ext = paymentReceived.external(fixture);
    const serialized = JSON.stringify(ext);
    expect(serialized).not.toContain('internalReconciliationNotes');
    expect(serialized).not.toContain('INTERNAL:');
  });

  it('external projection does not carry witness keys', () => {
    const ext = paymentReceived.external(fixture);
    expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
    expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
  });
});

describe('paymentReceived internal projector — optional internalNotes hygiene (Phase 4)', () => {
  const fixtureWithoutNotes = { customerName: 'Big Buyer Co', paymentRef: 'PAY-002', dateISO: '2026-05-22', amount: 250 };

  it('internal projection omits internalNotes entirely when input has no internalReconciliationNotes', () => {
    const int = paymentReceived.internal(fixtureWithoutNotes);
    expect(int).not.toHaveProperty('internalNotes');
    expect(Object.keys(int)).not.toContain('internalNotes');
  });

  it('internal projection still includes internalNotes when input provides it', () => {
    const int = paymentReceived.internal({ ...fixtureWithoutNotes, internalReconciliationNotes: 'partial allocation' });
    expect(int).toHaveProperty('internalNotes', 'partial allocation');
  });
});
