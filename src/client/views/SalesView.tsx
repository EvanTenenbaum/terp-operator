import { ChevronDown, ChevronRight, Eye, EyeOff, FileText, PackagePlus, RotateCcw, Search, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { type InventoryFinderBatch } from '../components/InventoryFinderPanel';
import { OperatorGrid } from '../components/OperatorGrid';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { CustomerPurchaseHistoryPanel } from '../components/CustomerPurchaseHistoryPanel';
import { SalesSourcePane } from '../components/SalesSourcePane';
import { type CustomerSheetSnapshotRow, type CustomerSheetSnapshotSummary } from '../components/RecentSheetsPanel';
import { SaleLineExceptionControls } from '../components/SaleLineExceptionControls';
import { ReceiptPanel } from '../components/ReceiptPanel';
import { LandedCostExceptionCellRenderer } from '../components/LandedCostExceptionChip';
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
import { resolvePricingRuleEntry, markupDollarsFromPrice, applyPricingRule } from '../../shared/inventoryPricingShared';
import { parsePriceRange } from '../../shared/priceRange';

import { filterSalesOrdersByCustomer, salesButtonTitle, selectionPillText, selectVisibleSalesColumns } from './SalesView.columns';

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
  { field: 'reason', minWidth: 260 }
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

function asRule(value: unknown): CustomerPricingRule {
  if (value && typeof value === 'object') return value as CustomerPricingRule;
  return {};
}

/** Returns the rule source label shown in the COGS cell */
function ruleSourceLabel(source: string, category?: string): string {
  if (source === 'customer-subcategory' || source === 'customer-category') return `▲ customer · ${category ?? ''}`;
  if (source === 'customer-default') return '▲ customer · default';
  if (source === 'settings-subcategory' || source === 'settings-category') return `▲ default · ${category ?? ''}`;
  if (source === 'settings-default') return '▲ default';
  return '▲ fallback 30%';
}

/** Compute markup dollars and derived COGS for a line row.
 *  Fixed COGS: markup = applyPricingRule(unitCost, rule) - unitCost
 *  Range COGS: markup = markupDollarsFromPrice(unitPrice, rule) */
function computeLineMarkup(
  row: GridRow,
  rule: ReturnType<typeof resolvePricingRuleEntry>
): { markupDollars: number; derivedCogs: number; isRange: boolean; rangeLow?: number; rangeHigh?: number } {
  const range = parsePriceRange(row.priceRange as string | null);
  const unitPrice = Number(row.unitPrice ?? 0);
  const unitCost = Number(row.unitCost ?? 0);
  if (range) {
    const markup = markupDollarsFromPrice(unitPrice, rule);
    return { markupDollars: markup, derivedCogs: unitPrice - markup, isRange: true, rangeLow: range.low, rangeHigh: range.high };
  }
  const markup = Math.max(0, applyPricingRule(unitCost, rule) - unitCost);
  return { markupDollars: markup, derivedCogs: unitCost, isRange: false };
}

const lineColumns: ColDef<GridRow>[] = [
  { field: 'legacyStatusMarker', headerName: 'Raw', editable: (params) => !isRowEditLocked(params), width: 90, pinned: 'left' },
  {
    field: 'displayName',
    headerName: 'Product name',
    editable: false,
    minWidth: 190,
    pinned: 'left',
    cellRenderer: (params: { value: unknown; data: GridRow }) => {
      const fallback = params.value ?? params.data?.itemName ?? '';
      return (
        <span>
          {params.data?.itemAlias ? (
            <span title="Product name (market alias)" style={{ color: '#eab308', marginRight: 4 }}>
              ●
            </span>
          ) : null}
          {String(fallback)}
        </span>
      );
    }
  },
  { field: 'itemName', headerName: 'Canonical', editable: (params) => !isRowEditLocked(params), minWidth: 170 },
  { field: 'subcategory', headerName: 'Subcategory', width: 120 },
  { field: 'batchCode', headerName: 'Source', width: 140 },
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
    valueFormatter: (params) =>
      params.value != null ? `$${Number(params.value).toFixed(2)}` : '—',
    valueSetter: (params) => {
      const newMarkup = parseFloat(String(params.newValue));
      if (!Number.isFinite(newMarkup)) return false;
      const row = params.data as GridRow;
      const range = parsePriceRange(row.priceRange as string | null);
      if (range) {
        // range flow: price stays fixed, markup overrides — derivedCogs = price - markup
        (row as Record<string, unknown>).markup = newMarkup;
      } else {
        // fixed flow: unitPrice = unitCost + markup
        const unitCost = Number(row.unitCost ?? 0);
        (row as Record<string, unknown>).unitPrice = unitCost + newMarkup;
        (row as Record<string, unknown>).markup = newMarkup;
      }
      return true;
    }
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
    cellRenderer: (params: { data?: GridRow }) => {
      const row = params.data;
      if (!row) return null;
      const range = parsePriceRange(row.priceRange as string | null);
      const markup = Number((row as Record<string, unknown>).markup ?? 0);
      const unitPrice = Number(row.unitPrice ?? 0);
      const rule = (row as Record<string, unknown>).__rule as ReturnType<typeof resolvePricingRuleEntry> | undefined;

      if (!range) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
            <span>${Number(row.unitCost ?? 0).toFixed(2)}</span>
            {rule ? <span style={{ fontSize: 10, color: '#71717a' }}>{ruleSourceLabel(rule.source, rule.category)}</span> : null}
          </div>
        );
      }
      if (!unitPrice) return <span style={{ color: '#71717a', fontSize: 12 }}>Set price first</span>;
      const derivedCogs = unitPrice - markup;
      const inRange = derivedCogs >= range.low && derivedCogs <= range.high;
      const rangeCheck = inRange ? '✓' : derivedCogs < range.low ? '↓ below' : '↑ above';
      const rangeColor = inRange ? '#216e4e' : '#b06915';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
          <span>${derivedCogs.toFixed(2)}</span>
          <span style={{ fontSize: 10, color: rangeColor }}>{range.low}–{range.high} {rangeCheck}</span>
          {rule ? <span style={{ fontSize: 10, color: '#71717a' }}>{ruleSourceLabel(rule.source, rule.category)}</span> : null}
        </div>
      );
    }
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
    cellRenderer: LandedCostExceptionCellRenderer
  },
  exceptionBadgeColumn,
  { field: 'availableQty', headerName: 'Avail', type: 'numericColumn', width: 105 },
  { field: 'packed', editable: (params) => !isRowEditLocked(params), width: 105 },
  { field: 'inventoryPosted', headerName: 'Inv Posted', editable: (params) => !isRowEditLocked(params), width: 125 },
  { field: 'paymentFollowup', headerName: 'Pay/F-up', editable: (params) => !isRowEditLocked(params), width: 125 },
  { field: 'validationIssues', headerName: 'Fix', minWidth: 220 },
  {
    field: 'pickStatus',
    headerName: 'Pick status',
    width: 140,
    sortable: true,
    filter: true,
    cellRenderer: (params: { value: unknown }) => (
      <PickStatusChip status={params.value ? String(params.value) : 'unreleased'} />
    )
  },
  {
    field: 'releasedAt',
    headerName: 'Released at',
    width: 160,
    hide: true, // hidden by default per spec
    valueFormatter: (params: { value: unknown }) => params.value ? new Date(String(params.value)).toLocaleString() : '',
  },
  { field: 'status', width: 115 }
];

