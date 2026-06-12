/**
 * UX-H07 — Shared hover-tooltip legend map for legacy_marker and
 * ownershipStatus shorthand cells.
 *
 * Distinguishes confirmed (hard data from the command) versus inferred
 * (legacy import / manual entry — the system infers meaning from the symbol).
 *
 * Consumed by:
 *  - IntakeView.tsx  — batch-level legacyMarker / ownershipStatus columns
 *  - OperationsViews / operations/shared.tsx — inventory legacyMarker column
 *  - InventoryFinderPanel.tsx — result-row marker chip
 */

export type MarkerKind = 'ownership' | 'legacy';
export type ConfidenceLevel = 'confirmed' | 'inferred';

export interface MarkerEntry {
  /** Display label shown in the tooltip header. */
  label: string;
  /** 'confirmed' = command-level truth; 'inferred' = legacy import guess. */
  confidence: ConfidenceLevel;
  /** Human-readable description of what this marker means. */
  description: string;
}

/**
 * Lookup map for ownership status codes.  Keys are the raw ownershipStatus
 * values that appear in the grid / batch rows.
 */
export const OWNERSHIP_LEGEND: Readonly<Record<string, MarkerEntry>> = {
  OWN: {
    label: 'Owned',
    confidence: 'confirmed',
    description: 'Product is owned outright by the operator.',
  },
  OFC: {
    label: 'Office / Operator-owned',
    confidence: 'confirmed',
    description: 'Operator-owned stock held in the office (OFC bucket).',
  },
  CONSIGNMENT: {
    label: 'Consignment',
    confidence: 'confirmed',
    description: 'Product is on consignment — vendor retains ownership until sold.',
  },
  UNKNOWN: {
    label: 'Ownership unknown',
    confidence: 'inferred',
    description: 'Ownership not yet classified. Review and update before posting.',
  },
};

/**
 * Lookup map for legacy_marker shorthand symbols.  Keys are the raw marker
 * values exactly as stored (case-sensitive for known values; lowercase fallback
 * used at lookup time for robustness).
 */
export const LEGACY_MARKER_LEGEND: Readonly<Record<string, MarkerEntry>> = {
  C: {
    label: 'C — Consignment (inferred)',
    confidence: 'inferred',
    description:
      'Legacy: consignment — inferred from the "C" marker on import. ' +
      'Verify against PO terms before final posting.',
  },
  O: {
    label: 'O — Owned (inferred)',
    confidence: 'inferred',
    description:
      'Legacy: owned — inferred from the "O" marker on import. ' +
      'Confirm ownership via the PO or vendor agreement.',
  },
  F: {
    label: 'F — Flex / Partial-consignment (inferred)',
    confidence: 'inferred',
    description:
      'Legacy: "flex" arrangement — ownership terms are split or negotiated. ' +
      'Treat as consignment until confirmed.',
  },
  OFC: {
    label: 'OFC — Office stock (inferred)',
    confidence: 'inferred',
    description:
      'Legacy: office-held product — operator stock stored in-house. ' +
      'Maps to OFC ownership on import.',
  },
};

/**
 * Build a tooltip string for a legacy_marker or ownershipStatus cell value.
 * Returns undefined when the value is blank or unknown (no tooltip shown).
 *
 * @param value - the raw cell value (e.g. "C", "OWN", "CONSIGNMENT")
 * @param kind  - 'legacy' for legacy_marker; 'ownership' for ownershipStatus
 */
export function markerTooltip(
  value: string | null | undefined,
  kind: MarkerKind
): string | undefined {
  if (!value) return undefined;
  const key = value.trim();
  const map = kind === 'legacy' ? LEGACY_MARKER_LEGEND : OWNERSHIP_LEGEND;
  const upperKey = key.toUpperCase();
  const entry = map[key] ?? map[upperKey];
  if (!entry) return undefined;
  const tag = entry.confidence === 'confirmed' ? '[Confirmed]' : '[Inferred — verify]';
  return `${entry.label} ${tag}\n${entry.description}`;
}
