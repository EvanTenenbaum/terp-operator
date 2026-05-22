// Issue #113 Phase 1 — Sales-confirmation projector.
//
// External MUST strip the following internal-only line-level keys
// (spec §9.4 / plan Task 8 Step 3):
//   • internalMargin
//   • unitCost
//   • unitCostResolved
//   • sourceRowKey
//   • legacyMarker
//   • candidateSourceText
//
// External MUST also strip the PO-style top-level internalNotes. The
// input shape is the same SalesConfirmationInput which carries those
// internal fields; the external function intentionally does not read
// them. The salesConfirmation.test.ts leak fixture (Task 9) re-verifies
// the strip list at runtime.
//
// Internal audience adds:
//   • top-level internalNotes
//   • cogs derived from line.unitCost (× qty for the total)
//   • margin derived from line.internalMargin
//   • diagnostics aggregating sourceRowKey / candidateSourceText
//     (unresolved sources) and legacyMarker (legacy markers)

import type { Projector, SalesConfirmationInput } from './types';

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

export const salesConfirmation: Projector<SalesConfirmationInput> = {
  projectionVersion,
  external(input) {
    return {
      kind: 'sales_confirmation',
      header: {
        title: 'Sales Confirmation',
        counterparty: input.customerName,
        dateISO: input.dateISO,
        documentNo: input.soNo,
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
      // Omit `footer` entirely when there are no external notes.
      ...(input.externalNotes != null ? { footer: { terms: input.externalNotes } } : {}),
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
      kind: 'sales_confirmation',
      header: {
        title: 'Sales Confirmation',
        counterparty: input.customerName,
        dateISO: input.dateISO,
        documentNo: input.soNo,
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
      // Omit `footer` entirely when there are no external notes.
      ...(input.externalNotes != null ? { footer: { terms: input.externalNotes } } : {}),
      projectionVersion,
      // Omit `internalNotes` entirely when absent — canonicalizeJson rejects undefined.
      ...(input.internalNotes != null ? { internalNotes: input.internalNotes } : {}),
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
            // Omit sub-keys when absent — canonicalizeJson rejects undefined.
            ...(unresolvedSources.length > 0 ? { unresolvedSources } : {}),
            ...(legacyMarkers.length > 0 ? { legacyMarkers } : {}),
          }
        : undefined,
    };
  },
};
