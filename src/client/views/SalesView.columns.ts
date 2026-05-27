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
  'landedCostExceptionReason',
  'markup',        // inline pricing column — cost/margin sensitive
  'markupPct',     // inline pricing column — cost/margin sensitive
  'derivedCogs'    // inline pricing column — cost/margin sensitive
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

// TER-1620 F-21: Sales empty-state cleanup helpers.
//
// Two pure helpers that drive the empty-state affordances in the control band:
// - `salesButtonTitle`: returns a tooltip for the primary action button when it
//   is disabled because no customer has been selected yet.
// - `selectionPillText`: returns the text for the selection-pill status display,
//   or null when no meaningful state exists to show (i.e., no customer selected).
//   Returning null suppresses the pill entirely so there is no redundant
//   "Pick customer to start" prompt alongside the customer picker.

/**
 * Tooltip title for the primary Sales action button.
 *
 * When `customerId` is empty the button is disabled and callers should set
 * `title="Pick a customer first"` so the operator understands why the button
 * is not clickable.  Returns `undefined` (no title) when a customer is active.
 */
export function salesButtonTitle(customerId: string): string | undefined {
  return customerId ? undefined : 'Pick a customer first';
}

/**
 * Text content for the selection-pill status indicator.
 *
 * Returns `null` when there is no customer selected — the pill is omitted
 * entirely in that case so it does not duplicate the customer picker's own
 * call-to-action ("Choose customer").
 *
 * `selectedOrderNo` is typed as `unknown` because GridRow uses an index
 * signature (`[key: string]: unknown`); the function coerces it safely.
 */
export function selectionPillText(
  selectedOrderNo: unknown,
  customerId: string,
  selectedOrderStatus: string
): string | null {
  if (selectedOrderNo != null && String(selectedOrderNo) !== '') {
    return `${String(selectedOrderNo)} / ${selectedOrderStatus || 'open'}`;
  }
  if (customerId) return 'Draft — add your first item';
  return null;
}

// TER-1617 F-23: Sales Orders pane customer scope filter.
//
// When an activeCustomerId is set, the Sales Orders grid must show only orders
// belonging to that customer. This is a client-side view filter — the
// underlying tRPC query remains unchanged (all orders are still fetched).
//
// `activeCustomerId` is null → return all rows unchanged (no scoping).
// `activeCustomerId` is non-null → keep only rows whose `customerId` matches.
// The caller is responsible for the "dismissed" state (chip ×).
export function filterSalesOrdersByCustomer(
  rows: GridRow[],
  activeCustomerId: string | null
): GridRow[] {
  if (!activeCustomerId) return rows;
  return rows.filter((row) => String(row.customerId ?? '') === activeCustomerId);
}
