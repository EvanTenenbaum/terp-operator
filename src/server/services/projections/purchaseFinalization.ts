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
      lines: input.lines.map((l) => {
        const line: Record<string, unknown> = {
          name: l.productName,
          qty: l.qty,
          unitPrice: l.unitPrice,
          subtotal: l.subtotal,
        };
        // Omit `notes` entirely when there are no external notes — canonicalizeJson
        // rejects undefined values (RFC 8785 subset; undefined is not representable).
        if (l.externalNotes != null) line.notes = l.externalNotes;
        return line as { name: string; qty: number; unitPrice?: number; subtotal: number; notes?: string };
      }),
      totals: { subtotal: input.subtotal, total: input.total },
      // Omit `footer` entirely when there are no external notes.
      ...(input.externalNotes != null ? { footer: { terms: input.externalNotes } } : {}),
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
      lines: input.lines.map((l) => {
        // Internal lines surface the operator-facing notes when present;
        // fall back to the external notes so the line is still labeled.
        // Omit `notes` entirely when absent — canonicalizeJson rejects undefined.
        const notes = l.internalNotes ?? l.externalNotes;
        const line: Record<string, unknown> = {
          name: l.productName,
          qty: l.qty,
          unitPrice: l.unitPrice,
          subtotal: l.subtotal,
        };
        if (notes != null) line.notes = notes;
        return line as { name: string; qty: number; unitPrice?: number; subtotal: number; notes?: string };
      }),
      totals: { subtotal: input.subtotal, total: input.total },
      // Omit `footer` entirely when absent.
      ...(input.externalNotes != null ? { footer: { terms: input.externalNotes } } : {}),
      projectionVersion,
      // Omit optional top-level fields when absent — canonicalizeJson rejects undefined.
      ...(input.internalNotes != null ? { internalNotes: input.internalNotes } : {}),
      ...(cogsLines.length > 0 ? { cogs: { perLine: cogsLines, total: cogsTotal } } : {}),
      ...(marginLines.length > 0 ? { margin: { perLine: marginLines, total: marginTotal } } : {}),
      ...(hasDiagnostics
        ? {
            diagnostics: {
              ...(unresolvedSources.length > 0 ? { unresolvedSources } : {}),
              ...(legacyMarkers.length > 0 ? { legacyMarkers } : {}),
            },
          }
        : {}),
    };
  },
};
