import { Check, ChevronDown, ChevronRight, Clipboard, Eye, EyeOff, FileText, PackageCheck, PackagePlus, RotateCcw, Search, Send, X } from 'lucide-react';
import { boolCol } from '../utils/format';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { type InventoryFinderBatch } from '../components/InventoryFinderPanel';
import { OperatorGrid } from '../components/OperatorGrid';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { FilterPresetStrip, StatusActionBar, resolveStatusActions, type StatusActionTable } from '../components/templates';
import { buildSalesOrderPrimaryTable, newSalePrimary } from './SalesView.orderPrimary';
import { CustomerPurchaseHistoryPanel } from '../components/CustomerPurchaseHistoryPanel';
import { SalesSourcePane } from '../components/SalesSourcePane';
import { PhotographyQueuePanel } from '../components/PhotographyQueuePanel';
import { type CustomerSheetSnapshotRow, type CustomerSheetSnapshotSummary } from '../components/RecentSheetsPanel';
import { useSearchParams } from 'react-router-dom';
import { SALES_VIEW_MERCURY } from '../featureFlags';
import { SalesBrowseMode } from './sales/SalesBrowseMode';
import { SalesBuildMode } from './sales/SalesBuildMode';
import { SaleLineExceptionControls } from '../components/SaleLineExceptionControls';
import { SalePrePostStrip, type SalePrePostCheck, type SalePrePostLine } from '../components/SalePrePostStrip';
import { SnapshotRetryPill } from '../components/SnapshotRetryPill';
import { ReceiptPanel } from '../components/ReceiptPanel';
import { LandedCostExceptionCell } from '../components/cells/sales/LandedCostExceptionCell';
import { DisplayNameCell } from '../components/cells/sales/DisplayNameCell';
import { BatchCodeCell } from '../components/cells/sales/BatchCodeCell';
import { MarkupCell, markupValueSetter } from '../components/cells/sales/MarkupCell';
import { DerivedCogsCell } from '../components/cells/sales/DerivedCogsCell';
import { PickStatusCell } from '../components/cells/sales/PickStatusCell';
import { WhyShownCell } from '../components/cells/sales/WhyShownCell';
import { FulfillmentActionsCell } from '../components/cells/sales/FulfillmentActionsCell';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useOrderSocket } from '../context/SocketContext';
import { buildSheetCsv } from '../utils/salesExport';
import { buildCustomerSheetSnapshotRows } from '../../shared/customerSheetSnapshot';
import type { GridRow, CustomerPricingRule } from '../../shared/types';
import { formatMoney, shouldShowSalesCreditIndicator } from '../components/credit/creditPanelUtils';
import { ShadowModeBanner } from '../components/credit/ShadowModeBanner';
import { buildCustomerOfferCsv } from './SalesView.csvExport';
import { parsePriceRange } from '../../shared/priceRange';
import { useSalesLineRows } from './sales/useSalesLineRows';
import { useSalePrePostChecks } from './sales/useSalePrePostChecks';

import { filterSalesOrdersByCustomer, salesButtonTitle, selectionPillText, selectVisibleSalesColumns, whyShownChips } from './SalesView.columns';
import { buildOfferText } from './SalesView.ux-f01';
import { deriveCustomerRefereeRelationships, buildConfirmPayload } from './SalesView.ux-f06';
import { SaleLineItemTypeahead, buildBindLinePayload, resolveUniqueBatch } from './SalesView.ux-f03';
import { applyCreditDisabledReason, buildApplyCreditPayload, salesOrderCellCommand } from './SalesView.ux-g03';
import { buildPurchaseHistoryChips, type PurchaseHistoryChipRow } from '../components/InventoryFinderPanel.historyChips';

// CAP-030 / TER-1508 — types matching live releaseEligibility API shape (backend now merged)

export interface ReleaseEligibilityResult {
  lineId: string;
  eligible: boolean;
  alreadyReleased: boolean;
  reasons: string[];
  pickStatus?: 'unreleased' | 'released' | 'picking' | 'picked' | 'recall_pending';
  releasedAt?: string;
}

export interface PickStatusQueryResult {
  orderId: string;
  lines: ReleaseEligibilityResult[];
  linesPicked: number;
  linesTotal: number;
}

const orderColumns: ColDef<GridRow>[] = [
  { field: 'orderNo', pinned: 'left', width: 150 },
  { field: 'customer', width: 180 },
  { field: 'status', width: 125 },
  { field: 'pricingStrategy', width: 145 },
  { field: 'total', type: 'numericColumn', width: 120 },
  { field: 'internalMargin', headerName: 'Internal margin', type: 'numericColumn', width: 145 },
  { field: 'lines', width: 95 },
  {
    field: 'linesPicked',
    headerName: 'Lines picked',
    width: 135,
    sortable: true,
    valueFormatter: (params: { value: unknown; data?: GridRow }) => {
      const data = params.data as GridRow | undefined;
      if (!data) return '';
      const total = Number(data.linesTotal ?? 0);
      const picked = Number(data.linesPicked ?? 0);
      if (!total) return '';
      return `${picked}/${total} picked`;
    },
    cellStyle: (params: { value: unknown; data?: GridRow }) => {
      const data = params.data as GridRow | undefined;
      if (!data) return null;
      const total = Number(data.linesTotal ?? 0);
      const picked = Number(data.linesPicked ?? 0);
      if (!total) return null;
      if (picked === total) return { color: '#15803d' }; // all picked
      if (picked > 0) return { color: '#b06915' }; // partial
      return null;
    }
  },
  { field: 'deliveryWindow', editable: true, minWidth: 180 }
];

const suggestionColumns: ColDef<GridRow>[] = [
  { field: 'batchCode', pinned: 'left', width: 150 },
  { field: 'name', minWidth: 180 },
  { field: 'category', width: 110 },
  { field: 'subcategory', width: 120 },
  { field: 'vendor', width: 150 },
  { field: 'availableQty', type: 'numericColumn', width: 130 },
  { field: 'unitPrice', type: 'numericColumn', width: 110 },
  { field: 'unitCost', type: 'numericColumn', width: 110 },
  { field: 'estimatedMargin', type: 'numericColumn', width: 150 },
  { field: 'tags', minWidth: 140 },
  {
    field: 'reason',
    // UX-F11 (subset) — converge the suggestions grid onto the finder's
    // visual language: the reason renders as finder-style "why" chips under
    // the same "Why shown" header the finder pane uses, so both result
    // surfaces read identically. (Full convergence — suggestions as
    // pre-filtered finder ROWS — would restructure the salesSuggestions
    // data flow into the finder pipeline; deviation reported.)
    headerName: 'Why shown',
    minWidth: 260,
    cellRenderer: WhyShownCell
  }
];

// Issue #64: surface cost-range / COGS / below-floor / vendor-approval state.
// The badge cell stays read-only — operators act on these via the line
// expansion buttons (Pick COGS / Set reason / Resolve approval).
const exceptionBadgeColumn: ColDef<GridRow> = {
  field: 'rangeBadge',
  headerName: 'Range / Exceptions',
  width: 220,
  valueGetter: (params) => {
    const row = params.data as GridRow | undefined;
    if (!row) return '';
    const parts: string[] = [];
    if (row.priceRange) parts.push(`Range $${row.priceRange}`);
    if (row.unitCostResolved === false) parts.push('COGS unresolved');
    if (row.belowFloorReason) parts.push(`Below floor: ${row.belowFloorReason}`);
    if (row.vendorApprovalState && row.vendorApprovalState !== 'none') {
      parts.push(`Vendor approval: ${row.vendorApprovalState}`);
    }
    return parts.join(' · ');
  }
};

/** Pick statuses where the sales-side row should be read-only (operator must Recall first to edit). */
const RELEASED_PICK_STATUSES = new Set(['released', 'picking', 'picked', 'recall_pending']);

function isRowEditLocked(params: { data?: GridRow }): boolean {
  return RELEASED_PICK_STATUSES.has(String(params.data?.pickStatus ?? ''));
}

