// Issue #113 Phase 1 — Vendor-payout stub projector.
//
// Mirrors paymentReceived: Phase 1 declares the kind and emits a minimal
// explicit shape so it passes the same allowlist + leak invariants as
// the full kinds. Real field list pins in Phase 4 (spec §11 Q7,
// plan Task 8 Step 3).
//
// Minimal external shape (per plan Task 8 Step 3):
//   {
//     kind: 'vendor_payout',
//     header: { title, counterparty, dateISO, documentNo },
//     lines: [],                                  // intentionally empty
//     totals: { subtotal: amount, total: amount },
//     projectionVersion
//   }
//
// Internal adds only:
//   internalNotes: input.internalReconciliationNotes

import type { Projector, VendorPayoutInput } from './types';

export const projectionVersion = 1;

export const externalAllowlist = {
  topLevel: ['kind', 'header', 'lines', 'totals', 'projectionVersion'],
  header: ['title', 'counterparty', 'dateISO', 'documentNo'],
  line: ['name', 'qty', 'unitPrice', 'subtotal', 'notes'],
  totals: ['subtotal', 'adjustments', 'total'],
  footer: ['terms', 'reference'],
} as const;

export const internalAllowlist = {
  topLevel: [
    'kind',
    'header',
    'lines',
    'totals',
    'projectionVersion',
    'internalNotes',
    'cogs',
    'margin',
    'diagnostics',
  ],
  header: ['title', 'counterparty', 'dateISO', 'documentNo'],
  line: ['name', 'qty', 'unitPrice', 'subtotal', 'notes'],
  totals: ['subtotal', 'adjustments', 'total'],
  footer: ['terms', 'reference'],
  cogs: ['perLine', 'total'],
  cogsLine: ['name', 'unitCost', 'landedCost'],
  margin: ['perLine', 'total'],
  marginLine: ['name', 'marginAbs', 'marginPct'],
  diagnostics: ['unresolvedSources', 'legacyMarkers'],
} as const;

export const vendorPayout: Projector<VendorPayoutInput> = {
  projectionVersion,
  external(input) {
    return {
      kind: 'vendor_payout',
      header: {
        title: 'Vendor Payout',
        counterparty: input.vendorName,
        dateISO: input.dateISO,
        documentNo: input.payoutRef,
      },
      lines: [],
      totals: { subtotal: input.amount, total: input.amount },
      projectionVersion,
    };
  },
  internal(input) {
    return {
      kind: 'vendor_payout',
      header: {
        title: 'Vendor Payout',
        counterparty: input.vendorName,
        dateISO: input.dateISO,
        documentNo: input.payoutRef,
      },
      lines: [],
      totals: { subtotal: input.amount, total: input.amount },
      projectionVersion,
      internalNotes: input.internalReconciliationNotes,
    };
  },
};
