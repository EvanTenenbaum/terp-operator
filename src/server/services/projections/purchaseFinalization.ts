// Issue #113 Phase 1 — Purchase finalization projector.
//
// External audience reads ONLY:
//   • header fields derived from public PO/vendor info (vendor name, PO no, date)
//   • line public fields (product name, qty, unit price, subtotal, externalNotes)
//   • totals
//   • PO-level externalNotes routed into footer.terms
//
// Internal audience adds operator-only context:
//   • PO-level internalNotes
//   • landed cost per line → cogs
//   • margin per line → margin
//   • diagnostics per line → unresolvedSources / legacyMarkers (merged)
//
// The external function's parameter type is the same PurchaseFinalizationInput
// (which DOES carry internal fields) — but the body must never read those.
// This file is the single source of truth that the leak fixture in
// purchaseFinalization.test.ts (Task 9) re-verifies at runtime.
//
// The persisted shape never carries the type-level witness keys
// __EXTERNAL_PROJECTED__ / __INTERNAL_ONLY__ — those are re-applied in
// memory by the service loader after validateExternalShape /
// validateInternalShape pass (see Task 7 / index.ts).

import type { Projector, PurchaseFinalizationInput } from './types';

export const projectionVersion = 1;

export const externalAllowlist = {
  topLevel: ['kind', 'header', 'lines', 'totals', 'footer', 'projectionVersion'],
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
    'footer',
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

export const purchaseFinalization: Projector<PurchaseFinalizationInput> = {
  projectionVersion,
  external(input) {
    return {
      kind: 'purchase_finalization',
      header: {
        title: 'Purchase Order',
        counterparty: input.vendorName,
        dateISO: input.dateISO,
        documentNo: input.poNo,
      },
      lines: input.lines.map((l) => ({
        name: l.productName,
        qty: l.qty,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
        notes: l.externalNotes,
      })),
      totals: { subtotal: input.subtotal, total: input.total },
      footer: input.externalNotes ? { terms: input.externalNotes } : undefined,
      projectionVersion,
    };
  },
  internal(input) {
    const cogsLines = input.lines
      .filter((l) => l.landedCost !== undefined)
      .map((l) => ({
        name: l.productName,
        landedCost: l.landedCost,
      }));
    const cogsTotal = input.lines.reduce(
      (acc, l) => acc + (l.landedCost !== undefined ? l.landedCost * l.qty : 0),
      0,
    );

    const marginLines = input.lines
      .filter((l) => l.margin !== undefined)
      .map((l) => ({
        name: l.productName,
        marginAbs: l.margin!.abs,
        marginPct: l.margin!.pct,
      }));
    const marginTotal = marginLines.reduce((acc, m) => acc + m.marginAbs, 0);

    const unresolvedSources: string[] = [];
    const legacyMarkers: string[] = [];
    for (const l of input.lines) {
      if (l.diagnostics?.unresolvedSources) {
        unresolvedSources.push(...l.diagnostics.unresolvedSources);
      }
      if (l.diagnostics?.legacyMarkers) {
        legacyMarkers.push(...l.diagnostics.legacyMarkers);
      }
    }
    const hasDiagnostics =
      unresolvedSources.length > 0 || legacyMarkers.length > 0;

    return {
      kind: 'purchase_finalization',
      header: {
        title: 'Purchase Order',
        counterparty: input.vendorName,
        dateISO: input.dateISO,
        documentNo: input.poNo,
      },
      lines: input.lines.map((l) => ({
        name: l.productName,
        qty: l.qty,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
        // Internal lines surface the operator-facing notes when present;
        // fall back to the external notes so the line is still labeled.
        notes: l.internalNotes ?? l.externalNotes,
      })),
      totals: { subtotal: input.subtotal, total: input.total },
      footer: input.externalNotes ? { terms: input.externalNotes } : undefined,
      projectionVersion,
      internalNotes: input.internalNotes,
      cogs:
        cogsLines.length > 0
          ? { perLine: cogsLines, total: cogsTotal }
          : undefined,
      margin:
        marginLines.length > 0
          ? { perLine: marginLines, total: marginTotal }
          : undefined,
      diagnostics: hasDiagnostics
        ? {
            unresolvedSources:
              unresolvedSources.length > 0 ? unresolvedSources : undefined,
            legacyMarkers: legacyMarkers.length > 0 ? legacyMarkers : undefined,
          }
        : undefined,
    };
  },
};
