import { BELOW_FLOOR_REASONS, type BelowFloorReason } from '../../shared/saleLineCostExceptions';

// #64 PR-2: shared amber warning chip for projected below-range landed COGS
// exceptions (PR-1 captured them; PR-2 surfaces them). Used by:
//   - `OrderPricingPanel` — shows the chip beside each line's COGS range row.
//   - SalesView Customer Draft Lines grid — cell renderer for the `landedCostExceptionReason` column.
//
// The labels live here so PricingPanel's existing reason picker and the
// projected-state chip stay in lockstep. The chip itself reuses the existing
// `.selection-pill.warning` semantic class (amber border / amber/10 fill /
// amber text) so we are not introducing any new colors. See
// `src/client/styles.css` lines ~462-476 and `docs/design-system/INDEX.md`.

/** Full-form operator-vocabulary labels (used in dropdowns and tooltips). */
export const LANDED_COST_EXCEPTION_REASON_LABELS: Record<BelowFloorReason, string> = {
  keep_margin: 'Keep margin (vendor absorbs)',
  waive_margin: 'Waive margin (we absorb)',
  take_loss: 'Take loss (below cost, on purpose)',
  vendor_approval_pending: 'Vendor approval pending',
  renegotiate: 'Renegotiate with vendor (price TBD)'
};

/** Short-form labels for dense chips/cells. */
export const LANDED_COST_EXCEPTION_REASON_SHORT_LABELS: Record<BelowFloorReason, string> = {
  keep_margin: 'Keep margin',
  waive_margin: 'Waive margin',
  take_loss: 'Take loss',
  vendor_approval_pending: 'Vendor approval pending',
  renegotiate: 'Renegotiate'
};

interface LandedCostExceptionChipProps {
  /** Structured reason from the projection (`landedCostExceptionReason`). `null`/`undefined`/`''` renders nothing. */
  reason?: string | null;
  /** Optional operator note (`landedCostExceptionNote`); surfaces in the tooltip. */
  note?: string | null;
  /** Batch COGS range low at override time (`landedCostExceptionRangeLow`). */
  rangeLow?: number | null;
  /** Batch COGS range high at override time (`landedCostExceptionRangeHigh`). */
  rangeHigh?: number | null;
  testId?: string;
}

function shortLabel(reason: string): string {
  if (reason in LANDED_COST_EXCEPTION_REASON_SHORT_LABELS) {
    return LANDED_COST_EXCEPTION_REASON_SHORT_LABELS[reason as BelowFloorReason];
  }
  // Unknown reason (e.g. a future PR added a new reason but didn't update
  // labels here) — render the raw string so something shows.
  return reason;
}

function fullLabel(reason: string): string {
  if (reason in LANDED_COST_EXCEPTION_REASON_LABELS) {
    return LANDED_COST_EXCEPTION_REASON_LABELS[reason as BelowFloorReason];
  }
  return reason;
}

export function LandedCostExceptionChip({
  reason,
  note,
  rangeLow,
  rangeHigh,
  testId
}: LandedCostExceptionChipProps) {
  if (!reason) return null;
  const short = shortLabel(reason);
  const full = fullLabel(reason);
  const rangeSuffix =
    typeof rangeLow === 'number' && typeof rangeHigh === 'number'
      ? ` · below $${rangeLow}-$${rangeHigh}`
      : '';
  const titleParts: string[] = [full];
  if (note && note.trim() !== '') titleParts.push(note);
  const title = titleParts.join(' — ') + rangeSuffix;
  const ariaLabel = `Below-range COGS exception: ${full}${rangeSuffix}`;

  return (
    <span
      className="selection-pill warning"
      role="img"
      aria-label={ariaLabel}
      title={title}
      data-testid={testId}
    >
      <span aria-hidden="true">⚠</span> {short}
    </span>
  );
}

// Phase 3A: LandedCostExceptionCellRenderer is now canonicalized at
// src/client/components/cells/sales/LandedCostExceptionCell.tsx as
// LandedCostExceptionCell. This re-export preserves the import path for
// existing consumers (e.g., LandedCostExceptionChip.test.tsx).
export { LandedCostExceptionCell as LandedCostExceptionCellRenderer } from './cells/sales/LandedCostExceptionCell';

// Re-export so callers can guard the BELOW_FLOOR_REASONS list from one import.
export { BELOW_FLOOR_REASONS };
