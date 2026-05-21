/**
 * Issue #64: sale-time cost-range exceptions, below-floor reasons, and
 * vendor-approval propagation.
 *
 * These helpers are pure and DB-free so they can drive:
 *   - the setLineLandedCost / setLineBelowFloorReason / resolveVendorApproval
 *     command handlers in src/server/services/commandBus.ts,
 *   - the confirm/post gates on sales orders, and
 *   - any future client-side previews.
 *
 * Architectural notes:
 *
 * - "COGS resolution" (does the operator need to pick landed cost within a
 *   batch range?) is separate from the "below-floor reason flow" (did we
 *   sell beneath the agreed floor and why?). Mixing them produced confusing
 *   errors in the older feat/cogs-range-resolution branch.
 *
 * - waive_margin / take_loss compute order totals and a command-journal
 *   delta at post; we deliberately do NOT touch vendor bills here — vendor
 *   reconciliation stays driven by the existing ticketCost / unitCost path.
 */

export const LANDED_COST_BASIS_VALUES = [
  'fixed',
  'pick-low',
  'pick-mid',
  'pick-high',
  'manual',
  'override'
] as const;

export type LandedCostBasis = (typeof LANDED_COST_BASIS_VALUES)[number];

export const BELOW_FLOOR_REASONS = [
  'keep_margin',
  'renegotiate',
  'waive_margin',
  'take_loss',
  'vendor_approval_pending'
] as const;

export type BelowFloorReason = (typeof BELOW_FLOOR_REASONS)[number];

export const VENDOR_APPROVAL_STATES = ['none', 'pending', 'approved', 'declined'] as const;
export type VendorApprovalState = (typeof VENDOR_APPROVAL_STATES)[number];

export interface CostRange {
  low: number;
  high: number;
}

export interface ValidateLandedCostInput {
  landedCost: number;
  range: CostRange;
  basis: LandedCostBasis;
  role: string;
  reason: string | null;
}

export type ValidateLandedCostResult =
  | { ok: true; basisRecord: LandedCostBasis }
  | { ok: false; error: string };

const PRIVILEGED_ROLES = new Set(['manager', 'owner', 'admin']);

export function validateLandedCost(input: ValidateLandedCostInput): ValidateLandedCostResult {
  const { landedCost, range, basis, role, reason } = input;
  if (!Number.isFinite(landedCost) || landedCost < 0) {
    return { ok: false, error: 'Landed COGS must be a non-negative finite number.' };
  }
  if (!LANDED_COST_BASIS_VALUES.includes(basis)) {
    return {
      ok: false,
      error: `Invalid basis. Allowed: ${LANDED_COST_BASIS_VALUES.join(', ')}.`
    };
  }
  const inRange = landedCost >= range.low && landedCost <= range.high;
  if (!inRange) {
    if (basis !== 'override') {
      return {
        ok: false,
        error: `Landed COGS $${landedCost} is outside batch range $${range.low}-$${range.high}. Use override basis with a reason and manager approval.`
      };
    }
    if (!PRIVILEGED_ROLES.has(role)) {
      return {
        ok: false,
        error: 'Out-of-range landed COGS requires manager or owner role.'
      };
    }
    if (!reason || !reason.trim()) {
      return { ok: false, error: 'Override reason is required for out-of-range landed COGS.' };
    }
    return { ok: true, basisRecord: 'override' };
  }
  return { ok: true, basisRecord: basis };
}

export interface ValidateBelowFloorChoiceInput {
  unitPrice: number;
  priceFloor: number | null;
  reason: BelowFloorReason | null;
}

export type ValidateBelowFloorChoiceResult =
  | { ok: true; requiresVendorApproval: boolean }
  | { ok: false; error: string };

