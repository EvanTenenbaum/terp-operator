/**
 * SalesBuildMode — Phase 3B Mode B (building, customer selected).
 *
 * Mercury layout (UX-3 / UX-5 / UX-7):
 *   1. Sticky SalesCustomerContextHeader — customer identity / credit pill (UX-7)
 *   2. Toolbar:  "+ Inventory Finder" slide-over trigger + line-entry typeahead
 *   3. SalePrePostStrip — CONDITIONAL: rendered ONLY when one or more checks
 *      fail (UX-5: the "All checks passed" happy-path strip is deleted; absence
 *      means success). Replaces the previous permanent strip in LegacySalesView.
 *   4. Primary surface: Customer Draft Lines grid (this IS the workspace).
 *   5. DetailSlideover: registered salesOrder tabs (Lines / Pricing / etc.)
 *   6. Inventory Finder: slide-over panel toggled from toolbar (NOT a
 *      permanent left panel).
 *
 * SaleLineItemTypeahead is preserved verbatim (Arrow/Enter/Escape).
 * Cell renderers (Phase 3A extracted modules) reused unchanged.
 * Financial math: routed through `useSalesLineRows` + `useSalePrePostChecks`
 * exactly like LegacySalesView — no math is duplicated here.
 *
 * Behind feature flag SALES_VIEW_MERCURY (currently false → not reachable in
 * production). LegacySalesView remains the production surface until the flag
 * flips.
 *
 * SCOPE NOTE: This Mode B body intentionally covers the core "build a sale"
 * loop (browse finder → add line → edit qty/price → confirm). Less-frequent
 * surfaces (sheet export panel, recall flows, warehouse-alert dialog, etc.)
 * remain in LegacySalesView and will migrate in subsequent wedges. The
 * feature flag protects production from this WIP state.
 *
 * ── DEFERRED SURFACES: operator impact when Build Mode is active ──
 *
 * Each surface below exists in LegacySalesView but is deferred from
 * SalesBuildMode (Phase 3B). The question answered per-surface:
 *   "What happens if Build Mode is active and an operator needs this?"
 *
 *   1. CustomerPurchaseHistoryPanel
 *      Operator must clear ?customer= (click [Clear] in header) to return
 *      to Browse Mode. Purchase history is not accessible inside Build Mode.
 *      Risk: low — history is a pre-sale research step; operators typically
 *      review it before entering Build Mode.
 *
 *   2. PhotographyQueuePanel
 *      Only in legacy SalesView. Build Mode operators use the standalone
 *      /photography view instead. Risk: none — separate route exists.
 *
 *   3. ReceiptPanel
 *      Operator clears customer context (same as #1) to access receipt
 *      previews. Build Mode does not embed receipt views. Risk: low —
 *      receipts are a separate workflow; the /fulfillment route has full
 *      receipt views.
 *
 *   4. SaleLineExceptionControls
 *      Line pricing and COGS exceptions are handled in the Build Mode
 *      slide-over Pricing tab (DetailSlideover → registered salesOrder
 *      tabs). Operator clicks "Order detail" → Pricing tab. Risk: resolved.
 *
 *   5. SalesSourcePane
 *      Legacy left-panel inventory finder replaced by the Build Mode
 *      slide-over Inventory Finder (toolbar-triggered, NOT permanent).
 *      Same capability, different layout. Risk: resolved — operator clicks
 *      "Inventory Finder" button in toolbar.
 *
 *   6. ShadowModeBanner
 *      Credit shadow mode indicator appears in the customer context header
 *      (SalesCustomerContextHeader) when a customer has shadow mode active.
 *      Build Mode renders this header; shadow visibility is preserved.
 *      Risk: resolved.
 *
 *   7. SnapshotRetryPill
 *      Retry-pill for failed sheet snapshots is deferred to a follow-up
 *      wedge. In Build Mode, failed snapshot exports cannot be retried
 *      within the sales view. Operator must use the legacy view path
 *      (flag off) or wait for the follow-up wedge. Risk: low — snapshot
 *      export is a batch/infrequent operation; retry is rare.
 *
 *   8. WorkspacePanel
 *      Legacy workspace panel (totals, pay/f-up, posting) replaced by
 *      the DetailSlideover registered salesOrder tabs. Same content,
 *      different container. Risk: resolved — operator clicks "Order detail".
 *
 *   9. WhyShownCell / FulfillmentActionsCell (cell renderers)
 *      Already imported and used in both Browse Mode and Build Mode grid
 *      column definitions. Risk: none — shared cell renderers.
 *
 *  10. StatusActionBar
 *      Legacy status actions (recall, hold, etc.) replaced by BulkActionBar.
 *      Build Mode does not yet wire the BulkActionBar for sales lines;
 *      this is deferred to the Phase 4 bulk-actions wedge. Current impact:
 *      single-line manual state changes only; bulk status transitions are
 *      unavailable in Build Mode. Risk: medium — until the Phase 4 wedge,
 *      operators needing bulk recalls/status changes must use legacy view
 *      (flag off).
 *
 *  11. Sheet snapshot / CSV export
 *      Deferred to follow-up wedge. Build Mode has no "Export CSV" or
 *      "Snapshot" button for the draft lines grid. Operator must toggle
 *      flag off and use LegacySalesView for exports. Risk: medium —
 *      customer-facing CSV export and compliance snapshots are daily
 *      workflow items for some roles.
 *
 *  Summary: The 5 "resolved" surfaces (#4, #5, #6, #8, #9) have equivalent
 *  or identical functionality in Build Mode. The 3 "low" risk surfaces
 *  (#1, #2, #3, #7) require switching context but have alternative access
 *  paths. The 2 "medium" risk surfaces (#10, #11) are gated behind the
 *  feature flag — operators revert to LegacySalesView for these until the
 *  follow-up wedges land.
 */
