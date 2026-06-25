/**
 * UX-G02 — order-level duplicate-source pre-check chip for the Orders grid.
 *
 * The orders grid payload now carries `crossOrderSourceOrders` (see the
 * UX-G02 allowlist field extension in src/server/routers/queries.ts, orders
 * case): a comma-separated list of OTHER open orders (status draft/confirmed)
 * that share a source key with this order, where the source key mirrors the
 * server's `sourceRowKey || batchId` (commandBus.ts:3638).
 *
 * Server behavior being surfaced early (verified in commandBus.ts):
 *  - postSalesOrder refuses when a source row cannot cover a line's qty
 *    (`availableQty < qty`, commandBus.ts:3646-3650). When two OPEN orders
 *    draw on the same source row, whichever posts second may be refused.
 * The chip is informational only — it never blocks any action.
 */
import type { GridColDef } from '../../shared/grid-types';
import type { GridRow } from '../../shared/types';

/** Statuses where the early warning is actionable (matches the Orders
 *  "All Open" preset, status:draft,confirmed). */
const OPEN_ORDER_STATUSES = new Set(['draft', 'confirmed']);

export function CrossOrderSourceChip({ status, conflictOrders }: { status: string; conflictOrders: string | null | undefined }) {
  const conflicts = String(conflictOrders ?? '').trim();
  if (!conflicts || !OPEN_ORDER_STATUSES.has(status)) return null;
  return (
    <span
      className="selection-pill warning"
      style={{ fontSize: 11 }}
      data-testid="cross-order-source-chip"
      title={`Shares an inventory source row with open order(s): ${conflicts}. Whichever order posts second may be refused if the source row cannot cover both.`}
    >
      Shared source: {conflicts}
    </span>
  );
}

/** Column def appended to the Orders grid by OrdersView (UX-G02).
 *  SX-H02: demoted to optional — exception flags are not permanent columns
 *  (Odoo principle). Available in the column chooser; otherwise the chip
 *  remains reachable as a row indicator on hover/expansion. */
export const crossOrderSourceColumn: GridColDef<GridRow> = {
  field: 'crossOrderSourceOrders',
  headerName: 'Source conflict',
  width: 190,
  sortable: true,
  hide: true,
  cellRenderer: (params: { data?: GridRow }) => {
    const row = params.data;
    if (!row) return null;
    return (
      <CrossOrderSourceChip
        status={String(row.status ?? '')}
        conflictOrders={row.crossOrderSourceOrders as string | null | undefined}
      />
    );
  }
};
