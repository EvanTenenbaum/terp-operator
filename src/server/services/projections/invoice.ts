// Issue #113 Phase 1 — Invoice projector.
//
// Built on top of sales-confirmation data plus invoice number and due
// date. Per plan Task 8 Step 3: "Invoice can follow sales shape with
// invoice number/due date in header/footer." invoice number lands in
// header.documentNo; due date lands in footer.reference (a plain ISO
// string).
//
// Same external/internal split rules as sales-confirmation:
//   • External strips line-level internalMargin, unitCost,
//     unitCostResolved, sourceRowKey, legacyMarker, candidateSourceText.
//   • External strips top-level internalNotes.
//   • Internal adds internalNotes, cogs, margin, diagnostics.

import type { InvoiceInput, Projector } from './types';

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

function buildFooter(input: InvoiceInput): { terms?: string; reference?: string } {
  return {
    ...(input.dueDateISO != null ? { reference: input.dueDateISO } : {}),
    ...(input.externalNotes != null ? { terms: input.externalNotes } : {}),
  };
}

export const invoice: Projector<InvoiceInput> = {
  projectionVersion,
  external(input) {
    return {
      kind: 'invoice',
      header: {
        title: 'Invoice',
        counterparty: input.customerName,
        dateISO: input.dateISO,
        documentNo: input.invoiceNo,
      },
      lines: input.lines.map((l) => ({
        name: l.productName,
        qty: l.qty,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
        notes: l.externalNotes,
      })),
      totals: { subtotal: input.subtotal, total: input.total },
      footer: buildFooter(input),
      projectionVersion,
    };
  },
  internal(input) {
    const cogsLines = input.lines
      .filter((l) => l.unitCost !== undefined)
      .map((l) => ({
        name: l.productName,
        unitCost: l.unitCost,
      }));
    const cogsTotal = input.lines.reduce(
      (acc, l) => acc + (l.unitCost !== undefined ? l.unitCost * l.qty : 0),
      0,
    );

    const marginLines = input.lines
      .filter((l) => l.internalMargin !== undefined)
      .map((l) => ({
        name: l.productName,
        marginAbs: l.internalMargin!,
        marginPct:
          l.subtotal && l.subtotal !== 0
            ? (l.internalMargin! / l.subtotal) * 100
            : 0,
      }));
    const marginTotal = marginLines.reduce((acc, m) => acc + m.marginAbs, 0);

    const unresolvedSources: string[] = [];
    const legacyMarkers: string[] = [];
    for (const l of input.lines) {
      const hasIdentifier = l.sourceRowKey || l.candidateSourceText;
      if (l.unitCostResolved === false || hasIdentifier) {
        if (l.sourceRowKey) unresolvedSources.push(l.sourceRowKey);
        if (l.candidateSourceText) unresolvedSources.push(l.candidateSourceText);
        if (l.unitCostResolved === false && !hasIdentifier) {
          // No identifier available; push a fallback so the operator
          // knows cost lookup failed for this line even without a source key.
          unresolvedSources.push(`${l.productName}:unresolved`);
        }
      }
      if (l.legacyMarker) legacyMarkers.push(l.legacyMarker);
    }
    const hasDiagnostics =
      unresolvedSources.length > 0 || legacyMarkers.length > 0;

    return {
      kind: 'invoice',
      header: {
        title: 'Invoice',
        counterparty: input.customerName,
        dateISO: input.dateISO,
        documentNo: input.invoiceNo,
      },
      lines: input.lines.map((l) => {
        const line: { name: string; qty: number; unitPrice?: number; subtotal: number; notes?: string } = {
          name: l.productName,
          qty: l.qty,
          unitPrice: l.unitPrice,
          subtotal: l.subtotal,
        };
        // Omit `notes` entirely when absent — canonicalizeJson rejects undefined.
        if (l.externalNotes != null) line.notes = l.externalNotes;
        return line;
      }),
      totals: { subtotal: input.subtotal, total: input.total },
      footer: buildFooter(input),
      projectionVersion,
      // Omit `internalNotes` entirely when absent — canonicalizeJson rejects undefined.
      ...(input.internalNotes != null ? { internalNotes: input.internalNotes } : {}),
      ...(cogsLines.length > 0 ? { cogs: { perLine: cogsLines, total: cogsTotal } } : {}),
      ...(marginLines.length > 0 ? { margin: { perLine: marginLines, total: marginTotal } } : {}),
      ...(hasDiagnostics
        ? {
            diagnostics: {
              // Omit sub-keys when absent — canonicalizeJson rejects undefined.
              ...(unresolvedSources.length > 0 ? { unresolvedSources } : {}),
              ...(legacyMarkers.length > 0 ? { legacyMarkers } : {}),
            },
          }
        : {}),
    };
  },
};
