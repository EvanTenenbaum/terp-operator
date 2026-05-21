import { describe, it, expect } from 'vitest';
import { vendorPayout } from './vendorPayout';

describe('vendorPayout external projector — leak fixture (Phase 1 stub)', () => {
  const fixture = {
    vendorName: 'Acme',
    payoutRef: 'PAYOUT-001',
    dateISO: '2026-05-20',
    amount: 300,
    internalReconciliationNotes: 'INTERNAL: net of deductions, approved by ops'
  };

  it('external projection does not contain internalReconciliationNotes', () => {
    const ext = vendorPayout.external(fixture);
    const serialized = JSON.stringify(ext);
    expect(serialized).not.toContain('internalReconciliationNotes');
    expect(serialized).not.toContain('INTERNAL:');
  });

  it('external projection does not carry witness keys', () => {
    const ext = vendorPayout.external(fixture);
    expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
    expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
  });
});