const EMPTY_ROWS: GridRow[] = [];

function moneyish(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
}

export function SalesView() {
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const selectedSalesRows = useUiStore((state) => state.selectedRows.sales);
  const selectedOrders = selectedSalesRows ?? EMPTY_ROWS;
  const [customerId, setCustomerId] = useState('');
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
  // GH #351: suggestion filter state
  const [suggestionCategory, setSuggestionCategory] = useState('');
  const [suggestionPriceBracket, setSuggestionPriceBracket] = useState('');
  const [suggestionAgingOnly, setSuggestionAgingOnly] = useState(false);
  const suggestionFiltersActive = Boolean(suggestionCategory || suggestionPriceBracket || suggestionAgingOnly);
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

  const lineRowsWithRule = useMemo(() => {
    if (!orderLines.data) return [];
    const customerObj = (reference.data?.customers as Array<Record<string, unknown>> | undefined)
      ?.find((c) => c['id'] === customerId);
    const customerRule = asRule(customerObj?.['pricingRule']);
    const defaultsRule = asRule(reference.data?.defaultPricingRule);
    return (orderLines.data as GridRow[]).map((row) => {
      const rule = resolvePricingRuleEntry(
        customerRule,
        defaultsRule,
        row.batchCategory as string | null,
        row.batchSubcategory as string | null
      );
      const { markupDollars } = computeLineMarkup(row, rule);
      return { ...row, __rule: rule, markup: Number.isFinite(markupDollars) ? markupDollars : 0 };
    });
  }, [orderLines.data, reference.data, customerId]);

  // CAP-030 / TER-1508 — release eligibility per order (live — backend merged)
  const blankOrderId = '00000000-0000-0000-0000-000000000000';
  const releaseEligibility = trpc.queries.releaseEligibility.useQuery(
    { orderId: String(selectedOrder?.id ?? blankOrderId) },
    { enabled: Boolean(selectedOrder?.id) }
  );

  // TER-1671: stable ref for releaseEligibility.data so fulfillmentActionsColumn
  // useMemo does not depend on the array reference (new on every fetch).
  const eligibilityDataRef = useRef(releaseEligibility.data);
  eligibilityDataRef.current = releaseEligibility.data;

  const fulfillmentActionsColumn = useMemo<ColDef<GridRow>>(() => ({
    headerName: 'Pick',
    colId: 'fulfillmentActions',
    width: 190,
    pinned: 'right' as const,
    sortable: false,
    suppressMovable: true,
    cellRenderer: (params: { data?: GridRow }) => {
      const row = params.data;
      if (!row) return null;
      const ps = String(row.pickStatus ?? '');
      const isQueued = ps === 'released' || ps === 'picking' || ps === 'recall_pending';
      const isPacked = ps === 'picked' || row.packed === true;
      const eligibility = eligibilityDataRef.current?.find((e) => e.lineId === row.id);
      const alreadyReleased = eligibility?.alreadyReleased ?? (isQueued || isPacked);
      const canRelease = !alreadyReleased && eligibility?.eligible === true;
      const inactiveRelease = !alreadyReleased && eligibility != null && !eligibility.eligible;
      const releaseTitle = inactiveRelease
        ? (eligibility?.reasons ?? []).join(' ')
        : '';
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isQueued ? (
            <span className="selection-pill info" style={{ fontSize: 11 }}>Queued</span>
          ) : isPacked ? (
            <span className="selection-pill success" style={{ fontSize: 11 }}>Packed</span>
          ) : null}
          {canRelease && canWrite ? (
            <button
              className="primary-button compact-action"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isRunning}
              onClick={() => void runCommand('releaseLineForPicking', { lineId: row.id }, 'Release line for picking')}
            >
              Release
            </button>
          ) : null}
          {inactiveRelease && canWrite ? (
            <button
              className="primary-button compact-action"
              style={{ fontSize: 11, padding: '2px 8px', opacity: 0.5 }}
              disabled
              title={releaseTitle}
            >
              Release
            </button>
          ) : null}
          {(isQueued || isPacked) && canWrite ? (
            <button
              className="secondary-button compact-action"
              style={{ fontSize: 11, padding: '2px 8px' }}
              disabled={isRunning}
              onClick={() => void runCommand('recallLineFromPicking', { lineId: row.id }, 'Recall line from picking')}
            >
              Recall
            </button>
          ) : null}
        </div>
      );
    },
  }), [isRunning, canWrite, runCommand]);

  // TER-1671: memoize the columns array to prevent AG Grid from re-initializing
  // on every render when a fresh array is created via spread.
  const lineGridColumns = useMemo(
    () => [...visibleLineColumns, fulfillmentActionsColumn],
    [visibleLineColumns, fulfillmentActionsColumn]
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
    await runCommand('confirmSalesOrder', { orderId: selectedOrder.id }, 'Confirm sales order');
  }

  async function runSalesPrimary() {
    if (!selectedOrder) {
      await createOrder();
      return;
    }
    if (selectedOrderStatus === 'confirmed') {
      await reserveOrder();
      return;
    }
    await priceAndConfirm();
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

  async function onLineCommit(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;

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
      try {
        const sanitized = buildCustomerSheetSnapshotRows(
          sheetRows as unknown as Array<Record<string, unknown>>,
          mode
        );
        const result = await runCommand(
          'createCustomerSheetSnapshot',
          { customerId, mode, rows: sanitized },
          `Snapshot ${mode} sales sheet for customer`
        );
        if (!result.ok) {
          setExportError('Sheet downloaded, but Recent Sheets snapshot failed.');
          setSalesSheetState({ exportError: 'Sheet downloaded, but Recent Sheets snapshot failed.' });
        }
      } catch {
        setExportError('Sheet downloaded, but Recent Sheets snapshot failed.');
        setSalesSheetState({ exportError: 'Sheet downloaded, but Recent Sheets snapshot failed.' });
      }
    }
  }





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
        <button className="primary-button" type="button" title={salesButtonTitle(customerId)} disabled={(!selectedOrder && !customerId) || isOrderTerminal(selectedOrderStatus)} onClick={runSalesPrimary}>
          <Send className="h-4 w-4" aria-hidden="true" />
          {salesPrimaryLabel(selectedOrderStatus, Boolean(selectedOrder), Boolean(orderLines.data?.length))}
        </button>
        {selectionPillText(selectedOrder?.orderNo, customerId, selectedOrderStatus) && <span className="selection-pill">{selectionPillText(selectedOrder?.orderNo, customerId, selectedOrderStatus)}</span>}
        {!customerId ? showMarginToggle : null}
        {/* GH #352: surface "Repeat last order" as a visible action in the control band */}
        {canWrite && customerId && lastSheet ? (
          <button
            className="secondary-button compact-action"
            type="button"
            disabled={!selectedOrder || isRunning || repeatLoading}
            onClick={repeatLastOrder}
            title="Add all items from the most recent sheet to the current order"
            data-testid="repeat-last-order"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Repeat last order
          </button>
        ) : null}
        <button className="secondary-button compact-action" type="button" onClick={() => setSaleToolsOpen((value) => !value)} aria-expanded={saleToolsOpen}>
          {saleToolsOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          Sale tray
        </button>
      </div> : null}
      {canWrite && saleToolsOpen ? (
        <div className="control-band subtle-band">
          <button className="secondary-button compact-action" type="button" disabled={!selectedOrder || !selectedSuggestions.length} onClick={addSuggestion}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Add suggestion
          </button>
          <button className="secondary-button compact-action" type="button" disabled={!selectedOrder} onClick={reserveOrder}>
            Reserve
          </button>
          <button className="secondary-button compact-action" type="button" onClick={() => setSheetMode(sheetMode === 'internal' ? 'catalog' : 'internal')}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            {sheetMode === 'internal' ? 'Sales Sheet' : 'Sales Catalog'}
          </button>
          <button
            className="secondary-button compact-action"
            type="button"
            disabled={!sheetRows.length}
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
          <span className="selection-pill success">Customer catalog hides cost, margin, and internal notes.</span>
          {exportError ? <span className="selection-pill danger">{exportError}</span> : null}
        </div>
      ) : null}
      {customerId ? (
        <CustomerPurchaseHistoryPanel
          customerId={customerId}
          customerName={workspace.data?.customer?.name}
        />
      ) : null}

      {customerId ? (
        <div className="grid min-h-[520px] grid-cols-1 gap-3 xl:grid-cols-2">
          <SalesSourcePane
            customerId={customerId}
            selectedOrderId={canWrite ? String(selectedOrder?.id ?? '') : ''}
            addedBatchIds={addedBatchIds}
            initialSearch={salesRequestText}
            onAddBatch={addFinderBatch}
          />
          <WorkspacePanel
            panelId="sales:customer-workspace"
            title="Sale Builder"
            contentClassName="p-3"
            actions={canWrite ? (
              <>
                {selectedOrder?.id ? (
                  <button
                    type="button"
                    className="secondary-button compact-action"
                    disabled={isRunning || !canWrite}
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
              <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                <span>
                  ⓘ Engine recommends a lower limit for this customer ({formatMoney(engineRecommendation)}). Order is OK against current manual limit ({formatMoney(manualLimit)}).
                </span>
                <button
                  type="button"
                  className="font-medium text-amber-700 hover:text-amber-900"
                  onClick={() => {
                    setDismissedCreditIndicators((prev) => {
                      const next = new Set(prev);
                      next.add(indicatorKey);
                      return next;
                    });
                  }}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
            {canWrite ? <div className="control-band subtle-band mt-3">
              <label className="field-inline grow">
                Request / item
                <input className="input" value={draftItem} placeholder="Type item, source code, note, or shorthand" onChange={(event) => setDraftItem(event.target.value)} onKeyDown={(event) => {
                  if (event.key === 'Enter') void addDraftLine();
                }} />
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
                selectionActions={(rows) => (
                  <>
                    {/* CAP-030 / TER-1508 — bulk release uses releaseLinesForPicking (single transactional command) */}
                    {rows.some((r) => {
                      const elig = releaseEligibility.data?.find((e) => e.lineId === r.id);
                      return !elig || (elig.eligible && !elig.alreadyReleased);
                    }) ? (
                      <button
                        className="primary-button compact-action"
                        type="button"
                        disabled={isRunning || !canWrite || !rows.length}
                        onClick={async () => {
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
                        }}
                      >
                        Release {rows.filter((r) => {
                          const elig = releaseEligibility.data?.find((e) => e.lineId === r.id);
                          return !elig || (elig.eligible && !elig.alreadyReleased);
                        }).length} for picking
                      </button>
                    ) : null}
                    <button className="secondary-button compact-action" type="button" disabled={!rows.length} onClick={() => toggleLine('packed', true)}>Packed</button>
                    <button className="secondary-button compact-action" type="button" disabled={!rows.length} onClick={() => toggleLine('inventoryPosted', true)}>Inv posted</button>
                    <button className="secondary-button compact-action" type="button" disabled={!rows.length} onClick={() => toggleLine('paymentFollowup', true)}>Pay/F-up</button>
                    <button className="secondary-button compact-action" type="button" disabled={!rows.length} onClick={removeSelectedLines}>Remove</button>
                    <button className="secondary-button compact-action" type="button" disabled={!selectedOrder} onClick={reserveOrder}>Reserve</button>
                  </>
                )}
                expansionConfig={canWrite ? salesLineExpansionConfig : undefined}
              />
            </div>
            {selectedOrder?.id && ['confirmed', 'posted', 'fulfilled'].includes(selectedOrderStatus) ? (
              <ReceiptPanel kind="sales_order" salesOrderId={String(selectedOrder.id)} />
            ) : null}
          </WorkspacePanel>
        </div>
      ) : (
        <div className="grid min-h-[420px] grid-cols-1 gap-3 xl:grid-cols-[0.9fr_1.1fr]">
          <OperatorGrid
            view="sales"
            title="Sales Orders"
            rows={salesOrderRows}
            columns={visibleOrderColumns}
            loading={orders.isLoading && !customerId}
            isError={orders.isError}
            onRetry={() => orders.refetch()}
            onSelectionChange={(selection) => setSelectedRows('sales', selection)}
            emptyTitle="No open sales shown"
            emptyChildren="Choose a customer to start."
            expansionConfig={canWrite ? salesOrderExpansionConfig : undefined}
            actions={
              activeCustomerId && !customerFilterDismissed && activeCustomerName ? (
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
              ) : undefined
            }
          />
          <SalesSourcePane
            customerId={customerId}
            selectedOrderId={canWrite ? String(selectedOrder?.id ?? '') : ''}
            addedBatchIds={addedBatchIds}
            initialSearch={salesRequestText}
            onAddBatch={addFinderBatch}
          />
        </div>
      )}

      {customerId ? <div className="min-h-[340px]">
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
      </div> : null}
      {sheetRows.length ? <WorkspacePanel panelId="sales:sheet-preview" title={sheetMode === 'internal' ? 'Internal Sales Sheet' : 'Customer Sales Catalog'} contentClassName="p-3">
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
      </WorkspacePanel> : null}
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

function PickStatusChip({ status }: { status: string | undefined }) {
  const label = status ?? 'unreleased';
  const colorClass =
    label === 'released' ? 'bg-blue-100 text-blue-800' :
    label === 'picking' ? 'bg-amber-100 text-amber-800' :
    label === 'picked' ? 'bg-green-100 text-green-800' :
    label === 'recall_pending' ? 'bg-red-100 text-red-800' :
    'bg-zinc-100 text-zinc-600'; // unreleased / default
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${colorClass}`}>
      {label.replace('_', ' ')}
    </span>
  );
}

function salesPrimaryLabel(status: string, hasOrder: boolean, hasLines: boolean) {
  if (!hasOrder) return 'New Sale';
  if (status === 'confirmed') return 'Reserve';
  if (status === 'posted') return 'Posted';
  if (status === 'cancelled') return 'Cancelled';
  if (!hasLines) return 'Add first line';
  return 'Price + Confirm';
}

function isOrderTerminal(status: string) {
  return ['posted', 'cancelled', 'fulfilled'].includes(status);
}
