// Issue #113 Phase 1 — Payment-received stub projector.
//
// Phase 1 only declares this kind and emits a minimal explicit shape so
// it passes the same allowlist + leak invariants as the full kinds. The
// real field list pins in Phase 4 (spec §11 Q7, plan Task 8 Step 3).
//
// Minimal external shape (per plan Task 8 Step 3):
//   {
//     kind: 'payment_received',
//     header: { title, counterparty, dateISO, documentNo },
//     lines: [],                                  // intentionally empty
//     totals: { subtotal: amount, total: amount },
//     projectionVersion
//   }
//
// Internal adds only:
//   internalNotes: input.internalReconciliationNotes
//
// The empty `lines` array is intentional and pins Phase 1 behavior;
// Phase 4 will replace it with the real allocation breakdown.

import type { PaymentReceivedInput, Projector } from './types';

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

export const paymentReceived: Projector<PaymentReceivedInput> = {
  projectionVersion,
  external(input) {
    return {
      kind: 'payment_received',
      header: {
        title: 'Payment Received',
        counterparty: input.customerName,
        dateISO: input.dateISO,
        documentNo: input.paymentRef,
      },
      lines: [],
      totals: { subtotal: input.amount, total: input.amount },
      projectionVersion,
    };
  },
  internal(input) {
    return {
      kind: 'payment_received',
      header: {
        title: 'Payment Received',
        counterparty: input.customerName,
        dateISO: input.dateISO,
        documentNo: input.paymentRef,
      },
      lines: [],
      totals: { subtotal: input.amount, total: input.amount },
      projectionVersion,
      ...(input.internalReconciliationNotes != null ? { internalNotes: input.internalReconciliationNotes } : {}),
    };
  },
};
