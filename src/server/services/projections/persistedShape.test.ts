// Task 10 — Persisted-shape allowlist test (spec §9.7).
//
// For each kind:
//   1. Build a minimal fixture with enough data to exercise the projector.
//   2. Run the projector's external() function.
//   3. Assert every top-level and nested key is in the kind's allowlist.
//   4. Assert the output does NOT carry __EXTERNAL_PROJECTED__ or __INTERNAL_ONLY__
//      (witness keys must NEVER be persisted to disk).
//
// This test is the machine-readable companion to the human-readable leak
// fixtures in purchaseFinalization.test.ts / salesConfirmation.test.ts.

import { describe, it, expect } from 'vitest';
import { validateExternalShape } from './index';
import { purchaseFinalization, externalAllowlist as poAllow } from './purchaseFinalization';
import { salesConfirmation, externalAllowlist as soAllow } from './salesConfirmation';
import { invoice, externalAllowlist as invAllow } from './invoice';
import { paymentReceived, externalAllowlist as payAllow } from './paymentReceived';
import { vendorPayout, externalAllowlist as payoutAllow } from './vendorPayout';

function assertSubsetOfAllowlist(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  path: string
) {
  for (const k of Object.keys(obj)) {
    expect(
      (allowed as string[]).includes(k),
      `key '${k}' at ${path} must be in allowlist [${allowed.join(', ')}]`
    ).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// Fixtures — one per kind
// ---------------------------------------------------------------------------

const poFixture = {
  vendorName: 'Acme', poNo: 'PO-1', dateISO: '2026-05-20',
  externalNotes: 'Net 30',
  internalNotes: 'INTERNAL: do not share',
  subtotal: 100, total: 100,
  lines: [{
    productName: 'Widget', qty: 10, unitPrice: 5, subtotal: 50,
    externalNotes: 'Grade A', internalNotes: 'INTERNAL: COGS 3.20',
    landedCost: 3.20, margin: { abs: 1.80, pct: 36 }
  }]
};

const soFixture = {
  customerName: 'Big Buyer', soNo: 'SO-1', dateISO: '2026-05-20',
  externalNotes: 'Ship soon', internalNotes: 'INTERNAL: margin sensitive',
  subtotal: 200, total: 200,
  lines: [{
    productName: 'Widget', qty: 20, unitPrice: 10, subtotal: 200,
    externalNotes: 'Standard', internalMargin: 40, unitCost: 8,
    unitCostResolved: true, sourceRowKey: 'SRC-42', legacyMarker: 'LM1',
    candidateSourceText: 'candidate'
  }]
};

const invFixture = {
  ...soFixture,
  invoiceNo: 'INV-001',
  dueDateISO: '2026-06-20'
};

const payFixture = {
  customerName: 'Big Buyer',
  paymentRef: 'PAY-001',
  dateISO: '2026-05-20',
  amount: 500,
  internalReconciliationNotes: 'INTERNAL: partial payment'
};

const payoutFixture = {
  vendorName: 'Acme',
  payoutRef: 'PAYOUT-001',
  dateISO: '2026-05-20',
  amount: 300,
  internalReconciliationNotes: 'INTERNAL: vendor payout'
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('persistedShape — purchase_finalization external shape is subset of allowlist', () => {
  it('all top-level keys are in the allowlist', () => {
    const ext = purchaseFinalization.external(poFixture);
    assertSubsetOfAllowlist(ext as unknown as Record<string, unknown>, poAllow.topLevel, '<root>');
  });
  it('header keys are in the allowlist', () => {
    const ext = purchaseFinalization.external(poFixture);
    assertSubsetOfAllowlist(ext.header as unknown as Record<string, unknown>, poAllow.header, 'header');
  });
  it('each line key is in the allowlist', () => {
    const ext = purchaseFinalization.external(poFixture);
    for (const l of ext.lines) {
      assertSubsetOfAllowlist(l as unknown as Record<string, unknown>, poAllow.line, 'lines[]');
    }
  });
  it('totals keys are in the allowlist', () => {
    const ext = purchaseFinalization.external(poFixture);
    assertSubsetOfAllowlist(ext.totals as unknown as Record<string, unknown>, poAllow.totals, 'totals');
  });
  it('does not carry __EXTERNAL_PROJECTED__', () => {
    const ext = purchaseFinalization.external(poFixture);
    expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
  });
  it('does not carry __INTERNAL_ONLY__', () => {
    const ext = purchaseFinalization.external(poFixture);
    expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
  });
  it('passes validateExternalShape without throwing', () => {
    const ext = purchaseFinalization.external(poFixture);
    expect(() => validateExternalShape(ext, 'purchase_finalization')).not.toThrow();
  });
});

describe('persistedShape — sales_confirmation external shape is subset of allowlist', () => {
  it('all top-level keys are in the allowlist', () => {
    const ext = salesConfirmation.external(soFixture);
    assertSubsetOfAllowlist(ext as unknown as Record<string, unknown>, soAllow.topLevel, '<root>');
  });
  it('each line key is in the allowlist', () => {
    const ext = salesConfirmation.external(soFixture);
    for (const l of ext.lines) {
      assertSubsetOfAllowlist(l as unknown as Record<string, unknown>, soAllow.line, 'lines[]');
    }
  });
  it('does not carry witness keys', () => {
    const ext = salesConfirmation.external(soFixture);
    expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
    expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
  });
  it('passes validateExternalShape without throwing', () => {
    const ext = salesConfirmation.external(soFixture);
    expect(() => validateExternalShape(ext, 'sales_confirmation')).not.toThrow();
  });
});

describe('persistedShape — invoice external shape is subset of allowlist', () => {
  it('all top-level keys are in the allowlist', () => {
    const ext = invoice.external(invFixture);
    assertSubsetOfAllowlist(ext as unknown as Record<string, unknown>, invAllow.topLevel, '<root>');
  });
  it('does not carry witness keys', () => {
    const ext = invoice.external(invFixture);
    expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
    expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
  });
  it('passes validateExternalShape without throwing', () => {
    const ext = invoice.external(invFixture);
    expect(() => validateExternalShape(ext, 'invoice')).not.toThrow();
  });
});

describe('persistedShape — payment_received external shape is subset of allowlist', () => {
  it('all top-level keys are in the allowlist', () => {
    const ext = paymentReceived.external(payFixture);
    assertSubsetOfAllowlist(ext as unknown as Record<string, unknown>, payAllow.topLevel, '<root>');
  });
  it('does not carry witness keys', () => {
    const ext = paymentReceived.external(payFixture);
    expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
    expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
  });
  it('passes validateExternalShape without throwing', () => {
    const ext = paymentReceived.external(payFixture);
    expect(() => validateExternalShape(ext, 'payment_received')).not.toThrow();
  });
});

describe('persistedShape — vendor_payout external shape is subset of allowlist', () => {
  it('all top-level keys are in the allowlist', () => {
    const ext = vendorPayout.external(payoutFixture);
    assertSubsetOfAllowlist(ext as unknown as Record<string, unknown>, payoutAllow.topLevel, '<root>');
  });
  it('does not carry witness keys', () => {
    const ext = vendorPayout.external(payoutFixture);
    expect(ext).not.toHaveProperty('__EXTERNAL_PROJECTED__');
    expect(ext).not.toHaveProperty('__INTERNAL_ONLY__');
  });
  it('passes validateExternalShape without throwing', () => {
    const ext = vendorPayout.external(payoutFixture);
    expect(() => validateExternalShape(ext, 'vendor_payout')).not.toThrow();
  });
});