const lineColumns: ColDef<GridRow>[] = [
  { field: 'legacyStatusMarker', headerName: 'Raw', editable: (params) => !isRowEditLocked(params), width: 90, pinned: 'left' },
  {
    field: 'displayName',
    headerName: 'Product name',
    editable: false,
    minWidth: 190,
    pinned: 'left',
    cellRenderer: DisplayNameCell
  },
  { field: 'itemName', headerName: 'Canonical', editable: (params) => !isRowEditLocked(params), minWidth: 170 },
  { field: 'subcategory', headerName: 'Subcategory', width: 120 },
  {
    field: 'batchCode',
    headerName: 'Source',
    width: 180,
    // UX-F04 — "Already in order" chip when this line's source key
    // (sourceRowKey || batchId, same key the postSalesOrder duplicate-source
    // guard uses) appears on another line of the same order. The __dupSource
    // flag is computed in lineRowsWithRule via duplicateSourceLineIds().
    cellRenderer: BatchCodeCell
  },
  { field: 'unresolvedSourceText', headerName: 'Unresolved source', editable: (params) => !isRowEditLocked(params), minWidth: 170 },
  { field: 'qty', editable: (params) => !isRowEditLocked(params), type: 'numericColumn', width: 95 },
  { field: 'unitPrice', editable: (params) => !isRowEditLocked(params), type: 'numericColumn', width: 115 },
  { field: 'unitCost', headerName: 'Cost', type: 'numericColumn', width: 105 },
  {
    field: 'markup',
    headerName: 'Markup $',
    headerClass: 'pricing-col-header',
    width: 100,
    editable: (params) => !isRowEditLocked(params),
    cellRenderer: MarkupCell,
    valueSetter: markupValueSetter
  },
  {
    field: 'markupPct',
    headerName: 'Markup %',
    headerClass: 'pricing-col-header',
    width: 85,
    editable: false,
    valueGetter: (params) => {
      const row = params.data as GridRow | undefined;
      if (!row) return null;
      const markup = Number((row as Record<string, unknown>).markup ?? 0);
      const cogs = parsePriceRange(row.priceRange as string | null)
        ? Number(row.unitPrice ?? 0) - markup   // range: derivedCogs
        : Number(row.unitCost ?? 0);             // fixed: known COGS
      if (!cogs || cogs <= 0) return null;
      return markup / cogs;
    },
    valueFormatter: (params) =>
      params.value != null ? `${(Number(params.value) * 100).toFixed(1)}%` : '—'
  },
  {
    field: 'derivedCogs',
    headerName: 'COGS',
    headerClass: 'pricing-col-header',
    width: 130,
    editable: false,
    cellRenderer: DerivedCogsCell
  },
  // #64 PR-2: vendor-warning chip for any projected below-range COGS
  // exception. Renders nothing for in-range lines. Uses the existing
  // `.selection-pill.warning` amber styling — no new colors. The renderer is
  // unit-tested in `LandedCostExceptionChip.test.tsx`.
  {
    field: 'landedCostExceptionReason',
    headerName: 'COGS exception',
    width: 200,
    sortable: true,
    cellRenderer: LandedCostExceptionCell
  },
  exceptionBadgeColumn,
  { field: 'availableQty', headerName: 'Avail', type: 'numericColumn', width: 105 },
  boolCol('packed', { headerName: 'Packed', editable: (params) => !isRowEditLocked(params), width: 105 }),
  boolCol('inventoryPosted', { headerName: 'Inv Posted', editable: (params) => !isRowEditLocked(params), width: 125 }),
  boolCol('paymentFollowup', { headerName: 'Pay/F-up', editable: (params) => !isRowEditLocked(params), width: 125 }),
  { field: 'validationIssues', headerName: 'Fix', minWidth: 220 },
  {
    field: 'pickStatus',
    headerName: 'Pick status',
    width: 140,
    sortable: true,
    filter: true,
    cellRenderer: PickStatusCell
  },
  {
    field: 'releasedAt',
    headerName: 'Released at',
    width: 160,
    hide: true, // hidden by default per spec
    valueFormatter: (params: { value: unknown }) => params.value ? new Date(String(params.value)).toLocaleString('en-US') : '',
  },
  { field: 'status', width: 115 }
];

const EMPTY_ROWS: GridRow[] = [];

// UX-A15 — exact shape sent to createCustomerSheetSnapshot, captured at
// export time so "Retry snapshot" replays the identical call.
type SnapshotPayload = {
  customerId: string;
  mode: 'internal' | 'catalog';
  rows: ReturnType<typeof buildCustomerSheetSnapshotRows>;
};

// Phase 3A — stable fulfillmentActions column definition (TER-1671 pattern).
// cellRendererParams is threaded at mount time so the cell component stays
// module-scope and AG Grid receives stable column identity.
const fulfillmentActionsColumnDef: ColDef<GridRow> = {
  headerName: 'Pick',
  colId: 'fulfillmentActions',
  width: 190,
  pinned: 'right',
  sortable: false,
  suppressMovable: true,
  cellRenderer: FulfillmentActionsCell,
};