import { Check, Search, Send, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { useShallow } from 'zustand/react/shallow';
import { trpc } from '../../api/trpc';
import { OperatorGrid } from '../../components/OperatorGrid';
import { DetailSlideover, type SlideoverState } from '../../components/DetailSlideover';
import {
  InventoryFinderPanel,
  type InventoryFinderBatch,
} from '../../components/InventoryFinderPanel';
import { SalePrePostStrip, type SalePrePostCheck, type SalePrePostLine } from '../../components/SalePrePostStrip';
import { useCommandRunner } from '../../components/useCommandRunner';
import { useOrderSocket } from '../../context/SocketContext';
import { useUiStore } from '../../store/uiStore';
import { useSalesLineRows } from './useSalesLineRows';
import { useSalePrePostChecks } from './useSalePrePostChecks';
import { SalesCustomerContextHeader } from './SalesCustomerContextHeader';
import { registerSalesTabs } from '../../components/tabs/registerSalesTabs';
import { SaleLineItemTypeahead, buildBindLinePayload, resolveUniqueBatch } from '../SalesView.ux-f03';
import { buildConfirmPayload, deriveCustomerRefereeRelationships } from '../SalesView.ux-f06';
import { DisplayNameCell } from '../../components/cells/sales/DisplayNameCell';
import { selectVisibleSalesColumns } from '../SalesView.columns';
import type { GridRow, Role, ViewKey } from '../../../shared/types';

// Register salesOrder slide-over tabs at module load. Idempotent.
registerSalesTabs();

const VIEW_KEY: ViewKey = 'sales';

/**
 * Pick statuses where a sales-side line is read-only. Mirrors the
 * LegacySalesView RELEASED_PICK_STATUSES set verbatim so locking behaviour
 * matches what operators expect from the legacy view.
 */
const RELEASED_PICK_STATUSES = new Set([
  'released',
  'picking',
  'picked',
  'recall_pending',
]);

function isRowEditLocked(params: { data?: GridRow }): boolean {
  return RELEASED_PICK_STATUSES.has(String(params.data?.pickStatus ?? ''));
}

// Line columns — schema-driven via useColumnDefs (G-13 / ARCH-8).
//
// The Sales lines grid used to surface ~22 columns (subcategory, batchCode,
// unresolvedSourceText, markup, markupPct, unitCost, derivedCogs,
// landedCostExceptionReason, availableQty, packed, inventoryPosted,
// paymentFollowup, pickStatus, …). Per the P4 plan we keep ≤8 columns
// visible — only the fields an operator actually scans/edits during the
// build flow — and push the heavy per-line detail (markup, unit cost,
// landed-cost resolution, price floor, notes, exception reasons,
// fulfillment booleans) into the DetailSlideover under entityType='saleLine'
// (see registerSalesTabs.tsx → saleLineDetailsTab).
//
// Visible columns (from salesOrderLineSchema + lineTotal computed):
//   1. legacyStatusMarker  (Raw)         pinned-left  — line status chip
//   2. displayName         (Product)     pinned-left  — primary identity
//   3. itemName            (Canonical)                — editable canonical
//   4. qty                                             — editable
//   5. unitPrice                                       — editable
//   6. lineTotal           (Total)                     — derived qty × unitPrice
//   7. status                                          — line lifecycle
//   8. validationIssues    (Fix)                       — what's broken
//
// Click a row to open the per-line slide-over (entityType='saleLine') for
// markup, unitCost, markupPct, derivedCogs, landed-cost exception reason,
// price floor, pick status, packed / posted / pay-followup flags, available
// qty, unresolved source text, notes, and cost-resolution metadata.
import { useColumnDefs } from '../../hooks/useColumnDefs';

// lineTotal is a computed column (qty × unitPrice) — not a schema field,
// appended after useColumnDefs returns.
const lineTotalColumn: ColDef<GridRow> = {
  colId: 'lineTotal',
  headerName: 'Total',
  type: 'numericColumn',
  width: 110,
  editable: false,
  valueGetter: (params) => {
    const row = params.data as GridRow | undefined;
    if (!row) return null;
    const qty = Number(row.qty ?? 0);
    const unitPrice = Number(row.unitPrice ?? 0);
    if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return null;
    return qty * unitPrice;
  },
  valueFormatter: (params) =>
    params.value != null
      ? Number(params.value).toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        })
      : '—',
};