export function validateBelowFloorChoice(
  input: ValidateBelowFloorChoiceInput
): ValidateBelowFloorChoiceResult {
  const { unitPrice, priceFloor, reason } = input;
  const hasFloor = priceFloor != null && Number.isFinite(priceFloor);
  const belowFloor = hasFloor && unitPrice < (priceFloor as number);
  if (!belowFloor) {
    return { ok: true, requiresVendorApproval: false };
  }
  if (reason == null) {
    return {
      ok: false,
      error: `Below-floor reason required when unit price is below the floor. Allowed: ${BELOW_FLOOR_REASONS.join(', ')}.`
    };
  }
  if (!BELOW_FLOOR_REASONS.includes(reason)) {
    return {
      ok: false,
      error: `Below-floor reason must be one of: ${BELOW_FLOOR_REASONS.join(', ')}.`
    };
  }
  return { ok: true, requiresVendorApproval: reason === 'vendor_approval_pending' };
}

export interface ExceptionLine {
  qty: number;
  unitPrice: number;
  unitCost: number;
  priceFloor: number | null;
  belowFloorReason: BelowFloorReason | null;
  vendorApprovalState: VendorApprovalState;
}

export interface OrderExceptionTotals {
  marginWaivedTotal: number;
  lossRecognizedTotal: number;
  vendorApprovalPending: boolean;
}

export function computeOrderExceptionTotals(lines: ReadonlyArray<ExceptionLine>): OrderExceptionTotals {
  let marginWaivedTotal = 0;
  let lossRecognizedTotal = 0;
  let vendorApprovalPending = false;

  for (const line of lines) {
    const qty = Number(line.qty);
    const unitPrice = Number(line.unitPrice);
    const unitCost = Number(line.unitCost);
    const priceFloor = line.priceFloor == null ? null : Number(line.priceFloor);

    if (line.vendorApprovalState === 'pending') {
      vendorApprovalPending = true;
    }

    if (line.belowFloorReason === 'waive_margin' && priceFloor != null && unitPrice < priceFloor) {
      marginWaivedTotal += (priceFloor - unitPrice) * qty;
    }
    if (line.belowFloorReason === 'take_loss' && unitPrice < unitCost) {
      lossRecognizedTotal += (unitCost - unitPrice) * qty;
    }
  }

  return {
    marginWaivedTotal: round2(marginWaivedTotal),
    lossRecognizedTotal: round2(lossRecognizedTotal),
    vendorApprovalPending
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface CanConfirmOrPostLine {
  batchId: string | null;
  itemName: string;
  unitCostResolved: boolean;
  unitPrice: number;
  unitCost: number;
  priceFloor: number | null;
  belowFloorReason: BelowFloorReason | null;
  vendorApprovalState: VendorApprovalState;
}

/**
 * Per-line gate that returns a stable reason code when the line blocks
 * confirm/post, or null when the line is clear. Callers translate the code
 * into operator copy with the offending line context.
 *
 * Codes returned (in priority order):
 *   - 'cogs_unresolved'             -> range batch line never had landed COGS picked
 *   - 'vendor_approval_pending'     -> vendor approval pending
 *   - 'vendor_approval_declined'    -> vendor approval was declined; operator
 *                                      must reprice or re-request approval before
 *                                      the order can move forward (reviewer fix)
 *   - 'below_floor_reason_missing'  -> unit price below floor but no reason recorded
 */
export type ConfirmOrPostBlockedReason =
  | 'cogs_unresolved'
  | 'vendor_approval_pending'
  | 'vendor_approval_declined'
  | 'below_floor_reason_missing';

export function canConfirmOrPost(line: CanConfirmOrPostLine): ConfirmOrPostBlockedReason | null {
  if (line.batchId && line.unitCostResolved === false) {
    return 'cogs_unresolved';
  }
  if (line.vendorApprovalState === 'pending') {
    return 'vendor_approval_pending';
  }
  if (line.vendorApprovalState === 'declined') {
    return 'vendor_approval_declined';
  }
  const hasFloor = line.priceFloor != null && Number.isFinite(line.priceFloor);
  if (hasFloor && line.unitPrice < (line.priceFloor as number) && !line.belowFloorReason) {
    return 'below_floor_reason_missing';
  }
  return null;
}
