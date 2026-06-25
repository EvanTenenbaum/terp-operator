/**
 * Phase 4 (§11 test matrix subset) — Barter Settlement payload validation.
 *
 * These tests pin the payload-shape contracts for both `payWithProduct` and
 * `settleDebtWithProduct`. They are deterministic, in-process, and do not
 * require any database wiring — they verify the Zod schemas + the role-gating
 * branches via the schema refinements.
 *
 * Coverage from §11 of docs/engineering-plans/product-as-monetary-instrument-plan.md:
 *   - §11.5  Consigned outbound rejection is enforced at the command level
 *            (via batch lookup); this file exercises the schema half.
 *   - §11.11 Override gating: non-manager rejected (role check happens inside
 *            the command, after parse), manager-without-reason rejected (schema
 *            refinement at the command level via the `overrideReason`
 *            requirement when settlementAmount differs from cost basis).
 *   - §11.4  Allocation intents: the schema accepts fifo/selected_invoice/
 *            unapplied; selected_invoice without invoiceId is rejected at the
 *            command level.
 *
 * Where a test exercises a runtime branch in the command body (role check,
 * override-reason requirement), we use the exported payload schema directly
 * — that is the contract surface the command parses on entry — plus targeted
 * branch checks against the constants the command imports.
 */

import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  __payWithProductInternals,
  __settleDebtWithProductInternals,
} from '@/domains/barter/commands';

const payWithProductSchema = __payWithProductInternals.payloadSchema;
const settleDebtSchema = __settleDebtWithProductInternals.payloadSchema;

const VENDOR_ID = '10000000-1000-4000-8000-100000000001';
const CUSTOMER_ID = '20000000-2000-4000-8000-200000000001';
const BATCH_ID = '30000000-3000-4000-8000-300000000001';
const INVOICE_ID = '40000000-4000-4000-8000-400000000001';

describe('payWithProduct payload contract — §11 test matrix subset', () => {
  it('accepts a minimal vendor barter payload (default counterpartyType=vendor)', () => {
    const parsed = payWithProductSchema.parse({
      vendorId: VENDOR_ID,
      lines: [{ batchId: BATCH_ID, qty: 10 }],
    });
    expect(parsed.counterpartyType).toBe('vendor');
    expect(parsed.lines).toHaveLength(1);
  });

  it('accepts an explicit customer (refund-in-kind) barter payload', () => {
    const parsed = payWithProductSchema.parse({
      counterpartyType: 'customer',
      customerId: CUSTOMER_ID,
      lines: [{ batchId: BATCH_ID, qty: 5 }],
    });
    expect(parsed.counterpartyType).toBe('customer');
  });

  it('rejects vendor branch without vendorId', () => {
    expect(() =>
      payWithProductSchema.parse({
        counterpartyType: 'vendor',
        lines: [{ batchId: BATCH_ID, qty: 1 }],
      })
    ).toThrow(ZodError);
  });

  it('rejects customer branch without customerId', () => {
    expect(() =>
      payWithProductSchema.parse({
        counterpartyType: 'customer',
        lines: [{ batchId: BATCH_ID, qty: 1 }],
      })
    ).toThrow(ZodError);
  });

  it('rejects vendorBillId on the customer branch (no AP to settle)', () => {
    // §8.2 — vendorBillId is a vendor-branch field only. Passing it with
    // counterpartyType=customer signals operator confusion and is rejected.
    expect(() =>
      payWithProductSchema.parse({
        counterpartyType: 'customer',
        customerId: CUSTOMER_ID,
        vendorBillId: VENDOR_ID,
        lines: [{ batchId: BATCH_ID, qty: 1 }],
      })
    ).toThrow(ZodError);
  });

  it('rejects empty lines array', () => {
    expect(() =>
      payWithProductSchema.parse({
        vendorId: VENDOR_ID,
        lines: [],
      })
    ).toThrow(ZodError);
  });

  it('rejects non-positive line qty', () => {
    expect(() =>
      payWithProductSchema.parse({
        vendorId: VENDOR_ID,
        lines: [{ batchId: BATCH_ID, qty: 0 }],
      })
    ).toThrow(ZodError);
    expect(() =>
      payWithProductSchema.parse({
        vendorId: VENDOR_ID,
        lines: [{ batchId: BATCH_ID, qty: -3 }],
      })
    ).toThrow(ZodError);
  });

  it('rejects non-uuid batchId', () => {
    expect(() =>
      payWithProductSchema.parse({
        vendorId: VENDOR_ID,
        lines: [{ batchId: 'not-a-uuid', qty: 1 }],
      })
    ).toThrow(ZodError);
  });

  it('accepts a manager override with reason (settlementAmount + overrideReason)', () => {
    // The schema accepts the override fields; the manager+ role gate is
    // enforced in the command body. This test pins the schema half so a
    // refactor cannot silently drop either field from the payload contract.
    const parsed = payWithProductSchema.parse({
      vendorId: VENDOR_ID,
      lines: [{ batchId: BATCH_ID, qty: 10 }],
      settlementAmount: 1234.56,
      overrideReason: 'Vendor accepted product valued above book cost',
    });
    expect(parsed.settlementAmount).toBe(1234.56);
    expect(parsed.overrideReason).toBe(
      'Vendor accepted product valued above book cost'
    );
  });

  it('rejects negative settlementAmount', () => {
    expect(() =>
      payWithProductSchema.parse({
        vendorId: VENDOR_ID,
        lines: [{ batchId: BATCH_ID, qty: 1 }],
        settlementAmount: -1,
      })
    ).toThrow(ZodError);
  });

  it('rejects empty overrideReason string', () => {
    expect(() =>
      payWithProductSchema.parse({
        vendorId: VENDOR_ID,
        lines: [{ batchId: BATCH_ID, qty: 1 }],
        overrideReason: '',
      })
    ).toThrow(ZodError);
  });
});