export interface SalesBuildModeProps {
  customerId: string;
  onClear: () => void;
}

const BLANK_ID = '00000000-0000-0000-0000-000000000000';

export function SalesBuildMode({ customerId, onClear }: SalesBuildModeProps) {
  // ── Identity / role ──────────────────────────────────────────────────
  const me = trpc.auth.me.useQuery();
  const role: Role = (me.data?.role as Role | undefined) ?? 'viewer';
  const canWrite = role !== 'viewer';

  // ── Store ────────────────────────────────────────────────────────────
  const showMargin = useUiStore((s) => s.showMargin);
  const setActiveCustomerId = useUiStore((s) => s.setActiveCustomerId);
  const setSelectedRows = useUiStore((s) => s.setSelectedRows);

  // Drawer state for the order DetailSlideover.
  const activeDrawerEntity = useUiStore(
    useShallow((s) => s.activeDrawerEntityByView[VIEW_KEY]),
  );
  const drawerStateRaw = useUiStore((s) => s.drawerByView[VIEW_KEY]?.state);
  const drawerState: SlideoverState =
    drawerStateRaw === 'closed' ||
    drawerStateRaw === 'peek' ||
    drawerStateRaw === 'standard' ||
    drawerStateRaw === 'wide'
      ? drawerStateRaw
      : 'closed';
  const setDrawerEntity = useUiStore((s) => s.setDrawerEntity);
  const setDrawerState = useUiStore((s) => s.setDrawerState);

  // Inventory Finder slide-over toggle.
  const [finderOpen, setFinderOpen] = useState(false);

  // Line entry typeahead state (mirrors LegacySalesView lines 308-310).
  const [draftItem, setDraftItem] = useState('');
  const [draftQty, setDraftQty] = useState('1');
  const [addedBatchIds, setAddedBatchIds] = useState<Set<string>>(new Set());
  // UX-F06 — referee relationship selected for credit accrual at confirm time.
  // Cleared when the order is confirmed or the customer changes.
  const [refereeRelationshipId, setRefereeRelationshipId] = useState('');

  // ── Customer / order context sync ─────────────────────────────────────
  // Mirror legacy effect at SalesView.tsx ~ line 821: keep the global
  // activeCustomerId in sync with the URL-derived customerId so shared store
  // consumers (PhotographyQueuePanel, etc.) keep working.
  // UX-F06: also clear referee selection when customer changes so stale
  // relationships from a previous customer don't carry over.
  useEffect(() => {
    setActiveCustomerId(customerId || null);
    setRefereeRelationshipId('');
    return () => {
      setActiveCustomerId(null);
    };
  }, [customerId, setActiveCustomerId]);

  // ── Queries (identical inputs to LegacySalesView) ────────────────────
  const reference = trpc.queries.reference.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const workspace = trpc.queries.customerWorkspace.useQuery(
    { customerId: customerId || BLANK_ID },
    { enabled: Boolean(customerId) },
  );

  const { runCommand, isRunning } = useCommandRunner();

  // Active order — prefer draft/confirmed; fall back to first order.
  const workspaceOrder = useMemo(() => {
    const orders = workspace.data?.orders ?? [];
    return (
      orders.find((o: Record<string, unknown>) =>
        ['draft', 'confirmed'].includes(String(o.status)),
      ) ?? orders[0]
    );
  }, [workspace.data]);

  const selectedOrder = workspaceOrder;
  const selectedOrderId = selectedOrder?.id ? String(selectedOrder.id) : '';
  const selectedOrderStatus = String(selectedOrder?.status ?? '');

  const orderLines = trpc.salesOrders.salesOrderLines.useQuery(
    { orderId: selectedOrderId || BLANK_ID },
    { enabled: Boolean(selectedOrderId), refetchInterval: 30_000 },
  );

  // Socket subscription mirrors legacy lines ~ 431-435 — same hook, same
  // call shape; the listener is in-context and harmless to register here.
  const { subscribeOrder, unsubscribeOrder } = useOrderSocket();
  useEffect(() => {
    if (!selectedOrderId) return;
    subscribeOrder(selectedOrderId);
    return () => {
      unsubscribeOrder(selectedOrderId);
    };
  }, [selectedOrderId, subscribeOrder, unsubscribeOrder]);

  // ── Derived rows (financial math reused — see useSalesLineRows) ──────
  const lineRowsWithRule = useSalesLineRows({
    orderLines: orderLines.data,
    customers: reference.data?.customers as
      | ReadonlyArray<Record<string, unknown>>
      | undefined,
    defaultPricingRule: reference.data?.defaultPricingRule,
    customerId,
  });

  // Finder batches (the SAME availableBatches the legacy view reads).
  const finderBatches = useMemo(
    () => (reference.data?.availableBatches ?? []) as InventoryFinderBatch[],
    [reference.data?.availableBatches],
  );

  // UX-F06 — derive active referee relationships for the current customer so
  // the confirm-time pill can show "Referee: <name> — credit will accrue".
  // Reference query already loaded (staleTime 60s). Uses
  // deriveCustomerRefereeRelationships helper from SalesView.ux-f06.ts.
  const customerRefereeRelationships = useMemo(
    () => deriveCustomerRefereeRelationships(
      (reference.data?.refereeRelationships ?? []) as Parameters<typeof deriveCustomerRefereeRelationships>[0],
      customerId,
    ),
    [reference.data?.refereeRelationships, customerId],
  );

  // ── Pre-post checks — conditional render (UX-5) ───────────────────────
  const { checks: prePostChecks } = useSalePrePostChecks({
    selectedOrder: selectedOrder as { total?: unknown } | null | undefined,
    customer: workspace.data?.customer as
      | { balance: number; creditLimit: number }
      | null
      | undefined,
    lines: lineRowsWithRule as SalePrePostLine[],
  });

  // UX-5 / brief item #4: only render when one or more checks FAIL. The
  // "All checks passed" happy-path strip is deleted; absence = success.
  const failingChecks: SalePrePostCheck[] = useMemo(
    () => prePostChecks.filter((c) => !c.ok),
    [prePostChecks],
  );
  const showPrePostStrip = Boolean(
    customerId &&
      selectedOrder &&
      ['draft', 'confirmed'].includes(selectedOrderStatus) &&
      failingChecks.length > 0,
  );

  // ── Slideover row (passed to tab components) ─────────────────────────
  // P4: resolves the GridRow that backs the slide-over for either of the two
  // entity types this view can open:
  //   * 'salesOrder' → the selected workspace order
  //   * 'saleLine'   → the matching enriched line row from useSalesLineRows
  //                    (so the SaleLineDetailTab sees the same row the grid
  //                    showed, including __rule / markup enrichment)
  const slideoverRow: GridRow | undefined = useMemo(() => {
    if (!activeDrawerEntity?.entityId) return undefined;
    const drawerEntityType = activeDrawerEntity.entityType;
    const drawerEntityId = activeDrawerEntity.entityId;
    if (drawerEntityType === 'saleLine') {
      return lineRowsWithRule.find(
        (line) => String(line.id ?? '') === drawerEntityId,
      ) as GridRow | undefined;
    }
    if (selectedOrder && String(selectedOrder.id) === drawerEntityId) {
      return selectedOrder as GridRow;
    }
    return undefined;
  }, [activeDrawerEntity, selectedOrder, lineRowsWithRule]);

  // Line column overrides — schema-driven via useColumnDefs (G-13).
  // The salesOrderLineSchema defines every column; overrides adjust headers,
  // widths, editability, and the DisplayNameCell renderer for build mode.
  const lineOverrides = useMemo<Partial<ColDef<GridRow>>[]>(() => [
    { field: 'legacyStatusMarker', editable: (params) => !isRowEditLocked(params), width: 90, pinned: 'left' },
    { field: 'displayName', headerName: 'Product name', editable: false, minWidth: 190, pinned: 'left', cellRenderer: DisplayNameCell },
    { field: 'itemName', headerName: 'Canonical', editable: (params) => !isRowEditLocked(params), minWidth: 170 },
    { field: 'qty', editable: (params) => !isRowEditLocked(params), width: 95 },
    { field: 'unitPrice', editable: (params) => !isRowEditLocked(params), width: 115 },
    { field: 'status', width: 115 },
    { field: 'validationIssues', headerName: 'Fix', minWidth: 220 },
  ], []);

  const schemaLineColumns = useColumnDefs('salesOrderLine', lineOverrides);
  const lineColumns = useMemo(
    () => [...schemaLineColumns, lineTotalColumn] as ColDef[],
    [schemaLineColumns],
  );
  const visibleLineColumns = useMemo(
    () => selectVisibleSalesColumns(showMargin, lineColumns),
    [showMargin, lineColumns],
  );

  // ── Add-line paths (mirror legacy SalesView add helpers) ─────────────
  const addFinderBatch = useCallback(
    async (batch: InventoryFinderBatch, qty: number) => {
      if (!selectedOrderId) return;
      await runCommand(
        'addSalesOrderLine',
        {
          orderId: selectedOrderId,
          batchId: batch.id,
          qty,
          unitPrice: batch.unitPrice,
          sourceRowKey: batch.batchCode,
        },
        'Add inventory finder row to order (Mercury Build Mode)',
      );
      setAddedBatchIds((prev) => new Set(prev).add(String(batch.id)));
      await orderLines.refetch();
    },
    [runCommand, selectedOrderId, orderLines],
  );

  const addDraftLine = useCallback(async () => {
    if (!selectedOrderId || !draftItem.trim()) return;
    await runCommand(
      'addSalesOrderLine',
      {
        orderId: selectedOrderId,
        itemName: draftItem,
        unresolvedSourceText: draftItem,
        qty: Number(draftQty) || 1,
        unitPrice: 0,
        legacyStatusMarker: '',
      },
      'Add unresolved customer workspace line (Mercury Build Mode)',
    );
    setDraftItem('');
    setDraftQty('1');
    await orderLines.refetch();
  }, [runCommand, selectedOrderId, draftItem, draftQty, orderLines]);

  const pickDraftBatch = useCallback(
    async (batch: InventoryFinderBatch) => {
      if (!selectedOrderId) return;
      const requested = Math.max(1, Number(draftQty) || 1);
      const available = Number(batch.availableQty ?? 0);
      await addFinderBatch(batch, Math.min(requested, available || requested));
      setDraftItem('');
      setDraftQty('1');
      await orderLines.refetch();
    },
    [addFinderBatch, selectedOrderId, draftQty, orderLines],
  );

  // Confirm-and-price — UX-F06: wire referee relationship into confirm when
  // operator selected one. Uses buildConfirmPayload helper (SalesView.ux-f06.ts).
  const priceAndConfirm = useCallback(async () => {
    if (!selectedOrderId) return;
    await runCommand(
      'priceSalesOrder',
      { orderId: selectedOrderId, strategy: 'standard' },
      'Sales view pricing preview (Mercury Build Mode)',
    );
    const confirmPayload = buildConfirmPayload(selectedOrderId, refereeRelationshipId);
    await runCommand(
      'confirmSalesOrder',
      confirmPayload,
      'Confirm sales order (Mercury Build Mode)',
    );
    setRefereeRelationshipId('');
  }, [runCommand, selectedOrderId, refereeRelationshipId]);

  // ── Line cell commit (item-cell shorthand + standard fields) ─────────
  const onLineCommit = useCallback(
    async (event: CellValueChangedEvent<GridRow>) => {
      if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) {
        return;
      }

      // Item-cell shorthand resolution (mirrors legacy ~ lines 977-989).
      if (event.colDef.field === 'unresolvedSourceText') {
        const match = resolveUniqueBatch(finderBatches, String(event.newValue ?? ''));
        if (match) {
          await runCommand(
            'updateSalesOrderLine',
            buildBindLinePayload(
              String(event.data.id),
              match,
              Number(event.data.unitPrice ?? 0),
            ),
            'Resolve sale line to inventory (item-cell shorthand, Mercury)',
          );
          setAddedBatchIds((prev) => new Set(prev).add(String(match.id)));
          await orderLines.refetch();
          return;
        }
      }

      await runCommand(
        'updateSalesOrderLine',
        { lineId: event.data.id, [event.colDef.field]: event.newValue },
        `Inline sales line edit (Mercury): ${event.colDef.field}`,
      );
      await orderLines.refetch();
    },
    [runCommand, finderBatches, orderLines],
  );

  // ── Slideover open / close ───────────────────────────────────────────
  const openOrderDetail = useCallback(() => {
    if (!selectedOrderId) return;
    setDrawerEntity(VIEW_KEY, 'salesOrder', selectedOrderId);
    setDrawerState(VIEW_KEY, 'standard');
  }, [selectedOrderId, setDrawerEntity, setDrawerState]);

  const handleDrawerClose = useCallback(() => {
    setDrawerState(VIEW_KEY, 'closed');
  }, [setDrawerState]);

  // ── Selection tracking on the lines grid ─────────────────────────────
  // P4 lean grid: a single-row selection opens the per-line DetailSlideover
  // (entityType='saleLine') so the operator can see the heavy fields
  // (markup, landed-cost resolution, price floor, notes, inventory
  // resolution) that were pushed out of the lean ≤8-column grid. Multi-row
  // selection still updates the global selectedRows store for bulk actions
  // (used by BulkActionBar) without forcing a slideover state.
  const handleLineSelection = useCallback(
    (selection: GridRow[]) => {
      setSelectedRows('sales', selection);
      if (selection.length === 1) {
        const lineId = String(selection[0].id ?? '');
        if (lineId) {
          setDrawerEntity(VIEW_KEY, 'saleLine', lineId);
          setDrawerState(VIEW_KEY, 'standard');
        }
      }
    },
    [setSelectedRows, setDrawerEntity, setDrawerState],
  );

  // ── Deep-link the failing pre-post strip ────────────────────────────
  const focusPrePostCheck = useCallback((_check: SalePrePostCheck) => {
    // In this wedge the strip is purely informational. Subsequent wedges
    // will wire ✗ clicks to a Validation tab in the slide-over.
  }, []);
  const openCreditPanel = useCallback(() => {
    if (!customerId) return;
    setDrawerEntity(VIEW_KEY, 'customer', customerId);
    setDrawerState(VIEW_KEY, 'standard');
  }, [customerId, setDrawerEntity, setDrawerState]);

  return (
    <div className="flex flex-col h-full">
      {/* (1) Sticky customer context header */}
      <SalesCustomerContextHeader customerId={customerId} onClear={onClear} />

      <div className="flex-1 overflow-y-auto">
        <div className="view-stack">
          {/* (2) Toolbar */}
          {canWrite ? (
            <div className="control-band">
              <button
                className="primary-button"
                type="button"
                onClick={() => setFinderOpen(true)}
                title="Open the Inventory Finder slide-over"
                data-testid="sales-build-open-finder"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Inventory Finder
              </button>

              {/* Inline line entry — preserves SaleLineItemTypeahead keyboard nav */}
              <label className="field-inline grow">
                Request / item
                <SaleLineItemTypeahead
                  value={draftItem}
                  onChange={setDraftItem}
                  batches={finderBatches}
                  onPickBatch={(batch) => void pickDraftBatch(batch)}
                  onSubmitUnresolved={() => void addDraftLine()}
                  placeholder="Type item, source code, note, or shorthand"
                  disabled={false}
                />
              </label>
              <label className="field-inline">
                Qty
                <input
                  className="input compact"
                  value={draftQty}
                  inputMode="decimal"
                  onChange={(event) => setDraftQty(event.target.value)}
                />
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={!selectedOrderId || !draftItem.trim()}
                onClick={addDraftLine}
              >
                Add sale line
              </button>

              {selectedOrderId ? (
                <button
                  className="secondary-button compact-action"
                  type="button"
                  onClick={openOrderDetail}
                  title="Open order detail slide-over"
                  data-testid="sales-build-open-detail"
                >
                  Order detail
                </button>
              ) : null}

              {selectedOrderId && selectedOrderStatus === 'draft' ? (
                <button
                  className="secondary-button compact-action"
                  type="button"
                  disabled={isRunning}
                  onClick={priceAndConfirm}
                  title="Price + confirm"
                  data-testid="sales-build-price-confirm"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Price + Confirm
                </button>
              ) : null}
            </div>
          ) : null}

          {/* UX-F06 — referee credit pill: confirm-time referee selection
              (like the legacy sheet preview panel pill at SalesView.tsx:1731). */}
          {canWrite && customerId && selectedOrderStatus === 'draft' && customerRefereeRelationships.length > 0 ? (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900" data-testid="referee-credit-pill">
              <span className="font-medium">Referee credit:</span>
              <select
                className="select text-xs"
                value={refereeRelationshipId}
                onChange={(e) => setRefereeRelationshipId(e.target.value)}
                data-testid="referee-credit-select"
              >
                <option value="">None — no credit will accrue</option>
                {customerRefereeRelationships.map((rel: any) => (
                  <option key={rel.id} value={rel.id}>
                    {rel.refereeName} — credit will accrue
                    {' ▸ '}
                    {rel.feeType === 'percentage'
                      ? `${rel.feePercentage}%`
                      : rel.feeType === 'fixed'
                      ? `$${rel.feeFixedAmount}`
                      : `${rel.feePercentage}% + $${rel.feeFixedAmount}`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* (3) Conditional pre-post strip (UX-5) — failing only */}
          {showPrePostStrip ? (
            <SalePrePostStrip
              orderStatus={selectedOrderStatus}
              checks={failingChecks}
              onFocusLines={focusPrePostCheck}
              onOpenCredit={openCreditPanel}
            />
          ) : null}

          {/* (4) Primary grid: Customer Draft Lines */}
          <div className="min-h-[420px]">
            <OperatorGrid
              view="sales"
              title="Customer Draft Lines"
              rows={lineRowsWithRule}
              columns={visibleLineColumns}
              loading={orderLines.isLoading}
              isError={orderLines.isError}
              onRetry={() => orderLines.refetch()}
              onSelectionChange={handleLineSelection}
              onCellCommit={canWrite ? onLineCommit : undefined}
              emptyTitle="No sale lines yet"
              emptyChildren={
                selectedOrderId
                  ? 'Open the Inventory Finder or type a request above to add lines.'
                  : 'No draft order found. Refresh to retry.'
              }
            />
          </div>
        </div>
      </div>

      {/* (5) DetailSlideover — registered salesOrder tabs */}
      {activeDrawerEntity?.entityId && drawerState !== 'closed' && (
        <DetailSlideover
          viewKey={VIEW_KEY}
          entityType={activeDrawerEntity.entityType}
          entityId={activeDrawerEntity.entityId}
          state={drawerState}
          row={slideoverRow}
          role={role}
          onClose={handleDrawerClose}
          onStateChange={(s) => setDrawerState(VIEW_KEY, s)}
        />
      )}

      {/* (6) Inventory Finder slide-over (toolbar-triggered, NOT always-visible) */}
      {finderOpen && (
        <aside
          className="slideover slideover--wide"
          role="dialog"
          aria-modal="true"
          aria-label="Inventory Finder"
          data-testid="sales-build-finder-slideover"
        >
          <div className="slideover-header">
            <button
              type="button"
              className="icon-button"
              onClick={() => setFinderOpen(false)}
              aria-label="Close Inventory Finder"
              data-testid="sales-build-finder-close"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">Inventory Finder</div>
              <div className="truncate text-[11px] uppercase text-zinc-500">
                Adds to draft order
              </div>
            </div>
            {selectedOrderStatus === 'draft' ? (
              <button
                type="button"
                className="secondary-button compact-action"
                onClick={() => setFinderOpen(false)}
                title="Back to lines grid"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Done
              </button>
            ) : null}
          </div>
          <div className="slideover-body">
            <InventoryFinderPanel
              customerId={customerId}
              selectedOrderId={canWrite ? selectedOrderId : ''}
              addedBatchIds={addedBatchIds}
              onAddBatch={addFinderBatch}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
