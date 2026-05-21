// #64 PR-2: server-side projection of a `setLineLandedCost` command journal
// `result.delta` onto `salesOrderLines` query rows.
//
// PR-1 records below-range COGS overrides in the command journal delta:
//   journal.result = {
//     delta: {
//       lineId, landedCost, basis,
//       exceptionReason?: 'keep_margin' | 'waive_margin' | 'take_loss' | 'vendor_approval_pending' | 'renegotiate',
//       exceptionNote?: string,
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
  /** Snake_case reason from PR-1 (keep_margin, waive_margin, take_loss, vendor_approval_pending, renegotiate), or null when no projected exception exists. */
  landedCostExceptionReason: string | null;
  /** Free-form note captured at override time, or null. */
  landedCostExceptionNote: string | null;
  /** True only when the journal explicitly recorded a below-range exception. */
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
 * Reads from the delta format written by the current commandBus.ts:
 *   result.delta.exceptionReason (snake_case BelowFloorReason)
 *   result.delta.exceptionNote   (optional string)
 *
 * Defensive on every level so a downstream consumer never has to
 * second-guess the shape.
 */
export function projectLandedCostException(
  journalResult: unknown
): LandedCostExceptionProjection {
  if (!isRecord(journalResult)) return { ...EMPTY };
  const delta = journalResult.delta;
  if (!isRecord(delta)) return { ...EMPTY };

  const reason = typeof delta.exceptionReason === 'string' ? delta.exceptionReason : null;
  if (!reason) return { ...EMPTY };

  const note = typeof delta.exceptionNote === 'string' ? delta.exceptionNote : null;

  // When exceptionReason is present it means a below-range override was recorded.
  const belowRange = true;

  // priceRange is not stored in the flat delta format — we don't have low/high
  // from the journal at this projection level (the below-floor state lives in
  // the sales_order_lines columns priceFloor / price_range). Return null for
  // range bounds; the chip renders them as absent gracefully.
  const low: number | null = null;
  const high: number | null = null;

  return {
    landedCostExceptionReason: reason,
    landedCostExceptionNote: note,
    landedCostBelowRange: belowRange,
    landedCostExceptionRangeLow: low,
    landedCostExceptionRangeHigh: high
  };
}