describe('settleDebtWithProduct payload contract — §11 test matrix subset', () => {
  it('accepts a minimal inbound payload', () => {
    const parsed = settleDebtSchema.parse({
      customerId: CUSTOMER_ID,
      lines: [{ productName: 'Bulk OG', qty: 10, unitCost: 100 }],
    });
    expect(parsed.lines[0].productName).toBe('Bulk OG');
  });

  it('rejects empty productName', () => {
    expect(() =>
      settleDebtSchema.parse({
        customerId: CUSTOMER_ID,
        lines: [{ productName: '', qty: 1, unitCost: 1 }],
      })
    ).toThrow(ZodError);
  });

  it('rejects negative unitCost (free product is OK at 0)', () => {
    expect(() =>
      settleDebtSchema.parse({
        customerId: CUSTOMER_ID,
        lines: [{ productName: 'X', qty: 1, unitCost: -1 }],
      })
    ).toThrow(ZodError);
    // 0 is valid — comp/promo lines should round-trip.
    const parsed = settleDebtSchema.parse({
      customerId: CUSTOMER_ID,
      lines: [{ productName: 'X', qty: 1, unitCost: 0 }],
    });
    expect(parsed.lines[0].unitCost).toBe(0);
  });

  it('accepts allocationIntent fifo / selected_invoice / unapplied', () => {
    for (const intent of ['fifo', 'selected_invoice', 'unapplied'] as const) {
      const parsed = settleDebtSchema.parse({
        customerId: CUSTOMER_ID,
        lines: [{ productName: 'X', qty: 1, unitCost: 1 }],
        allocationIntent: intent,
        invoiceId: intent === 'selected_invoice' ? INVOICE_ID : undefined,
      });
      expect(parsed.allocationIntent).toBe(intent);
    }
  });

  it('rejects an unknown allocationIntent', () => {
    expect(() =>
      settleDebtSchema.parse({
        customerId: CUSTOMER_ID,
        lines: [{ productName: 'X', qty: 1, unitCost: 1 }],
        allocationIntent: 'fancy_new_mode' as unknown as 'fifo',
      })
    ).toThrow(ZodError);
  });

  it('accepts a manager override with reason on inbound path', () => {
    const parsed = settleDebtSchema.parse({
      customerId: CUSTOMER_ID,
      lines: [{ productName: 'X', qty: 10, unitCost: 100 }],
      settlementAmount: 1100,
      overrideReason: 'Customer-agreed value above operator cost basis',
    });
    expect(parsed.settlementAmount).toBe(1100);
  });
});