function moneyish(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

/**
 * LegacySalesView — the pre-Phase 3B 1813-line monolithic SalesView.
 *
 * Preserved byte-identical behind the `salesViewMercury` feature flag.
 * When the flag is OFF (default), the `SalesView` mode router delegates
 * to this component. When the flag is ON, `SalesBrowseMode` / `SalesBuildMode`
 * render this component as the primary or secondary surface.
 *
 * This function is exported so the Phase 3B mode components can import it
 * without an extra file. It SHOULD NOT be imported directly by any other
 * module — use `SalesView` (the mode router) instead.
 */
export function LegacySalesView() {

  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const selectedSalesRows = useUiStore((state) => state.selectedRows.sales);
  const selectedOrders = selectedSalesRows ?? EMPTY_ROWS;
  const [customerId, setCustomerId] = useState('');
  // A8 spec §10.1 — "Open Validation" focuses the exception controls for the
  // selected line(s) in a selection-bound WorkspacePanel below the line grid.
  const [validationFocusIds, setValidationFocusIds] = useState<string[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<GridRow[]>([]);
  const [selectedLines, setSelectedLines] = useState<GridRow[]>([]);
  const [sheetMode, setSheetMode] = useState<'internal' | 'catalog'>('internal');
  const [draftItem, setDraftItem] = useState('');
  const [draftQty, setDraftQty] = useState('1');
  const [addedBatchIds, setAddedBatchIds] = useState<Set<string>>(new Set());
  const [saleToolsOpen, setSaleToolsOpen] = useState(false);
  const [autoStartedCustomerIds, setAutoStartedCustomerIds] = useState<Set<string>>(new Set());
  const [dismissedCreditIndicators, setDismissedCreditIndicators] = useState<Set<string>>(new Set());
  const [exportError, setExportError] = useState<string | null>(null);
  // UX-A15 — exact createCustomerSheetSnapshot payload captured at export
  // time, so "Retry snapshot" re-runs the EXISTING snapshot call path with
  // the same rows the downloaded file contained (never re-derived rows that
  // may have changed since the export).
  const [lastSnapshotPayload, setLastSnapshotPayload] = useState<SnapshotPayload | null>(null);
  // TER-1617 F-23: track whether the operator dismissed the customer-scope chip
  // for the Sales Orders pane. Resets automatically when the active customer changes.
  const [customerFilterDismissed, setCustomerFilterDismissed] = useState(false);
  // CAP-030 / TER-1508 — edit confirmation for released lines
  // GH #403: lineIds is an array so removeSelectedLines can batch multiple
  // released-line deletions into a single confirmation dialog instead of
  // having each setState call overwrite the previous one.
  const [pendingLineEdit, setPendingLineEdit] = useState<{
    type: 'qty' | 'remove';
    lineIds: string[];
    field?: string;
    newValue?: unknown;
    lineStatus?: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  // GH #323: focus trap for warehouse alert dialog
  const warehouseAlertRef = useFocusTrap<HTMLDivElement>(Boolean(pendingLineEdit), () => setPendingLineEdit(null));
  // GH #352: repeat last order loading state
  const [repeatLoading, setRepeatLoading] = useState(false);
  // UX-G03 — Sale tray "Apply credit" inputs (manager-gated applyClientCredit).
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  // UX-F06 — referee relationship selected for credit accrual at confirm time.
  // Cleared when the order is posted or the customer changes.
  const [refereeRelationshipId, setRefereeRelationshipId] = useState('');
  // GH #351: suggestion filter state
  const [suggestionCategory, setSuggestionCategory] = useState('');
  const [suggestionPriceBracket, setSuggestionPriceBracket] = useState('');
  const [suggestionAgingOnly, setSuggestionAgingOnly] = useState(false);
  const suggestionFiltersActive = Boolean(suggestionCategory || suggestionPriceBracket || suggestionAgingOnly);
  // SX-B05: suggestions collapsed by default with live count summary
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(true);
  const activeCustomerId = useUiStore((state) => state.activeCustomerId);
  const activeQuickLaunch = useUiStore((state) => state.activeQuickLaunch);
  const setActiveCustomerId = useUiStore((state) => state.setActiveCustomerId);
  const salesRequestText = useUiStore((state) => state.salesRequestText);
  // #63: operator margin visibility toggle (Sales workspace only — customer-
  // facing exports are independently gated, see SalesView.csvExport.ts).
  const showMargin = useUiStore((state) => state.showMargin);
  const setShowMargin = useUiStore((state) => state.setShowMargin);
  const setSalesSheetState = useUiStore((state) => state.setSalesSheetState);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const pushToast = useUiStore((state) => state.pushToast);
  const visibleOrderColumns = useMemo(() => selectVisibleSalesColumns(showMargin, orderColumns), [showMargin]);
  const visibleSuggestionColumns = useMemo(() => selectVisibleSalesColumns(showMargin, suggestionColumns), [showMargin]);
  const visibleLineColumns = useMemo(() => selectVisibleSalesColumns(showMargin, lineColumns), [showMargin]);
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const orders = trpc.queries.grid.useQuery({ view: 'sales' });
  const reference = trpc.queries.reference.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false });
  const workspace = trpc.queries.customerWorkspace.useQuery({ customerId: customerId || '00000000-0000-0000-0000-000000000000' }, { enabled: Boolean(customerId) });
  const suggestions = trpc.queries.salesSuggestions.useQuery({
    customerId: customerId || undefined,
    category: suggestionCategory || undefined,
    priceBracket: suggestionPriceBracket || undefined,
    agingOnly: suggestionAgingOnly || undefined
  });
  const creditStatus = trpc.credit.customerCreditStatus.useQuery(
    { customerId },
    { enabled: Boolean(customerId && (me.data?.role === 'manager' || me.data?.role === 'owner')) }
  );
  // GH #352: check for most recent customer sheet to surface "Repeat last order"
  const recentSheetList = trpc.queries.recentCustomerSheets.useQuery(
    { customerId: customerId || '00000000-0000-0000-0000-000000000000', limit: 1 },
    { enabled: Boolean(customerId) }
  );
  const lastSheet = (recentSheetList.data?.[0] ?? null) as CustomerSheetSnapshotSummary | null;
  // UX-F07 — same procedure + input CustomerPurchaseHistoryPanel uses, so
  // React Query shares one cache entry (no new procedures, no extra fetch
  // once the disclosure has loaded). Feeds the finder's history chips.
  const purchaseHistory = trpc.queries.customerPurchaseHistory.useQuery(
    { customerId: customerId || '00000000-0000-0000-0000-000000000000', limit: 200 },
    { enabled: Boolean(customerId), staleTime: 60_000, refetchOnWindowFocus: false }
  );
  const historyChips = useMemo(
    () => buildPurchaseHistoryChips((purchaseHistory.data ?? []) as PurchaseHistoryChipRow[]),
    [purchaseHistory.data]
  );
  const utils = trpc.useUtils();
  const { runCommand, isRunning } = useCommandRunner();
  const workspaceOrder = workspace.data?.orders.find((order) => ['draft', 'confirmed'].includes(String(order.status))) ?? workspace.data?.orders[0];

  // GH #349: computed open invoice / payment summary for the customer panel
  const openInvoices = useMemo(() => {
    const invoices = (workspace.data?.invoices ?? []) as Array<{ status: string; total: unknown; amountPaid: unknown }>;
    return invoices.filter((inv) => inv.status === 'open' || inv.status === 'partial');
  }, [workspace.data?.invoices]);

  const openInvoiceBalance = useMemo(() => {
    return openInvoices.reduce((sum, inv) => {
      return sum + (Number(inv.total ?? 0) - Number(inv.amountPaid ?? 0));
    }, 0);
  }, [openInvoices]);

  const lastPayment = useMemo(() => {
    const payments = workspace.data?.payments ?? [];
    return payments.length > 0 ? payments[0] : null;
  }, [workspace.data?.payments]);

  const selectedOrder = selectedOrders[0] ?? workspaceOrder;
  const orderLines = trpc.queries.salesOrderLines.useQuery(
    { orderId: String(selectedOrder?.id ?? '00000000-0000-0000-0000-000000000000') },
    { enabled: Boolean(selectedOrder?.id), refetchInterval: 30_000 }
  );
  const selectedOrderStatus = String(selectedOrder?.status ?? '');

  // GH #329: subscribe to the order-specific socket room when an order is
  // selected so we receive sales:order:*:line:changed events in real time.
  const { subscribeOrder, unsubscribeOrder } = useOrderSocket();
  const _selectedOrderId = selectedOrder?.id ? String(selectedOrder.id) : null;
  useEffect(() => {
    if (!_selectedOrderId) return;
    subscribeOrder(_selectedOrderId);
    return () => { unsubscribeOrder(_selectedOrderId); };
  }, [_selectedOrderId, subscribeOrder, unsubscribeOrder]);

  // A8: the Sales Orders grid, line grid, and suggestions grid all share the
  // 'sales' grid-filter slot but render in mutually exclusive branches.
  // Clear the slot (and any validation focus) on mode switch so an order-
  // status preset set in orders mode cannot silently filter line rows.
  // UX-F06: also clear referee selection when customer changes so stale
  // relationships from a previous customer don't carry over.
  useEffect(() => {
    setGridFilter('sales', '');
    setValidationFocusIds([]);
    setRefereeRelationshipId('');
  }, [customerId, setGridFilter]);

  const lineRowsWithRule = useSalesLineRows({
    orderLines: orderLines.data,
    customers: reference.data?.customers as ReadonlyArray<Record<string, unknown>> | undefined,
    defaultPricingRule: reference.data?.defaultPricingRule,
    customerId
  });

  // CAP-030 / TER-1508 — release eligibility per order (live — backend merged)
  const blankOrderId = '00000000-0000-0000-0000-000000000000';
  const releaseEligibility = trpc.queries.releaseEligibility.useQuery(
    { orderId: String(selectedOrder?.id ?? blankOrderId) },
    { enabled: Boolean(selectedOrder?.id) }
  );

  // TER-1671: stable ref for releaseEligibility.data so column identity
  // does not depend on the array reference (new on every fetch).
  const eligibilityDataRef = useRef(releaseEligibility.data);
  eligibilityDataRef.current = releaseEligibility.data;

  // Phase 3A — replace fulfillmentActionsColumn useMemo with module-scope
  // column definition + cellRendererParams (TER-1671 stable-identity pattern).
  const lineGridColumns = useMemo(
    () => [...visibleLineColumns, {
      ...fulfillmentActionsColumnDef,
      cellRendererParams: { canWrite, isRunning, runCommand, eligibilityDataRef }
    }],
    [visibleLineColumns, canWrite, isRunning, runCommand]
  );

  // TER-1617 F-23: reset the dismissed flag whenever the active customer changes
  // so the chip re-appears for a freshly-selected customer.
  useEffect(() => {
    setCustomerFilterDismissed(false);
  }, [activeCustomerId]);

  // TER-1617 F-23: derive the active customer name for the filter chip label.
  const activeCustomerName = useMemo(
    () => reference.data?.customers.find((c) => c.id === activeCustomerId)?.name ?? null,
    [reference.data, activeCustomerId]
  );

  // UX-F06 — derive active referee relationships for the current customer so
  // the confirm-time pill can show "Referee: <name> — credit will accrue".
  // Reference query already loaded (staleTime 60s). Uses
  // deriveCustomerRefereeRelationships helper from SalesView.ux-f06.ts.
  const customerRefereeRelationships = useMemo(
    () => deriveCustomerRefereeRelationships(
      (reference.data?.refereeRelationships ?? []) as any[],
      customerId
    ),
    [reference.data?.refereeRelationships, customerId]
  );

  // UX-F03 — the typeahead and commit-time resolver search the SAME batch
  // list the finder pane searches (queries.reference availableBatches).
  const finderBatches = useMemo(
    () => (reference.data?.availableBatches ?? []) as InventoryFinderBatch[],
    [reference.data?.availableBatches]
  );

  // GH #352: live inventory map for matching snapshot rows to current batches
  const liveByBatchId = useMemo(() => {
    const map = new Map<string, InventoryFinderBatch>();
    for (const batch of (reference.data?.availableBatches ?? []) as InventoryFinderBatch[]) {
      if (batch.id) map.set(String(batch.id), batch);
    }
    return map;
  }, [reference.data?.availableBatches]);

  // TER-1617 F-23: filter the Sales Orders pane rows to the active customer
  // when one is set and the operator has not dismissed the chip. This is a
  // client-side view filter only — the underlying query is unchanged.
  const salesOrderRows = useMemo<GridRow[]>(
    () => filterSalesOrdersByCustomer(
      (orders.data ?? []) as GridRow[],
      customerFilterDismissed ? null : activeCustomerId
    ),
    [orders.data, activeCustomerId, customerFilterDismissed]
  );

  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';
  const balance = Number(workspace.data?.customer?.balance ?? 0);
  const orderTotal = Number(selectedOrder?.total ?? 0);
  const manualLimit = creditStatus.data?.customer.creditLimit ?? 0;
  const engineRecommendation = creditStatus.data?.latestAssessment?.recommendedLimit ?? null;
  const showCreditIndicator = isManagerOrOwner && selectedOrder != null && shouldShowSalesCreditIndicator({
    balance,
    orderTotal,
    manualLimit,
    engineRecommendation,
    source: creditStatus.data?.customer.creditLimitSource ?? '',
  });
  const indicatorKey = `${customerId}:${String(selectedOrder?.id ?? '')}`;
  const isIndicatorDismissed = dismissedCreditIndicators.has(indicatorKey);

  // UX-F02 — pre-post checklist data. Reads the SAME inputs the server gates
  // read: customers.balance / customers.creditLimit + sales_orders.total for
  // the advisory credit warning (commandBus.ts confirm ~3542 / post ~3665),
  // and the order's own line rows for the duplicate-source, pricing/COGS, and
  // inventory-resolution refusals (see SalePrePostStrip.tsx for the exact
  // commandBus line citations). Purely informational — the strip never
  // changes any button's disabled logic.
  const { checks: prePostChecks, issuesByLineId: prePostLineIssues } = useSalePrePostChecks({
    selectedOrder: selectedOrder as { total?: unknown } | null | undefined,
    customer: workspace.data?.customer as { balance: number; creditLimit: number } | null | undefined,
    lines: lineRowsWithRule as SalePrePostLine[]
  });
  // Shown for pre-post statuses only: draft (Confirm ahead) and confirmed
  // (Post ahead — Post itself lives on the Orders §10.4 primary).
  const showPrePostStrip = Boolean(
    customerId && selectedOrder && ['draft', 'confirmed'].includes(selectedOrderStatus) && prePostChecks.length
  );
  // ✗ deep-links: failing lines focus the Line validation panel; the credit
  // advisory opens the customer drawer (balance tab is the default for
  // customer entities).
  function focusPrePostCheck(check: SalePrePostCheck) {
    if (check.failingLineIds.length) setValidationFocusIds(check.failingLineIds);
  }
  function openCreditPanel() {
    if (!customerId) return;
    setDrawerEntity('sales', 'customer', customerId);
    setDrawerState('sales', 'standard');
  }

  // GH #352: repeat last order — fetch the most recent customer sheet
  // snapshot and add all available items to the current draft order.
  async function repeatLastOrder() {
    if (!lastSheet || !selectedOrder || !customerId) return;
    setRepeatLoading(true);
    try {
      const detail = await utils.queries.customerSheetSnapshotById.fetch({
        id: lastSheet.id,
        customerId
      });
      const rows = (detail?.rows ?? []) as CustomerSheetSnapshotRow[];
      let added = 0;
      for (const row of rows) {
        const batchId = row.batchId ? String(row.batchId) : '';
        const live = batchId ? liveByBatchId.get(batchId) ?? null : null;
        if (!live) continue;
        const available = Number(live.availableQty ?? 0);
        if (available <= 0) continue;
        const snapshotQty = Number(row.qty ?? NaN);
        const snapshotAvail = Number(row.availableQty ?? NaN);
        let desired = 1;
        if (Number.isFinite(snapshotQty) && snapshotQty > 0) desired = snapshotQty;
        else if (Number.isFinite(snapshotAvail) && snapshotAvail > 0) desired = snapshotAvail;
        const qty = Math.max(0, Math.min(desired, available));
        if (qty <= 0) continue;
        const snapshotPrice = Number(row.unitPrice ?? NaN);
        const batch: InventoryFinderBatch = Number.isFinite(snapshotPrice)
          ? { ...live, unitPrice: snapshotPrice }
          : live;
        await addFinderBatch(batch, qty);
        added++;
      }
      if (added > 0) {
        pushToast(`Repeated last order: ${added} item${added === 1 ? '' : 's'} added.`);
        await orderLines.refetch();
      } else {
        pushToast('No items from last order are currently available.', 'info');
      }
    } catch (err) {
      console.error('Repeat last order failed', err);
      pushToast('Failed to repeat last order.', 'error');
    } finally {
      setRepeatLoading(false);
    }
  }

  const sheetRows = useMemo(() => selectedSuggestions.slice(0, 8), [selectedSuggestions]);

  // TER-1569: sync live sales sheet state to the shared Zustand slice so the
  // ContextDrawer Output/Pricing tabs can read it without prop drilling.
  useEffect(() => {
    setSalesSheetState({
      orderId: selectedOrder?.id ? String(selectedOrder.id) : null,
      sheetRows,
      sheetMode,
      exportError,
    });
  }, [setSalesSheetState, selectedOrder?.id, sheetRows, sheetMode, exportError]);

  const salesOrderExpansionConfig = useMemo(
    () => ({
      enabled: true,
      actionsRenderer: (row: GridRow) => (
        <>
          <button
            className="primary-button compact-action"
            disabled={isRunning || !canWrite || String(row.status ?? '') !== 'draft'}
            title={
              !canWrite ? 'Write access required' :
              String(row.status ?? '') !== 'draft' ? 'Order must be in draft status to confirm' :
              undefined
            }
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('confirmSalesOrder', { orderId: row.id }, 'Confirm sales order');
            }}
            type="button"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Confirm order
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || !canWrite || String(row.status ?? '') !== 'confirmed'}
            title={
              !canWrite ? 'Write access required' :
              String(row.status ?? '') !== 'confirmed' ? 'Order must be confirmed before reserving inventory' :
              undefined
            }
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('reserveInventoryForOrder', { orderId: row.id }, 'Reserve exact inventory for order');
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Reserve inventory
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || !canWrite || ['fulfilled', 'shipped', 'cancelled'].includes(String(row.status ?? ''))}
            title={
              !canWrite ? 'Write access required' :
              ['fulfilled', 'shipped', 'cancelled'].includes(String(row.status ?? '')) ? 'Cannot cancel a fulfilled, shipped, or already-cancelled order' :
              undefined
            }
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('cancelSalesOrder', { orderId: row.id }, 'Cancel sales order');
            }}
            type="button"
          >
            Cancel order
          </button>
        </>
      )
    }),
    [isRunning, runCommand, canWrite]
  );

  const salesLineExpansionConfig = useMemo(
    () => ({
      enabled: true,
      actionsRenderer: (row: GridRow) => (
        <>
          {/* Issue #64 reviewer fix: inline controls replace the previous
              window.prompt chains. SaleLineExceptionControls also gates the
              entire exception strip off when showMargin=false so a customer-
              facing screen-share posture cannot leak cost / floor / vendor
              approval context. */}
          <SaleLineExceptionControls
            row={row}
            isRunning={isRunning}
            canWrite={canWrite}
            showMargin={showMargin}
            runCommand={runCommand}
          />
          {/* GH #353 / CAP-030 / TER-1508 — release for picking, gated by live releaseEligibility.
              Hidden when already released (Recall from pick appears instead).
              Disabled when explicitly ineligible; enabled optimistically while eligibility loads. */}
          {(() => {
            const elig = releaseEligibility.data?.find((e) => e.lineId === row.id);
            // Hide entirely once released — Recall button takes over
            if (elig?.alreadyReleased) return null;
            return (
              <button
                className="primary-button compact-action"
                disabled={isRunning || !canWrite || (elig != null && !elig.eligible)}
                title={elig?.eligible === false ? (elig.reasons.join('; ') || 'Not eligible for pick release') : 'Release for warehouse picking'}
                onClick={() => {
                  if (!row.id || row.id.trim() === '') return;
                  runCommand('releaseLineForPicking', { lineId: row.id }, 'Release sales line for picking');
                }}
                type="button"
              >
                Release for picking
              </button>
            );
          })()}
          {['released', 'picking', 'picked', 'recall_pending'].includes(String(row.pickStatus ?? '')) ? (
            <button
              className="secondary-button compact-action"
              disabled={isRunning || !canWrite}
              title="Recall this line from warehouse picking"
              onClick={() => {
                if (!row.id || row.id.trim() === '') return;
                runCommand('recallLineFromPicking', { lineId: row.id }, 'Recall pick line');
              }}
              type="button"
            >
              Recall from pick
            </button>
          ) : null}
          <button
            className="secondary-button compact-action"
            disabled={isRunning || !canWrite}
            title={!canWrite ? 'Write access required' : undefined}
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('updateSalesOrderLine', { lineId: row.id, packed: true }, 'Pack line');
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Pack
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || !canWrite}
            title={!canWrite ? 'Write access required' : undefined}
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('updateSalesOrderLine', { lineId: row.id, inventoryPosted: true }, 'Post to inventory');
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Post inv
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || !canWrite}
            title={!canWrite ? 'Write access required' : undefined}
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('updateSalesOrderLine', { lineId: row.id, paymentFollowup: true }, 'Payment follow-up');
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Pay F-up
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || !canWrite}
            title={!canWrite ? 'Write access required' : undefined}
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              const lineStatus = String(row.pickStatus ?? 'unreleased');
              const isReleased = ['released', 'picking'].includes(lineStatus);
              if (isReleased) {
                setPendingLineEdit({
                  type: 'remove',
                  lineIds: [row.id],
                  lineStatus,
                  onConfirm: async () => {
                    await runCommand('removeSalesOrderLine', { lineId: row.id }, 'Remove line (post-release warehouse notified)');
                  }
                });
              } else {
                runCommand('removeSalesOrderLine', { lineId: row.id }, 'Remove line');
              }
            }}
            type="button"
          >
            Remove
          </button>
        </>
      )
    }),
    [isRunning, runCommand, canWrite, showMargin, releaseEligibility.data]
  );

  // Sync customer selection from keel bar (global header) to local state.
  // Also clears local state when keel bar deselects the customer.
  useEffect(() => {
    if (!activeCustomerId && customerId) {
      setCustomerId('');
    } else if (activeCustomerId && activeCustomerId !== customerId) {
      setCustomerId(activeCustomerId);
    }
  }, [activeCustomerId, customerId]);

  useEffect(() => {
    if (salesRequestText && !draftItem) setDraftItem(salesRequestText);
  }, [draftItem, salesRequestText]);


  useEffect(() => {
    if (!customerId || !canWrite || workspace.isFetching || workspaceOrder || autoStartedCustomerIds.has(customerId)) return;
    setAutoStartedCustomerIds((current) => new Set(current).add(customerId));
    void runCommand('createSalesOrder', { customerId }, 'Auto-start customer sale workspace').then((result) => {
      if (result.ok) {
        setActiveCustomerId(customerId);
        // TER-1571: after workspace refetch, auto-activate the drawer for the new order.
        void workspace.refetch().then((refreshed) => {
          const newOrder = refreshed.data?.orders?.[0];
          if (newOrder?.id) {
            setDrawerEntity('sales', 'salesOrder', String(newOrder.id));
            setDrawerState('sales', 'standard');
          }
        });
      }
    });
  }, [autoStartedCustomerIds, canWrite, customerId, runCommand, setActiveCustomerId, setDrawerEntity, setDrawerState, workspace, workspace.isFetching, workspaceOrder]);

  async function createOrder() {
    if (!customerId) return;
    const result = await runCommand('createSalesOrder', { customerId }, 'Create customer-aware order from sales view');
    if (result.ok) setActiveCustomerId(customerId);
  }

  async function addSuggestion() {
    if (!selectedOrder || !selectedSuggestions[0]) return;
    await runCommand('addSalesOrderLine', { orderId: selectedOrder.id, batchId: selectedSuggestions[0].id, qty: 1, sourceRowKey: selectedSuggestions[0].batchCode }, 'Add suggested inventory to order');
    setAddedBatchIds((current) => new Set(current).add(selectedSuggestions[0].id));
  }

  async function addFinderBatch(batch: InventoryFinderBatch, qty: number) {
    if (!selectedOrder) return;
    await runCommand(
      'addSalesOrderLine',
      {
        orderId: selectedOrder.id,
        batchId: batch.id,
        qty,
        unitPrice: batch.unitPrice,
        sourceRowKey: batch.batchCode
      },
      'Add inventory finder row to order'
    );
    setAddedBatchIds((current) => new Set(current).add(batch.id));
  }

  async function priceAndConfirm() {
    if (!selectedOrder) return;
    await runCommand('priceSalesOrder', { orderId: selectedOrder.id, strategy: 'standard' }, 'Sales view pricing preview');
    // UX-F06: wire referee relationship into confirm when operator selected one.
    // Uses buildConfirmPayload helper (SalesView.ux-f06.ts) for testability.
    const confirmPayload = buildConfirmPayload(String(selectedOrder.id), refereeRelationshipId);
    await runCommand('confirmSalesOrder', confirmPayload, 'Confirm sales order');
    setRefereeRelationshipId('');
  }

  async function reserveOrder() {
    if (!selectedOrder) return;
    await runCommand('reserveInventoryForOrder', { orderId: selectedOrder.id }, 'Reserve exact inventory for order');
    await orderLines.refetch();
  }

  async function removeSelectedLines() {
    // GH #403: collect released lines for batched confirmation instead of
    // overwriting pendingLineEdit on each iteration.
    const selectedGridRows: GridRow[] = selectedLines.map(l => l as GridRow);
    const unreleased = selectedGridRows.filter(l => !['released', 'picking'].includes(String(l.pickStatus ?? 'unreleased')));
    const released = selectedGridRows.filter(l => ['released', 'picking'].includes(String(l.pickStatus ?? 'unreleased')));

    // Remove unreleased lines immediately — no warehouse confirmation needed.
    for (const line of unreleased) {
      await runCommand('removeSalesOrderLine', { lineId: line.id }, 'Remove selected sales line');
    }

    if (released.length > 0) {
      // Batch all released lines into a single confirmation dialog.
      const releasedLineIds = released.map(l => l.id);
      setPendingLineEdit({
        type: 'remove',
        lineIds: releasedLineIds,
        lineStatus: 'released',
        onConfirm: async () => {
          for (const lineId of releasedLineIds) {
            await runCommand('removeSalesOrderLine', { lineId }, 'Remove selected sales line (post-release)');
          }
          await orderLines.refetch();
        }
      });
    }

    if (unreleased.length > 0) await orderLines.refetch();
  }

  async function addDraftLine() {
    if (!selectedOrder || !draftItem.trim()) return;
    await runCommand(
      'addSalesOrderLine',
      {
        orderId: selectedOrder.id,
        itemName: draftItem,
        unresolvedSourceText: draftItem,
        qty: Number(draftQty) || 1,
        unitPrice: 0,
        legacyStatusMarker: ''
      },
      'Add unresolved customer workspace line'
    );
    setDraftItem('');
    setDraftQty('1');
    await orderLines.refetch();
  }

  // UX-F03 — typeahead pick on the line-entry input: binds inventory through
  // the SAME addSalesOrderLine path the finder pane uses (qty capped to
  // available, sourceRowKey duplicate guard included via addFinderBatch).
  async function pickDraftBatch(batch: InventoryFinderBatch) {
    if (!selectedOrder) return;
    const requested = Math.max(1, Number(draftQty) || 1);
    const available = Number(batch.availableQty ?? 0);
    await addFinderBatch(batch, Math.min(requested, available || requested));
    setDraftItem('');
    setDraftQty('1');
    await orderLines.refetch();
  }

  // UX-G03 — Sales Orders grid inline commit. The deliveryWindow column was
  // editable here but had NO commit handler (edits silently went nowhere);
  // it now runs the same setDeliveryWindow command OrdersView uses.
  async function onOrderCellCommit(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.oldValue === event.newValue) return;
    const command = salesOrderCellCommand(event.colDef.field, event.data.id, event.newValue);
    if (!command) return;
    await runCommand(command.name, command.payload, command.description);
    await orders.refetch();
  }

  async function onLineCommit(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;

    // UX-F03 — committed item-cell shorthand resolves to inventory when the
    // finder search yields a UNIQUE match; zero/ambiguous matches fall
    // through and persist as unresolved text (needs_resolution — feeds the
    // validation panel and the pre-post strip's "inventory resolved" check).
    if (event.colDef.field === 'unresolvedSourceText') {
      const match = resolveUniqueBatch(finderBatches, String(event.newValue ?? ''));
      if (match) {
        await runCommand(
          'updateSalesOrderLine',
          buildBindLinePayload(String(event.data.id), match, Number(event.data.unitPrice ?? 0)),
          'Resolve sale line to inventory (item-cell shorthand)'
        );
        setAddedBatchIds((current) => new Set(current).add(String(match.id)));
        await orderLines.refetch();
        return;
      }
    }

    // CAP-030 / TER-1508: intercept qty changes on released/picking lines
    const lineStatus = String(event.data.pickStatus ?? 'unreleased');
    const isReleased = ['released', 'picking', 'picked', 'recall_pending'].includes(lineStatus);
    const isQtyOrRemoval = event.colDef.field === 'qty';

    if (isReleased && isQtyOrRemoval) {
      setPendingLineEdit({
        type: 'qty',
        lineIds: [event.data.id],
        field: event.colDef.field,
        newValue: event.newValue,
        lineStatus,
        onConfirm: async () => {
          await runCommand('updateSalesOrderLine', { lineId: event.data!.id, [event.colDef.field!]: event.newValue }, `Inline sales line edit (post-release): ${event.colDef.field}`);
          await orderLines.refetch();
        }
      });
      return; // don't run immediately — wait for confirmation
    }

    await runCommand('updateSalesOrderLine', { lineId: event.data.id, [event.colDef.field]: event.newValue }, `Inline sales line edit: ${event.colDef.field}`);
    await orderLines.refetch();
  }

  async function toggleLine(field: 'packed' | 'inventoryPosted' | 'paymentFollowup', value: boolean) {
    for (const line of selectedLines) await runCommand('updateSalesOrderLine', { lineId: line.id, [field]: value }, `Toggle ${field} from customer workspace`);
    await orderLines.refetch();
  }

  // CAP-030 / TER-1508 — bulk release via releaseLinesForPicking (single
  // transactional command). Extracted verbatim from the former inline
  // selection-strip button so the StatusActionBar table can reuse it (A8).
  function releaseEligibleRows(rows: GridRow[]): GridRow[] {
    return rows.filter((r) => {
      const elig = releaseEligibility.data?.find((e) => e.lineId === r.id);
      return !elig || (elig.eligible && !elig.alreadyReleased);
    });
  }

  async function releaseSelectedLines(rows: GridRow[]) {
    const total = rows.length;
    const eligible = rows.filter((r) => {
      const elig = releaseEligibility.data?.find((e) => e.lineId === r.id);
      return elig ? (elig.eligible && !elig.alreadyReleased) : false;
    });
    const skipped = total - eligible.length;
    if (eligible.length === 0) return;
    let failed = 0;
    try {
      const result = await runCommand(
        'releaseLinesForPicking',
        { lineIds: eligible.map((r) => r.id) },
        'Bulk release lines for picking'
      );
      if (!result.ok) {
        failed = eligible.length;
      }
    } catch {
      // Network/transport failure — treat all lines as failed
      failed = eligible.length;
    }
    const released = eligible.length - failed;
    const parts = [`${released} of ${total} lines released`];
    if (skipped > 0) parts.push(`${skipped} skipped (not eligible)`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (skipped > 0 || failed > 0) {
      pushToast(parts.join(' — '), failed > 0 ? 'error' : 'info');
    }
    // All released successfully — useCommandRunner already shows the server toast.
    // No supplemental toast needed for the all-success case.
  }

  const lineHasValidationIssues = (row: GridRow) =>
    Array.isArray(row.validationIssues) && (row.validationIssues as unknown[]).length > 0;

  async function exportSheet() {
    setExportError(null);
    setSalesSheetState({ exportError: null });
    const mode = sheetMode === 'internal' ? 'internal' : 'catalog';
    const csv = buildSheetCsv(sheetRows, mode, { showMargin });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = mode === 'internal' ? 'terp-operator-sales-sheet.csv' : 'terp-operator-sales-catalog.csv';
    link.click();
    URL.revokeObjectURL(url);

    // Issue #62: persist a sheet snapshot so operators can find it in the
    // Sales > Recent Sheets tab and add items back to a future draft.
    // Sanitization is also enforced server-side in createCustomerSheetSnapshot.
    if (customerId && sheetRows.length) {
      const sanitized = buildCustomerSheetSnapshotRows(
        sheetRows as unknown as Array<Record<string, unknown>>,
        mode
      );
      const payload: SnapshotPayload = { customerId, mode, rows: sanitized };
      // UX-A15: capture the payload before attempting, so a failure can be
      // retried with the exact same snapshot call.
      setLastSnapshotPayload(payload);
      await attemptSnapshot(payload);
    }
  }

  // UX-A15 — single snapshot call path shared by export and "Retry snapshot".
  // Runs the existing createCustomerSheetSnapshot command; on success clears
  // the partial-failure pill, on failure (re)sets it.
  async function attemptSnapshot(payload: SnapshotPayload): Promise<boolean> {
    let ok = false;
    try {
      const result = await runCommand(
        'createCustomerSheetSnapshot',
        payload,
        `Snapshot ${payload.mode} sales sheet for customer`
      );
      ok = result.ok;
    } catch {
      ok = false;
    }
    if (ok) {
      setExportError(null);
      setSalesSheetState({ exportError: null });
    } else {
      setExportError('Sheet downloaded, but Recent Sheets snapshot failed.');
      setSalesSheetState({ exportError: 'Sheet downloaded, but Recent Sheets snapshot failed.' });
    }
    return ok;
  }

  async function retrySnapshot() {
    if (!lastSnapshotPayload) return;
    // Success feedback rides the existing command-runner toast ("Saved N item
    // sheet snapshot…"); the pill clears (or persists) via attemptSnapshot.
    await attemptSnapshot(lastSnapshotPayload);
  }





  // UX-T03 — order-level primary resolved through the same §10 decision-table
  // engine as the line-level StatusActionBar (see SalesView.orderPrimary.ts).
  // No data-status-action-primary attribute here: the ⌘↵ hotkey targets the
  // line-level bar's rendered primary, and this button must not double-fire.
  const orderPrimary = selectedOrder
    ? resolveStatusActions(
        [selectedOrder as GridRow],
        buildSalesOrderPrimaryTable({
          hasLines: Boolean(orderLines.data?.length),
          reserve: reserveOrder,
          priceConfirm: priceAndConfirm
        })
      ).primary
    : newSalePrimary(customerId, createOrder);

  // Show margin toggle button — rendered as a WorkspacePanel header action
  // when a customer is selected, or in the top control band otherwise.
  const showMarginToggle = (
    <button
      type="button"
      className="icon-button"
      data-testid="sales-show-margin-toggle"
      title={showMargin ? 'Hide margin' : 'Show margin'}
      aria-label={showMargin ? 'Hide margin' : 'Show margin'}
      aria-pressed={showMargin}
      onClick={() => setShowMargin(!showMargin)}
    >
      {showMargin ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
    </button>
  );

  return (
    <div className="view-stack">
      {canWrite ? <div className="control-band">
        <button
          className="primary-button"
          type="button"
          title={salesButtonTitle(customerId)}
          disabled={!orderPrimary || Boolean(orderPrimary.disabled)}
          onClick={() => {
            void orderPrimary?.run(selectedOrder ? [selectedOrder as GridRow] : []);
          }}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {orderPrimary?.label ?? 'New Sale'}
        </button>
        {selectionPillText(selectedOrder?.orderNo, customerId, selectedOrderStatus) && <span className="selection-pill">{selectionPillText(selectedOrder?.orderNo, customerId, selectedOrderStatus)}</span>}
        {!customerId ? showMarginToggle : null}
        {/* UX-F08 — "Repeat last order" relocated from this global control
            band to the customer workspace (Sale Builder) header, where the
            repeat-customer moment actually happens. Behavior unchanged. */}
        <button className="secondary-button compact-action" type="button" onClick={() => setSaleToolsOpen((value) => !value)} aria-expanded={saleToolsOpen}>
          {saleToolsOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          Sale tray
        </button>
      </div> : null}
      {canWrite && saleToolsOpen ? (
        /* UX-F09 — the Sale tray now carries ORDER verbs only (suggestion
           add, reserve, client credit). Output verbs (sheet/catalog toggle,
           Export, Copy offer, privacy pill, snapshot-retry pill) consolidated
           into the sheet-preview panel header below — one output surface. */
        <div className="control-band subtle-band">
          <button className="secondary-button compact-action" type="button" disabled={!selectedOrder || !selectedSuggestions.length} title={!selectedOrder ? 'Select an order first' : !selectedSuggestions.length ? 'Select one or more suggestions to add' : undefined} onClick={addSuggestion}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Add suggestion
          </button>
          <button className="secondary-button compact-action" type="button" disabled={!selectedOrder} title={!selectedOrder ? 'Select an order first' : undefined} onClick={reserveOrder}>
            Reserve
          </button>
          {/* UX-G03 — applyClientCredit daily-surface home (was reachable
              only from the RowInspector Issue sidecar). Manager-gated to
              match the command's commandMinRole. */}
          {isManagerOrOwner ? (
            <>
              <label className="field-inline">
                Credit $
                <input
                  className="input compact"
                  inputMode="decimal"
                  aria-label="Client credit amount"
                  value={creditAmount}
                  onChange={(event) => setCreditAmount(event.target.value)}
                />
              </label>
              <label className="field-inline">
                Reason
                <input
                  className="input compact"
                  aria-label="Client credit reason"
                  value={creditReason}
                  onChange={(event) => setCreditReason(event.target.value)}
                />
              </label>
              <button
                className="secondary-button compact-action"
                type="button"
                data-testid="apply-client-credit"
                disabled={isRunning || Boolean(applyCreditDisabledReason(me.data?.role, customerId, creditAmount))}
                title={applyCreditDisabledReason(me.data?.role, customerId, creditAmount) ?? 'Post a client ledger credit for this customer'}
                onClick={async () => {
                  const result = await runCommand(
                    'applyClientCredit',
                    buildApplyCreditPayload(customerId, creditAmount, creditReason),
                    'Apply client credit from sale workspace'
                  );
                  if (result.ok) {
                    setCreditAmount('');
                    setCreditReason('');
                    await workspace.refetch();
                  }
                }}
              >
                Apply credit
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {/* UX-O02: photographer->sales blocker surfacing — media-readiness counts where catalog decisions happen */}
      {customerId ? <PhotographyQueuePanel /> : null}

      {customerId ? (
        <div className="grid min-h-[520px] grid-cols-1 gap-3 xl:grid-cols-2">
          <SalesSourcePane
            customerId={customerId}
            selectedOrderId={canWrite ? String(selectedOrder?.id ?? '') : ''}
            addedBatchIds={addedBatchIds}
            initialSearch={salesRequestText}
            historyChips={historyChips}
            onAddBatch={addFinderBatch}
          />
          <WorkspacePanel
            panelId="sales:customer-workspace"
            title="Sale Builder"
            contentClassName="p-3"
            actions={canWrite ? (
              <>
                {/* UX-F08 — "Repeat last order" lives on the customer
                    workspace header (relocated from the global control band,
                    GH #352 placement fix). Same behavior and testid. */}
                {customerId && lastSheet ? (
                  <button
                    className="secondary-button compact-action"
                    type="button"
                    disabled={!selectedOrder || isRunning || repeatLoading}
                    onClick={repeatLastOrder}
                    title={!selectedOrder ? 'Select an order first' : 'Add all items from the most recent sheet to the current order'}
                    data-testid="repeat-last-order"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Repeat last order
                  </button>
                ) : null}
                {selectedOrder?.id ? (
                  <button
                    type="button"
                    className="secondary-button compact-action"
                    disabled={isRunning || !canWrite}
                    title={!canWrite ? 'Write access required' : undefined}
                    onClick={() => void runCommand('priceSalesOrder', { orderId: String(selectedOrder.id), strategy: 'customer-rule' }, 'Re-apply pricing rule')}
                    data-testid="reapply-pricing-rule"
                  >
                    ↻ Re-apply rule
                  </button>
                ) : null}
                {showMarginToggle}
              </>
            ) : undefined}
          >
            <div className="customer-workspace-header">
              <div>
                <div className="text-lg font-semibold text-ink">{workspace.data?.customer?.name ?? 'Customer'}</div>
                <div className="text-sm text-zinc-600">{workspace.data?.customer?.notes ?? 'No notes yet.'}</div>
              </div>
              <div className="customer-facts">
                <span>Balance ${moneyish(workspace.data?.customer?.balance)}</span>
                <span>Credit ${moneyish(workspace.data?.customer?.creditLimit)}</span>
                <span>{(workspace.data?.customer?.tags ?? []).join(', ')}</span>
                {openInvoices.length > 0 ? (
                  <span>{openInvoices.length} open invoice{openInvoices.length !== 1 ? 's' : ''} · ${moneyish(openInvoiceBalance)}</span>
                ) : null}
                {lastPayment ? (
                  <span>Last payment ${moneyish(lastPayment.amount)}</span>
                ) : null}
              </div>
            </div>
            <ShadowModeBanner />
            {showCreditIndicator && !isIndicatorDismissed && engineRecommendation != null ? (
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800"
                   title={`Engine recommends a lower limit (${formatMoney(engineRecommendation)}). Current manual limit: ${formatMoney(manualLimit)}.`}>
                <span>ⓘ Engine limit {formatMoney(engineRecommendation)}</span>
                <button
                  type="button"
                  className="font-medium text-amber-600 hover:text-amber-800"
                  aria-label="Dismiss credit limit notice"
                  onClick={() => {
                    setDismissedCreditIndicators((prev) => {
                      const next = new Set(prev);
                      next.add(indicatorKey);
                      return next;
                    });
                  }}
                >
                  ×
                </button>
              </div>
            ) : null}
            {showPrePostStrip ? (
              <SalePrePostStrip
                orderStatus={selectedOrderStatus}
                checks={prePostChecks}
                onFocusLines={focusPrePostCheck}
                onOpenCredit={openCreditPanel}
              />
            ) : null}
            {canWrite ? <div className="control-band subtle-band mt-3">
              {/* UX-F03 — the item cell is an async typeahead over the finder
                  resolver: shorthand ("m15") lists matching posted batches;
                  picking one binds inventory. Enter with no pick keeps the
                  prior behavior — an unresolved (needs_resolution) line that
                  feeds the validation panel and pre-post strip. */}
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
                <input className="input compact" value={draftQty} inputMode="decimal" onChange={(event) => setDraftQty(event.target.value)} />
              </label>
              <button className="primary-button" type="button" disabled={!selectedOrder || !draftItem.trim()} onClick={addDraftLine}>
                Add sale line
              </button>
              {orderLines.data?.length ? <button className="secondary-button" type="button" onClick={() => exportCustomerOffer(orderLines.data ?? [])}>
                Copy/export customer offer
              </button> : null}
            </div> : null}
            <div className="mt-3">
              <OperatorGrid
                view="sales"
                title="Customer Draft Lines"
                rows={lineRowsWithRule}
                columns={lineGridColumns}
                loading={false}
                onSelectionChange={setSelectedLines}
                onCellCommit={canWrite ? onLineCommit : undefined}
                emptyTitle="No sale lines yet"
                emptyChildren="Use Inventory Finder to add posted batches, or type a request above and press Enter."
                selectionActions={(rows) => {
                  /* A8 spec §10.1 — status-aware primary + tray for the line
                     grid. Real line statuses (schema + commandBus verified):
                     draft | reserved | allocated | posted | cancelled.
                     Spec's `needs_resolution` is NOT a status — it is
                     validationIssues.length > 0 on the line (predicate rule).
                     Spec's `confirmed`/`fulfilled` are ORDER statuses and do
                     not exist on lines; the closest real states are mapped
                     below. Every verb from the former always-on strip
                     (Release · Packed · Inv posted · Pay/F-up · Remove ·
                     Reserve) stays reachable — as a primary for its status or
                     in the tray; the catch-all keeps the full set for mixed
                     selections (decisions-log Decision 8: no mixedReason). */
                  const eligibleCount = releaseEligibleRows(rows).length;
                  const act = {
                    priceConfirm: {
                      key: 'price-confirm',
                      label: 'Price + Confirm',
                      icon: <Check className="h-4 w-4" aria-hidden="true" />,
                      disabled: isRunning || !selectedOrder,
                      disabledReason: 'Select an order first',
                      run: () => priceAndConfirm()
                    },
                    openValidation: {
                      key: 'open-validation',
                      label: 'Open Validation',
                      disabled: isRunning,
                      run: (r: GridRow[]) => setValidationFocusIds(r.map((row) => String(row.id)))
                    },
                    release: {
                      key: 'release',
                      label: eligibleCount ? `Release ${eligibleCount} for picking` : 'Release for picking',
                      icon: <Send className="h-4 w-4" aria-hidden="true" />,
                      disabled: isRunning || eligibleCount === 0,
                      disabledReason: 'No selected lines are eligible for release',
                      run: (r: GridRow[]) => releaseSelectedLines(r)
                    },
                    packed: { key: 'packed', label: 'Packed', icon: <PackageCheck className="h-4 w-4" aria-hidden="true" />, disabled: isRunning, run: () => toggleLine('packed', true) },
                    invPosted: { key: 'inv-posted', label: 'Inv posted', disabled: isRunning, run: () => toggleLine('inventoryPosted', true) },
                    payFup: { key: 'pay-fup', label: 'Pay/F-up', disabled: isRunning, run: () => toggleLine('paymentFollowup', true) },
                    remove: { key: 'remove', label: 'Remove', disabled: isRunning, run: () => removeSelectedLines() },
                    reserve: { key: 'reserve', label: 'Reserve', disabled: isRunning || !selectedOrder, disabledReason: 'Select an order first', run: () => reserveOrder() }
                  };
                  const flag = (value: unknown) => value === true || value === 'true' || value === 1 || value === '1';
                  const lineTable: StatusActionTable = {
                    rules: [
                      // Validation issues take precedence over status (predicate rule).
                      { when: (row) => lineHasValidationIssues(row), primary: act.openValidation, tray: [act.reserve, act.remove] },
                      { when: 'draft', primary: act.priceConfirm, tray: [act.release, act.reserve, act.packed, act.invPosted, act.payFup, act.remove] },
                      { when: ['reserved', 'allocated'], primary: act.release, tray: [act.packed, act.invPosted, act.payFup, act.remove, act.reserve] },
                      // Posted lines: closeout-mark cascade (mirrors OrdersView §10.4).
                      { when: (row) => row.status === 'posted' && !flag(row.packed), primary: act.packed, tray: [act.invPosted, act.payFup, act.remove] },
                      { when: (row) => row.status === 'posted' && flag(row.packed) && !flag(row.inventoryPosted), primary: act.invPosted, tray: [act.payFup, act.remove] },
                      { when: (row) => row.status === 'posted' && flag(row.packed) && flag(row.inventoryPosted) && !flag(row.paymentFollowup), primary: act.payFup, tray: [act.remove] },
                      { when: 'posted', primary: null, tray: [act.remove] },
                      { when: 'cancelled', primary: null, tray: [act.remove] },
                      // Catch-all — full verb set for mixed/unknown selections.
                      { when: () => true, primary: null, tray: [act.priceConfirm, act.openValidation, act.release, act.reserve, act.packed, act.invPosted, act.payFup, act.remove] }
                    ]
                  };
                  return <StatusActionBar rows={rows} table={lineTable} busy={isRunning} />;
                }}
                expansionConfig={canWrite ? salesLineExpansionConfig : undefined}
              />
            </div>
            {/* A8 spec §10.1 — "Open Validation" target. Selection-bound
                WorkspacePanel surfacing SaleLineExceptionControls for the
                focused line(s). The same controls remain available in each
                row's expansion; this panel makes them one click from the
                status bar. (The spec's "drawer Validation tab" home would
                require an OperatorGrid API change to open the internal
                RowInspector programmatically — deviation logged.) */}
            {canWrite && validationFocusIds.length ? (
              <WorkspacePanel
                panelId="sales:line-validation"
                title="Line validation"
                subtitle="Resolve issues on the selected line(s), then re-run Price + Confirm."
                headingLevel={3}
                contentClassName="p-3"
                actions={
                  <button type="button" className="icon-button" aria-label="Close line validation" onClick={() => setValidationFocusIds([])}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                }
              >
                <div className="grid gap-3">
                  {lineRowsWithRule.filter((row) => validationFocusIds.includes(String(row.id))).map((row) => (
                    <div key={String(row.id)} className="border border-line bg-panel p-2">
                      <div className="text-sm font-medium text-ink">{String((row as GridRow).itemName ?? row.id)}</div>
                      {Array.isArray(row.validationIssues) && (row.validationIssues as unknown[]).length ? (
                        <ul className="mt-1 list-disc pl-5 text-xs text-zinc-600">
                          {(row.validationIssues as unknown[]).map((issue, index) => (
                            <li key={index}>{String(issue)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-500">No outstanding validation issues.</p>
                      )}
                      {/* UX-F02 — surface the pre-post check reason(s) for this
                          line when a ✗ deep-linked here (e.g. duplicate source,
                          availability), so the panel explains why the line was
                          focused even when server validationIssues is empty. */}
                      {prePostLineIssues.get(String(row.id))?.length ? (
                        <ul className="mt-1 list-disc pl-5 text-xs text-amber-700" data-testid="pre-post-line-issues">
                          {(prePostLineIssues.get(String(row.id)) ?? []).map((issue, index) => (
                            <li key={`pre-post-${index}`}>{issue}</li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="mt-2">
                        <SaleLineExceptionControls
                          row={row}
                          isRunning={isRunning}
                          canWrite={canWrite}
                          showMargin={showMargin}
                          runCommand={runCommand}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </WorkspacePanel>
            ) : null}
            {selectedOrder?.id && ['confirmed', 'posted', 'fulfilled'].includes(selectedOrderStatus) ? (
              <ReceiptPanel kind="sales_order" salesOrderId={String(selectedOrder.id)} />
            ) : null}
          </WorkspacePanel>
        </div>
      ) : (
        <div className="grid gap-3">
          <SalesSourcePane
            customerId={customerId}
            selectedOrderId={canWrite ? String(selectedOrder?.id ?? '') : ''}
            addedBatchIds={addedBatchIds}
            initialSearch={salesRequestText}
            onAddBatch={addFinderBatch}
          />
          <div className="min-h-[420px]">
            <OperatorGrid
              view="sales"
              title="Sales Orders"
              rows={salesOrderRows}
              columns={visibleOrderColumns}
              loading={orders.isLoading && !customerId}
              isError={orders.isError}
              onRetry={() => orders.refetch()}
              onSelectionChange={(selection) => setSelectedRows('sales', selection)}
              onCellCommit={canWrite ? onOrderCellCommit : undefined}
              emptyTitle="No open sales shown"
              emptyChildren="Choose a customer to start."
              expansionConfig={canWrite ? salesOrderExpansionConfig : undefined}
              actions={
                <>
                  {/* A8 — GH #354 presets via the shared template (mirrors OrdersView).
                      The 'sales' filter slot is cleared on customer-mode switch
                      so these presets cannot leak onto the line grid. */}
                  <FilterPresetStrip
                    view="sales"
                    ariaLabel="Filter by status"
                    presets={[
                      { label: 'All Open', filter: 'status:draft,confirmed' },
                      { label: 'Confirmed', filter: 'status:confirmed' },
                      { label: 'Posted', filter: 'status:posted' }
                    ]}
                  />
                  {activeCustomerId && !customerFilterDismissed && activeCustomerName ? (
                    <button
                      type="button"
                      className="selection-pill success"
                      data-testid="sales-customer-scope-chip"
                      title="Clear customer filter — shows all orders"
                      aria-label={`Filtered to ${activeCustomerName}. Click to show all orders.`}
                      onClick={() => setCustomerFilterDismissed(true)}
                    >
                      Filtered to {activeCustomerName}&nbsp;
                      <X className="inline h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </>
              }
            />
          </div>
        </div>
      )}

      {customerId ? <div className="min-h-[340px]">
        {/* SX-B05: suggestions collapsed by default with live count summary */}
        <button
          type="button"
          className="text-button compact-action mb-2"
          aria-expanded={!suggestionsCollapsed}
          onClick={() => setSuggestionsCollapsed((c) => !c)}
        >
          {suggestionsCollapsed ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          Smart Suggestions / Buyer Fit · {(suggestions.data ?? []).length} match{(suggestions.data ?? []).length !== 1 ? 'es' : ''}
        </button>
        {!suggestionsCollapsed ? (<>
        {/* GH #351: suggestion filter bar */}
        <div className="filter-bar">
          <Search className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" aria-hidden="true" />
          <select
            className="text-[11px] font-medium border border-line bg-white px-2 py-1 text-zinc-700 focus:outline-none focus:border-accent"
            value={suggestionCategory}
            onChange={(e) => setSuggestionCategory(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            <option value="Flower">Flower</option>
            <option value="Infused">Infused</option>
            <option value="Extract">Extract</option>
            <option value="Pre-roll">Pre-roll</option>
            <option value="Vape">Vape</option>
          </select>
          <select
            className="text-[11px] font-medium border border-line bg-white px-2 py-1 text-zinc-700 focus:outline-none focus:border-accent"
            value={suggestionPriceBracket}
            onChange={(e) => setSuggestionPriceBracket(e.target.value)}
            aria-label="Filter by price bracket"
          >
            <option value="">Any price</option>
            <option value="under-25">Under $25</option>
            <option value="25-100">$25–$100</option>
            <option value="100-plus">$100+</option>
          </select>
          <label className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-3 w-3 accent-accent cursor-pointer"
              checked={suggestionAgingOnly}
              onChange={(e) => setSuggestionAgingOnly(e.target.checked)}
            />
            Aging only
          </label>
          {suggestionFiltersActive ? (
            <button
              type="button"
              className="filter-pill"
              onClick={() => {
                setSuggestionCategory('');
                setSuggestionPriceBracket('');
                setSuggestionAgingOnly(false);
              }}
              title="Clear all suggestion filters"
            >
              Clear
              <span className="filter-pill-remove">×</span>
            </button>
          ) : null}
          <span className="ml-auto text-[11px] font-medium text-zinc-400">
            {(suggestions.data ?? []).length} match{(suggestions.data ?? []).length !== 1 ? 'es' : ''}
          </span>
        </div>
        <OperatorGrid
          view="sales"
          title="Smart Suggestions / Buyer Fit"
          rows={(suggestions.data ?? []) as GridRow[]}
          columns={visibleSuggestionColumns}
          loading={suggestions.isLoading}
          onSelectionChange={setSelectedSuggestions}
        />
        </>) : null}
      </div> : null}
      {/* SX-B05: purchase history (collapsed by default, lives below suggestions per rule 4) */}
      {customerId ? (
        <CustomerPurchaseHistoryPanel
          customerId={customerId}
          customerName={workspace.data?.customer?.name}
        />
      ) : null}
      {sheetRows.length > 0 ? (
        <WorkspacePanel
          panelId="sales:sheet-preview"
          title={sheetMode === 'internal' ? 'Internal Sales Sheet' : 'Customer Sales Catalog'}
          contentClassName="p-3"
          actions={
            /* UX-F09 — ALL output verbs live here now: sheet/catalog mode
               toggle + Export (relocated from the Sale tray) beside the
               existing UX-F01 "Copy offer". The privacy pill and the UX-A15
               snapshot-retry pill render at the top of the panel content. */
            <>
              {canWrite ? (
                <button
                  className="secondary-button compact-action"
                  type="button"
                  onClick={() => setSheetMode(sheetMode === 'internal' ? 'catalog' : 'internal')}
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {sheetMode === 'internal' ? 'Sales Sheet' : 'Sales Catalog'}
                </button>
              ) : null}
              {canWrite ? (
                <button
                  className="secondary-button compact-action"
                  type="button"
                  disabled={!sheetRows.length}
                  title={!sheetRows.length ? 'Add lines to the sheet before exporting' : undefined}
                  onClick={() => {
                    void exportSheet().catch((err) => {
                      console.error('exportSheet failed', err);
                      setExportError('Sheet downloaded, but Recent Sheets snapshot failed.');
                    });
                  }}
                >
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Export
                </button>
              ) : null}
              {/* UX-F01 — "Copy offer" beside Export: writes a customer-safe text
                 block (name, qty, price; NEVER cost/margin/notes) to the clipboard.
                 Reuses catalog-mode column gating (buildOfferText / getCatalogHeaders). */}
              <button
                type="button"
                className="secondary-button compact-action"
                data-testid="copy-offer-button"
                disabled={!sheetRows.length}
                title={!sheetRows.length ? 'Select suggestions to build a sheet first' : undefined}
                onClick={() => {
                  const text = buildOfferText(sheetRows);
                  navigator.clipboard.writeText(text).then(() => {
                    pushToast('Copied — internal columns excluded.', 'success');
                  }).catch(() => {
                    pushToast('Copy failed — please try again.', 'error');
                  });
                }}
              >
                <Clipboard className="h-4 w-4" aria-hidden="true" />
                Copy offer
              </button>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="selection-pill success">Customer catalog hides cost, margin, and internal notes.</span>
            {/* UX-A15 — partial-failure pill carries "Retry snapshot" wired to
                the existing snapshot call path (attemptSnapshot re-runs
                createCustomerSheetSnapshot with the captured payload). */}
            <SnapshotRetryPill
              error={exportError}
              canRetry={Boolean(lastSnapshotPayload)}
              busy={isRunning}
              onRetry={() => void retrySnapshot()}
            />
          </div>
          {/* SX-B04 / UX-F06 — referee credit pill relocated from the builder
              header to the sheet preview (the confirmation tray). Its moment
              is confirm-time; wire the selected id into priceAndConfirm →
              confirmSalesOrder. */}
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
          {!sheetRows.length ? (
            <p className="mt-2 text-sm text-zinc-600">
              Select suggestions below to build a sheet, then export or copy the offer from here.
            </p>
          ) : null}
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {sheetRows.map((row) => (
              <div key={row.id} className="border border-line p-3 text-sm">
                <div className="font-semibold text-ink">{String(row.name)}</div>
                <div className="text-zinc-600">{String(row.category)} · {String(row.availableQty)} available</div>
                <div className="mt-2 font-medium">${String(row.unitPrice)}</div>
                {showMargin && sheetMode === 'internal' ? <div className="text-xs text-zinc-500" data-testid="sheet-cost-margin">Cost ${String(row.unitCost)} · margin ${String(row.estimatedMargin)}</div> : null}
                {sheetMode === 'internal' ? <div className="text-xs text-zinc-500">{String(row.reason)}</div> : null}
              </div>
            ))}
          </div>
        </WorkspacePanel>
      ) : null}
      {pendingLineEdit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pick-edit-confirm-title"
        >
          {/* GH #323: focus trap ref — Tab/Shift-Tab stay within dialog, Escape dismisses */}
          <div ref={warehouseAlertRef} className="mx-4 max-w-md rounded-lg border border-line bg-white p-6 shadow-xl">
            <h2 id="pick-edit-confirm-title" className="text-base font-semibold text-ink">
              Warehouse alert required
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              {pendingLineEdit.lineIds.length > 1
                ? `The warehouse has started picking ${pendingLineEdit.lineIds.length} lines. They will be alerted to reconcile. Continue?`
                : 'The warehouse has started picking this line. They will be alerted to reconcile. Continue?'}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="primary-button"
                disabled={isRunning}
                onClick={async () => {
                  await pendingLineEdit.onConfirm();
                  setPendingLineEdit(null);
                }}
              >
                Continue
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPendingLineEdit(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * SalesView — Phase 3B mode router.
 *
 * When `salesViewMercury` feature flag is OFF (default): delegates to
 * `LegacySalesView` — the full 1813-line monolithic view. No operator impact.
 *
 * When the flag is ON:
 *   - No ?customer=<uuid> param → SalesBrowseMode (Mode A — browsing)
 *   - ?customer=<uuid> present    → SalesBuildMode (Mode B — building)
 *
 * Mode A → Mode B transition: set ?customer=<uuid> in the URL (e.g., via
 * keel bar global customer selector or customer cell click).
 *
 * Mode B → Mode A transition: clear the ?customer param (via the context
 * header's [Clear] button).
 *
 * @see docs/engineering-plans/specifications/views/sales-view-refactor-plan.md
 */
export function SalesView() {
  if (!SALES_VIEW_MERCURY) {
    return <LegacySalesView />;
  }
  return <MercurySalesView />;
}

/**
 * Internal mode router — only reached when `salesViewMercury` is ON.
 * Reads ?customer=<uuid> from URL search params to decide mode.
 */
function MercurySalesView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const customerId = searchParams.get('customer') ?? '';

  function handleClearCustomer() {
    setSearchParams({});
  }

  function handleCustomerSelect(id: string) {
    setSearchParams({ customer: id });
  }

  if (customerId) {
    return (
      <SalesBuildMode
        customerId={customerId}
        onClear={handleClearCustomer}
      />
    );
  }

  return (
    <SalesBrowseMode
      onCustomerSelect={handleCustomerSelect}
    />
  );
}

function exportCustomerOffer(rows: GridRow[]) {
  // UX-A2 (#15): customer-facing export must skip rows whose media is not
  // customer-share-ready and must NOT include cost/margin headers. The
  // header set and share-ready filter live in SalesView.csvExport.
  const csv = buildCustomerOfferCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'terp-operator-customer-offer.csv';
  link.click();
  URL.revokeObjectURL(url);
}

