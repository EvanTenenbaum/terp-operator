import type { ColDef } from 'ag-grid-community';
import type { GridRow } from '../../shared/types';

// Issue #63 — Operator margin visibility toggle.
//
// The Sales workspace renders cost/margin columns by default for operators,
// but must be able to hide them when an operator is screen-sharing with a
// customer. The helper below is the single source of truth for which Sales
// workspace fields are "margin/cost" and therefore hidden when the operator
// toggles `showMargin` off in the workspace header.
//
// Note: this only affects the in-app operator grid. The customer-facing CSV
// exports (PR #80 / #15) strip cost/margin independently — see
// `SalesView.csvExport.ts` and its regression tests.
//
// #64 PR-2 review finding I-2: `landedCostExceptionReason` is part of this
// gate. The projected reason (keep_margin, waive_margin, take_loss,
// vendor_approval_pending, renegotiate) reveals vendor/COGS relationship
// state that we must not expose during a customer screen-share — gating it
// with the existing margin toggle keeps a single operator affordance for the
// whole cost-sensitive column set.
export const MARGIN_COLUMN_FIELDS = [
  'unitCost',
  'internalMargin',
  'estimatedMargin',
  'rangeBadge',
  'landedCostExceptionReason'
] as const;

const MARGIN_FIELD_SET = new Set<string>(MARGIN_COLUMN_FIELDS);

/**
 * Returns the subset of Sales workspace columns the operator should see.
 *
 * - When `showMargin === true`, the input is returned unchanged (new array,
 *   never mutated) so callers can safely treat the result as immutable.
 * - When `showMargin === false`, any column whose `field` is in
 *   `MARGIN_COLUMN_FIELDS` is filtered out — these columns expose cost or
 *   margin and must be hidden for customer-facing screens.
 */
export function selectVisibleSalesColumns(
  showMargin: boolean,
  columns: readonly ColDef<GridRow>[]
): ColDef<GridRow>[] {
  if (showMargin) return columns.slice();
  return columns.filter((column) => !column.field || !MARGIN_FIELD_SET.has(column.field));
}
