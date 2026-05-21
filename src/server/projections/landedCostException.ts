// #64 PR-2: server-side projection of a `setLineLandedCost` command journal
// `result.delta.exception` onto `salesOrderLines` query rows.
//
// PR-1 records below-range COGS overrides as a structured exception in the
// command journal:
//   journal.result = {
//     delta: {
//       lineId, landedCost, basis,
//       exception?: {
//         reason: 'keep-margin' | 'waive-margin' | 'take-loss' | 'vendor-approval-pending',
//         note?: string,
//         belowRange: true,
//         priceRange: { low: number, high: number }
//       }
//     }
//   }
//
// PR-2 surfaces that metadata back to the operator UI without adding any
// columns to `sales_order_lines`. The `salesOrderLines` tRPC query LEFT JOINs
// LATERAL the latest successful `setLineLandedCost` journal row for each
// line (matched via the `command_journal_affected_ids_gin` index from
// migration 0043) and feeds the raw `result` JSONB into this helper, which
// inflates flat per-row exception fields the client can render directly.
//
// The helper is intentionally pure so we can pin the projection contract in
// a fast unit test without a Postgres harness.

export interface LandedCostExceptionProjection {
  /** Operator-vocabulary reason from PR-1 (keep-margin, waive-margin, take-loss, vendor-approval-pending), or null when no projected exception exists. */
  landedCostExceptionReason: string | null;
  /** Free-form note captured at override time, or null. */
  landedCostExceptionNote: string | null;
  /** True only when the journal explicitly recorded `belowRange: true`. */
  landedCostBelowRange: boolean;
  /** Batch COGS range low end at the time of override, or null. */
  landedCostExceptionRangeLow: number | null;
  /** Batch COGS range high end at the time of override, or null. */
  landedCostExceptionRangeHigh: number | null;
}

const EMPTY: LandedCostExceptionProjection = {
  landedCostExceptionReason: null,
  landedCostExceptionNote: null,
  landedCostBelowRange: false,
  landedCostExceptionRangeLow: null,
  landedCostExceptionRangeHigh: null
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Tolerate JSONB → string round-trips where a numeric was stored as a
  // string (e.g. `"50"`). Anything that doesn't parse cleanly is null.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Project a `command_journal.result` JSONB shape into flat per-row exception
 * fields. Returns the empty projection for any malformed/missing input.
 *
 * Defensive on every level (no exception field; non-string reason; non-true
 * belowRange; missing priceRange) so a downstream consumer never has to
 * second-guess the shape.
 */
export function projectLandedCostException(
  journalResult: unknown
): LandedCostExceptionProjection {
  if (!isRecord(journalResult)) return { ...EMPTY };
  const delta = journalResult.delta;
  if (!isRecord(delta)) return { ...EMPTY };
  const exception = (delta as Record<string, unknown>).exception;
  if (!isRecord(exception)) return { ...EMPTY };

  const reason = typeof exception.reason === 'string' ? exception.reason : null;
  if (!reason) return { ...EMPTY };

  const note = typeof exception.note === 'string' ? exception.note : null;
  // `belowRange` is strictly `true` in PR-1. Anything else (missing, false,
  // truthy non-boolean) projects as false so the UI doesn't accidentally
  // warn on data drift.
  const belowRange = exception.belowRange === true;

  const priceRange = isRecord(exception.priceRange) ? exception.priceRange : null;
  const low = priceRange ? coerceFiniteNumber(priceRange.low) : null;
  const high = priceRange ? coerceFiniteNumber(priceRange.high) : null;

  return {
    landedCostExceptionReason: reason,
    landedCostExceptionNote: note,
    landedCostBelowRange: belowRange,
    landedCostExceptionRangeLow: low,
    landedCostExceptionRangeHigh: high
  };
}
