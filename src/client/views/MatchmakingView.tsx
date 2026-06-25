import { Check, ExternalLink, Plus, RotateCcw, Settings, X } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CellValueChangedEvent } from 'ag-grid-community';
import type { GridColDef } from '../../shared/grid-types';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { useEntityActions } from '../hooks/useEntityActions';
import { useColumnDefs } from '../hooks/useColumnDefs';
import { ViewTabBar, type TabDef } from '../components/ViewTabBar';
import { FilterToolbar, type StatusCount } from '../components/FilterToolbar';
import { BulkActionBar, type BulkAction } from '../components/BulkActionBar';
import type { GridRow, Role } from '../../shared/types';
import { whyShownCol, type RuleMap } from '../components/columns';

// Rule maps for "Why shown" audit column — signal field in matchmaking grids.
const TO_MOVE_SIGNAL_MAP: RuleMap = {
  both:    'Customer has an open posted need AND a repeat-purchase history in this category — highest-confidence opportunity.',
  need:    'Customer has an open posted need in this category — reach out to offer this stock.',
  history: 'Customer has purchased in this category multiple times recently — proactive outreach opportunity.',
};

const TO_SOURCE_SIGNAL_MAP: RuleMap = {
  both:    'Customer demand exists AND a vendor has posted available supply in this category — strongest sourcing signal.',
  supply:  'A vendor has posted available supply in this category matching an open customer need.',
  history: 'Purchase history shows consistent demand in this category; consider sourcing to replenish.',
};

// ─── Column definitions (from entity-schemas via useColumnDefs) ──────────────────
// customerNeedSchema and vendorSupplySchema are the canonical source of truth
// for field metadata, tier classification, and rationale. The query field names
// (e.g. 'customer', 'vendor', 'needCode', 'productName') already match the
// schema field names, so no field mapping is needed.
// R-06: ARCH-8 / UX-8 — no per-view GridColDef arrays.

// ─── Tab keys ──────────────────────────────────────────────────────────────────
const TAB_MATCHES = 'matches';
const TAB_TO_MOVE = 'toMove';
const TAB_GAPS = 'gapsToFill';
const TAB_NEEDS = 'customerNeeds';
const TAB_STOCK = 'vendorStock';

export function MatchmakingView() {
  // ── Queries ──────────────────────────────────────────────────────────────
  const reference = trpc.queries.reference.useQuery();
  const board = trpc.matchmaking.matchmakingBoard.useQuery();
  const settings = trpc.matchmaking.matchmakingSettings.useQuery();
  const opportunities = trpc.matchmaking.matchmakingOpportunities.useQuery();
  const me = trpc.auth.me.useQuery();
  const userRole = (me.data?.role ?? 'viewer') as Role;
  const canWrite = userRole !== 'viewer';
  const canManageSettings = userRole === 'manager' || userRole === 'owner';

  const s = settings.data ?? {
    matchQualityFloor: 35,
    workQueueThreshold: 75,
    historyLookbackDays: 90,
    repeatThreshold: 3,
    gapFloorQty: 0,
    showClientsColumn: false,
    showVendorsColumn: false,
    workQueueEnabled: true,
  };

  // ── Store ────────────────────────────────────────────────────────────────
  const activeQuickLaunch = useUiStore((state) => state.activeQuickLaunch);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setActiveQuickLaunch = useUiStore((state) => state.setActiveQuickLaunch);
  const { runCommand, isRunning } = useCommandRunner();
  const navigate = useNavigate();

  // ── Refs ──────────────────────────────────────────────────────────────────
  const needProductRef = useRef<HTMLInputElement | null>(null);
  const supplyProductRef = useRef<HTMLInputElement | null>(null);

  // ── Local state ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>(TAB_MATCHES);
  const [showSettings, setShowSettings] = useState(false);
  const [showEntry, setShowEntry] = useState(false);
  const [activeEntryTab, setActiveEntryTab] = useState<'need' | 'stock'>('need');
  const [selectedMatches, setSelectedMatches] = useState<GridRow[]>([]);

  // ── Entry form state ─────────────────────────────────────────────────────
  const [customerId, setCustomerId] = useState('');
  const [needProduct, setNeedProduct] = useState('');
  const [needCategory, setNeedCategory] = useState('');
  const [needSubcategory, setNeedSubcategory] = useState('');
  const [qtyMin, setQtyMin] = useState('0');
  const [targetPrice, setTargetPrice] = useState('');
  const [neededBy, setNeededBy] = useState('');

  const [vendorId, setVendorId] = useState('');
  const [supplyProduct, setSupplyProduct] = useState('');
  const [supplyCategory, setSupplyCategory] = useState('');
  const [supplySubcategory, setSupplySubcategory] = useState('');
  const [availableQty, setAvailableQty] = useState('0');
  const [askingPrice, setAskingPrice] = useState('');
  const [availableDate, setAvailableDate] = useState('');

  // ── Settings controlled state ─────────────────────────────────────────────
  const [localFloor, setLocalFloor] = useState(s.matchQualityFloor);
  const [localThreshold, setLocalThreshold] = useState(s.workQueueThreshold);
  const [localGapFloor, setLocalGapFloor] = useState(s.gapFloorQty);

  useEffect(() => {
    setLocalFloor(s.matchQualityFloor);
    setLocalThreshold(s.workQueueThreshold);
    setLocalGapFloor(s.gapFloorQty);
  }, [s.matchQualityFloor, s.workQueueThreshold, s.gapFloorQty]);

  // ── Quick-launch focus ───────────────────────────────────────────────────
  useEffect(() => {
    if (activeQuickLaunch === 'customerNeed') needProductRef.current?.focus();
    if (activeQuickLaunch === 'vendorSupply') supplyProductRef.current?.focus();
  }, [activeQuickLaunch]);

  // ── URL params for customer/vendor filter ────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const filterCustomerId = searchParams.get('customer') ?? '';
  const filterVendorId = searchParams.get('vendor') ?? '';

  // ── Settings mutation ────────────────────────────────────────────────────
  async function updateSettings(patch: Record<string, unknown>) {
    try {
      await runCommand('updateMatchmakingSettings', patch, 'Update matchmaking settings');
      settings.refetch();
    } catch {
      // error toast already handled by useCommandRunner
    }
  }

  // ── Entry form mutations ─────────────────────────────────────────────────
  async function createNeed() {
    await runCommand(
      'createCustomerNeed',
      {
        customerId,
        productName: needProduct,
        category: needCategory,
          subcategory: needSubcategory,
        qtyMin: Number(qtyMin),
        targetPrice: targetPrice ? Number(targetPrice) : undefined,
        neededBy: neededBy || undefined,
      },
      'Add customer need'
    );
    setNeedProduct('');
    setQtyMin('0');
    setTargetPrice('');
    setNeededBy('');
    needProductRef.current?.focus();
  }

  async function createSupply() {
    await runCommand(
      'createVendorSupply',
      {
        vendorId,
        productName: supplyProduct,
        category: supplyCategory,
          subcategory: supplySubcategory,
        availableQty: Number(availableQty),
        askingPrice: askingPrice ? Number(askingPrice) : undefined,
        availableDate: availableDate || undefined,
      },
      'Add vendor stock'
    );
    setSupplyProduct('');
    setAvailableQty('0');
    setAskingPrice('');
    setAvailableDate('');
    supplyProductRef.current?.focus();
  }

  // ── Cell edit handlers ───────────────────────────────────────────────────
  async function updateNeedCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    await runCommand('updateCustomerNeed', { customerNeedId: event.data.id, [String(event.colDef.field)]: event.newValue }, `Inline customer need edit: ${event.colDef.field}`);
  }

  async function updateSupplyCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    await runCommand('updateVendorSupply', { vendorSupplyId: event.data.id, [String(event.colDef.field)]: event.newValue }, `Inline vendor stock edit: ${event.colDef.field}`);
  }

  // ── Bulk actions (preserved for BulkActionBar) ───────────────────────────
  async function acceptSelected() {
    for (const row of selectedMatches) await runCommand('acceptMatchmakingMatch', { matchId: row.id }, 'Accept matchmaking row');
  }

  async function dismissSelected() {
    for (const row of selectedMatches) await runCommand('dismissMatchmakingMatch', { matchId: row.id }, 'Dismiss matchmaking row');
  }

  // ── Column definitions ───────────────────────────────────────────────────
  // R-06: Customer Needs and Vendor Stock grids consume entity-schemas via useColumnDefs.
  const needOverrides = useMemo(() => [{ field: 'productName', minWidth: 180 }], []);
  const needCols = useColumnDefs('customerNeed', needOverrides);

  const supplyOverrides = useMemo(() => [{ field: 'productName', minWidth: 180 }], []);
  const supplyCols = useColumnDefs('vendorSupply', supplyOverrides);

  const matchColumns = useMemo<GridColDef<GridRow>[]>(() => [
    {
      field: 'score',
      pinned: 'left',
      type: 'numericColumn',
      width: 100,
      cellRenderer: (params: { value: number; data?: GridRow }) => {
        const score = Number(params.value ?? 0);
        const isLowConfidence = score < 35;
        return (
          <span className="flex items-center gap-1">
            <span>{score}</span>
            {isLowConfidence && (
              <span className="inline-flex rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
                Low
              </span>
            )}
          </span>
        );
      },
    },
    { field: 'customer', width: 160 },
    { field: 'needProduct', headerName: 'Request', minWidth: 170 },
    { field: 'vendor', width: 160 },
    { field: 'vendorProduct', headerName: 'Stock', minWidth: 170 },
    {
      headerName: 'Price fit',
      width: 150,
      valueGetter: (params: { data?: GridRow }) => {
        const ask = Number(params.data?.askingPrice ?? 0);
        const target = Number(params.data?.targetPrice ?? 0);
        if (!ask || !target) return '';
        const fit = ask <= target;
        return `$${ask} ask / $${target} target ${fit ? '✓' : '✗'}`;
      },
    },
    {
      headerName: 'Qty fit',
      width: 140,
      valueGetter: (params: { data?: GridRow }) => {
        const avail = Number(params.data?.availableQty ?? 0);
        const need = Number(params.data?.qtyMin ?? 0);
        if (!avail || !need) return '';
        const fit = avail >= need;
        return `${avail} avail / ${need} need ${fit ? '✓' : '✗'}`;
      },
    },
    { field: 'status', width: 115 },
  ], []);

  const matchRowClassRules = useMemo(() => ({
    'opacity-40': (params: { data?: GridRow }) => {
      const score = Number(params.data?.score ?? 0);
      return score < s.matchQualityFloor && score >= 35;
    },
  }), [s.matchQualityFloor]);

  // ── Expansion config (per-row actions) ───────────────────────────────────
  const matchExpansionConfig = useMemo(
    () => ({
      enabled: true,
      actionsRenderer: (row: GridRow) => {
        const status = typeof row.status === 'string' ? row.status : '';
        const isOpen = status === 'open';
        const isAccepted = status === 'accepted';
        const isClosed = isAccepted || status === 'dismissed';
        return (
          <>
            {isOpen ? (
              <>
                <button
                  className="primary-button compact-action"
                  disabled={isRunning || !canWrite}
                  title={!canWrite ? 'You have view-only access' : undefined}
                  onClick={() => {
                    if (!row.id || row.id.trim() === '') return;
                    runCommand('acceptMatchmakingMatch', { matchId: row.id }, 'Accept match');
                  }}
                  type="button"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Accept
                </button>
                <button
                  className="secondary-button compact-action"
                  disabled={isRunning || !canWrite}
                  title={!canWrite ? 'You have view-only access' : undefined}
                  onClick={() => {
                    if (!row.id || row.id.trim() === '') return;
                    runCommand('dismissMatchmakingMatch', { matchId: row.id }, 'Dismiss match');
                  }}
                  type="button"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Dismiss
                </button>
              </>
            ) : null}
            {/* UX-P02: accepted rows show "Next:" workflow links to follow through.
                "Create PO" → Purchasing with quick-launch prefilled from this match.
                "Create Sale" → Sales with quick-launch prefilled from this match.
                Vendor side (supply) → create a PO to source the stock.
                Customer side (need) → create a sale to fulfill the demand. */}
            {isAccepted && canWrite ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-zinc-400 font-medium">Next:</span>
                <button
                  className="secondary-button compact-action"
                  type="button"
                  title={`Create a PO for ${String(row.vendor ?? 'vendor')} — stock for this match`}
                  onClick={() => {
                    setActiveQuickLaunch('purchaseOrder');
                    setActiveView('purchaseOrders');
                    navigate('/purchase-orders');
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Create PO
                </button>
                <button
                  className="secondary-button compact-action"
                  type="button"
                  title={`Create a sale for ${String(row.customer ?? 'customer')} — fulfill this match`}
                  onClick={() => {
                    setActiveQuickLaunch('sale');
                    setActiveView('sales');
                    navigate('/sales');
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Create Sale
                </button>
              </span>
            ) : null}
            {isClosed ? (
              <button
                className="secondary-button compact-action"
                disabled={isRunning || !canWrite}
                title={!canWrite ? 'You have view-only access' : undefined}
                onClick={() => {
                  if (!row.id || row.id.trim() === '') return;
                  runCommand('reopenMatchmakingMatch', { matchId: row.id }, 'Reopen for review');
                }}
                type="button"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reopen
              </button>
            ) : null}
          </>
        );
      },
      childrenRenderer: (row: GridRow) => (
        <div className="text-sm text-zinc-600">
          <div className="font-medium mb-1">Match Reasoning:</div>
          <div>{String(row.reasons ?? 'No reasoning provided')}</div>
        </div>
      )
    }),
    [isRunning, runCommand, canWrite, navigate, setActiveView, setActiveQuickLaunch]
  );

  // ── Opportunity column definitions ───────────────────────────────────────
  const toMoveColumns = useMemo<GridColDef<GridRow>[]>(() => [
    { field: 'product', minWidth: 180, pinned: 'left' },
    { field: 'category', width: 120 },
    { field: 'onHand', headerName: 'On hand', type: 'numericColumn', width: 110 },
    { field: 'customer', minWidth: 160 },
    {
      field: 'signal',
      headerName: 'Signal',
      width: 130,
      cellRenderer: (params: { value: string }) => {
        const label = params.value === 'both' ? 'Both' : params.value === 'need' ? 'Posted need' : 'History';
        const cls = params.value === 'both'
          ? 'bg-emerald-100 text-emerald-800'
          : params.value === 'need'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-zinc-100 text-zinc-600';
        return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
      },
    },
    {
      field: 'lastActivity',
      headerName: 'Last activity',
      width: 140,
      valueFormatter: (params) => params.value ? new Date(params.value as string).toLocaleDateString('en-US') : '—',
    },
    { ...whyShownCol('signal', TO_MOVE_SIGNAL_MAP), hide: true },
    {
      headerName: 'Action',
      width: 130,
      cellRenderer: (params: { data?: GridRow }) => {
        if (!canWrite) return null;
        return (
          <button
            className="secondary-button compact-action"
            disabled={isRunning}
            onClick={() => {
              if (!params.data?.customerId || !params.data?.category) return;
              runCommand('noteMatchmakingOutreach', {
                entityType: 'customer',
                entityId: params.data.customerId,
                context: params.data.category,
                leg: 2,
              }, 'Note customer outreach').then(() => opportunities.refetch());
            }}
            type="button"
          >
            Note contact
          </button>
        );
      },
    },
  ], [isRunning, canWrite, runCommand, opportunities]);

  const toSourceColumns = useMemo<GridColDef<GridRow>[]>(() => [
    { field: 'category', minWidth: 150, pinned: 'left' },
    { field: 'onHand', headerName: 'On hand', type: 'numericColumn', width: 110 },
    {
      field: 'gapLevel',
      headerName: 'Gap',
      width: 100,
      cellRenderer: (params: { value: string }) => {
        const isEmpty = params.value === 'empty';
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            isEmpty ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
          }`}>
            {isEmpty ? 'Empty' : 'Low'}
          </span>
        );
      },
    },
    { field: 'vendor', minWidth: 160 },
    {
      field: 'signal',
      headerName: 'Signal',
      width: 130,
      cellRenderer: (params: { value: string }) => {
        const label = params.value === 'both' ? 'Both' : params.value === 'supply' ? 'Posted supply' : 'History';
        const cls = params.value === 'both'
          ? 'bg-emerald-100 text-emerald-800'
          : params.value === 'supply'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-zinc-100 text-zinc-600';
        return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
      },
    },
    {
      field: 'lastActivity',
      headerName: 'Last activity',
      width: 140,
      valueFormatter: (params) => params.value ? new Date(params.value as string).toLocaleDateString('en-US') : '—',
    },
    { field: 'postedQty', headerName: 'Posted qty', type: 'numericColumn', width: 110 },
    { ...whyShownCol('signal', TO_SOURCE_SIGNAL_MAP), hide: true },
    {
      headerName: 'Action',
      width: 130,
      cellRenderer: (params: { data?: GridRow }) => {
        if (!canWrite) return null;
        return (
          <button
            className="secondary-button compact-action"
            disabled={isRunning}
            onClick={() => {
              if (!params.data?.vendorId || !params.data?.category) return;
              runCommand('noteMatchmakingOutreach', {
                entityType: 'vendor',
                entityId: params.data.vendorId,
                context: params.data.category,
                leg: 3,
              }, 'Note vendor outreach').then(() => opportunities.refetch());
            }}
            type="button"
          >
            Note contact
          </button>
        );
      },
    },
  ], [isRunning, canWrite, runCommand, opportunities]);

  // ── Filtered data ────────────────────────────────────────────────────────
  const filteredNeeds = useMemo(() => {
    const rows = (board.data?.needs ?? []) as GridRow[];
    if (!filterCustomerId) return rows;
    return rows.filter((r) => r.customerId === filterCustomerId || r.customer_id === filterCustomerId);
  }, [board.data?.needs, filterCustomerId]);

  const filteredSupplies = useMemo(() => {
    const rows = (board.data?.supplies ?? []) as GridRow[];
    if (!filterVendorId) return rows;
    return rows.filter((r) => r.vendorId === filterVendorId || r.vendor_id === filterVendorId);
  }, [board.data?.supplies, filterVendorId]);

  const filteredMatches = useMemo(() => {
    const rows = (board.data?.matches ?? []) as GridRow[];
    if (!filterCustomerId && !filterVendorId) return rows;
    return rows.filter((r) => {
      if (filterCustomerId && r.customerId !== filterCustomerId) return false;
      if (filterVendorId && r.vendorId !== filterVendorId) return false;
      return true;
    });
  }, [board.data?.matches, filterCustomerId, filterVendorId]);

  // ── Status counts for FilterToolbar status pill ──────────────────────────
  const matchStatusCounts = useMemo<StatusCount[]>(() => {
    const counts: Record<string, number> = {};
    for (const match of filteredMatches) {
      const status = typeof match.status === 'string' ? match.status : 'unknown';
      counts[status] = (counts[status] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => a.status.localeCompare(b.status));
  }, [filteredMatches]);

  // ── Status filter state for FilterToolbar ────────────────────────────────
  const [activeStatusFilter, setActiveStatusFilter] = useState('');

  // ── Client-side status filter for matches ────────────────────────────────
  const statusFilteredMatches = useMemo(() => {
    if (!activeStatusFilter) return filteredMatches;
    const allowed = activeStatusFilter.split(',').filter(Boolean);
    return filteredMatches.filter((r) => {
      const status = typeof r.status === 'string' ? r.status : '';
      return allowed.includes(status);
    });
  }, [filteredMatches, activeStatusFilter]);

  // ── Tab definitions ──────────────────────────────────────────────────────
  const toMoveCount = (opportunities.data?.toMove ?? []).length;
  const toSourceCount = (opportunities.data?.toSource ?? []).length;

  const tabDefs = useMemo<TabDef[]>(() => [
    { key: TAB_MATCHES, label: 'Matches', count: filteredMatches.length },
    { key: TAB_TO_MOVE, label: 'To Move', count: toMoveCount },
    { key: TAB_GAPS, label: 'Gaps to Fill', count: toSourceCount },
    { key: TAB_NEEDS, label: 'Customer Needs', count: filteredNeeds.length },
    { key: TAB_STOCK, label: 'Vendor Stock', count: filteredSupplies.length },
  ], [filteredMatches.length, toMoveCount, toSourceCount, filteredNeeds.length, filteredSupplies.length]);

  // ── Bulk action resolution ───────────────────────────────────────────────
  const bulkActionDefs = useEntityActions(
    'matchmakingMatch',
    selectedMatches.map((r) => ({ id: String(r.id), status: String(r.status) })),
    userRole,
  );

  const bulkActions = useMemo<BulkAction[]>(() =>
    bulkActionDefs.map((def) => ({
      ...def,
      onAction: async () => {
        if (def.key === 'acceptMatchmakingMatch') {
          await acceptSelected();
          return { succeeded: selectedMatches.length, failed: 0 };
        }
        if (def.key === 'dismissMatchmakingMatch') {
          await dismissSelected();
          return { succeeded: selectedMatches.length, failed: 0 };
        }
        return { succeeded: 0, failed: 0, error: 'Unknown action' };
      },
    })),
  [bulkActionDefs, selectedMatches]);

  // ── Customer/vendor filter pills for FilterToolbar ──────────────────────
  const filterPills = useMemo(() => {
    const pills: { key: string; label: string; onRemove: () => void }[] = [];
    if (filterCustomerId) {
      const name = reference.data?.customers.find((c) => c.id === filterCustomerId)?.name;
      pills.push({
        key: 'customer',
        label: name ? `Customer: ${name}` : 'Customer filter',
        onRemove: () => setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('customer');
          return next;
        }),
      });
    }
    if (filterVendorId) {
      const name = reference.data?.vendors.find((v) => v.id === filterVendorId)?.name;
      pills.push({
        key: 'vendor',
        label: name ? `Vendor: ${name}` : 'Vendor filter',
        onRemove: () => setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('vendor');
          return next;
        }),
      });
    }
    return pills;
  }, [filterCustomerId, filterVendorId, reference.data, setSearchParams]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="view-stack">
      {/* ── Filter toolbar ── */}
      <FilterToolbar
        view="matchmaking"
        quickFilters={['keyword']}
        statusCounts={matchStatusCounts}
        activeStatusFilter={activeStatusFilter}
        onStatusFilterChange={setActiveStatusFilter}
        activePills={filterPills}
      />

      {/* ── View tab bar (grid switcher) ── */}
      <ViewTabBar
        entityType="matchmaking"
        tabs={tabDefs}
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          // Clear match selection when switching away from matches tab
          if (key !== TAB_MATCHES) setSelectedMatches([]);
        }}
      />

      {/* ── Toolbar action bar (settings toggle, entry toggles) ── */}
      <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
        {/* Settings toggle */}
        <button
          type="button"
          className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors ${
            showSettings
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-line text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
          }`}
          onClick={() => setShowSettings((v) => !v)}
        >
          <Settings className="h-3.5 w-3.5" aria-hidden="true" />
          Settings
        </button>

        {/* Add Need / Add Stock buttons (write-only) — each opens the entry slide-over to its tab */}
        {canWrite && (
          <>
            <button
              type="button"
              className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors ${
                showEntry && activeEntryTab === 'need'
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-line text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
              }`}
              onClick={() => {
                if (showEntry && activeEntryTab === 'need') {
                  setShowEntry(false);
                } else {
                  setActiveEntryTab('need');
                  setShowEntry(true);
                  setTimeout(() => needProductRef.current?.focus(), 50);
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Need
            </button>
            <button
              type="button"
              className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors ${
                showEntry && activeEntryTab === 'stock'
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-line text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
              }`}
              onClick={() => {
                if (showEntry && activeEntryTab === 'stock') {
                  setShowEntry(false);
                } else {
                  setActiveEntryTab('stock');
                  setShowEntry(true);
                  setTimeout(() => supplyProductRef.current?.focus(), 50);
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Stock
            </button>
          </>
        )}
      </div>

      {/* ── Settings slide-over (Tier 2, triggered by ⚙ button) ── */}
      {showSettings && (
        <>
          <div
            className="slideover-backdrop"
            aria-hidden="true"
            onClick={() => setShowSettings(false)}
          />
          <aside
            className="slideover slideover--wide"
            aria-label="Matchmaking settings"
            role="dialog"
            aria-modal="true"
            data-testid="settings-slideover"
          >
            <div className="slideover-header">
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">
                  Matchmaking Settings
                </div>
                <div className="truncate text-[11px] uppercase text-zinc-500">
                  Matchmaking
                </div>
              </div>
            </div>
            <div className="slideover-body">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="field-inline">
                    Show matches scoring at least
                    <input className="input compact" type="number" min={0} max={100}
                      disabled={!canManageSettings || isRunning}
                      value={localFloor}
                      onChange={(e) => setLocalFloor(Number(e.target.value))}
                      onBlur={() => updateSettings({ matchQualityFloor: localFloor })} />
                    pts
                  </label>
                  <label className="field-inline">
                    Add to work queue at
                    <input className="input compact" type="number" min={0} max={100}
                      disabled={!canManageSettings || isRunning}
                      value={localThreshold}
                      onChange={(e) => setLocalThreshold(Number(e.target.value))}
                      onBlur={() => updateSettings({ workQueueThreshold: localThreshold })} />
                    pts
                  </label>
                  <label className="field-inline">
                    Look back
                    <select className="select compact" disabled={!canManageSettings || isRunning}
                      value={s.historyLookbackDays}
                      onChange={(e) => updateSettings({ historyLookbackDays: Number(e.target.value) })}>
                      <option value={30}>30 days</option>
                      <option value={60}>60 days</option>
                      <option value={90}>90 days</option>
                      <option value={180}>180 days</option>
                    </select>
                  </label>
                  <label className="field-inline">
                    Flag as repeat after
                    <select className="select compact" disabled={!canManageSettings || isRunning}
                      value={s.repeatThreshold}
                      onChange={(e) => updateSettings({ repeatThreshold: Number(e.target.value) })}>
                      <option value={2}>2 purchases</option>
                      <option value={3}>3 purchases</option>
                      <option value={5}>5 purchases</option>
                    </select>
                  </label>
                  <label className="field-inline">
                    Flag gaps when on hand drops to
                    <input className="input compact" type="number" min={0}
                      disabled={!canManageSettings || isRunning}
                      value={localGapFloor}
                      onChange={(e) => setLocalGapFloor(Number(e.target.value))}
                      onBlur={() => updateSettings({ gapFloorQty: localGapFloor })} />
                    units
                  </label>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4" disabled={!canManageSettings || isRunning}
                      checked={s.showClientsColumn}
                      onChange={(e) => updateSettings({ showClientsColumn: e.target.checked })} />
                    Show matchmaking signals in Clients grid
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4" disabled={!canManageSettings || isRunning}
                      checked={s.showVendorsColumn}
                      onChange={(e) => updateSettings({ showVendorsColumn: e.target.checked })} />
                    Show matchmaking signals in Vendors grid
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4" disabled={!canManageSettings || isRunning}
                      checked={s.workQueueEnabled}
                      onChange={(e) => updateSettings({ workQueueEnabled: e.target.checked })} />
                    Show matchmaking opportunities in work queue
                  </label>
                </div>
                <details className="text-sm text-zinc-500">
                  <summary className="cursor-pointer select-none hover:text-zinc-700">How scores are calculated</summary>
                  <pre className="mt-2 font-mono text-xs leading-relaxed">
{`Category match:                    +35
Tag overlap (per shared tag):       +8  (capped at +24)
Product name token overlap:        +10
Vendor qty covers need minimum:    +12
Asking price ≤ target price:       +12
Supply available by needed-by:      +7
────────────────────────────────────
Maximum score:                     100`}
                  </pre>
                </details>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* ── Entry slide-over (Tier 2, triggered by + Add Need / + Add Stock) ── */}
      {showEntry && canWrite && (
        <>
          <div
            className="slideover-backdrop"
            aria-hidden="true"
            onClick={() => setShowEntry(false)}
          />
          <aside
            className="slideover slideover--wide"
            aria-label="Add entry"
            role="dialog"
            aria-modal="true"
            data-testid="entry-slideover"
          >
            <div className="slideover-header">
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowEntry(false)}
                aria-label="Close entry form"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">
                  {activeEntryTab === 'need' ? 'New Customer Need' : 'New Vendor Stock'}
                </div>
                <div className="truncate text-[11px] uppercase text-zinc-500">
                  Matchmaking
                </div>
              </div>
            </div>

            {/* Tab bar */}
            <div className="slideover-tabs" role="tablist" aria-label="Entry form sections">
              {([
                { key: 'need' as const, label: 'New Customer Need' },
                { key: 'stock' as const, label: 'New Vendor Stock' },
              ]).map((tab, index) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeEntryTab === tab.key}
                  className={`slideover-tab${activeEntryTab === tab.key ? ' slideover-tab--active' : ''}`}
                  onClick={() => setActiveEntryTab(tab.key)}
                >
                  <span className="slideover-tab-index">{index + 1}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="slideover-body">
              {activeEntryTab === 'need' && (
                <div role="tabpanel" aria-label="New Customer Need" className="control-band subtle-band">
                  <label className="field-inline">
                    Customer
                    <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                      <option value="">Select customer</option>
                      {reference.data?.customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-inline grow">
                    Need
                    <input ref={needProductRef} className="input" value={needProduct}
                      onChange={(e) => setNeedProduct(e.target.value)} placeholder="e.g. Indica flower" />
                  </label>
                  <label className="field-inline">
                    Category
                    <select className="select compact" value={needCategory} onChange={(e) => setNeedCategory(e.target.value)}>
                      <option value="">Category</option>
                      {reference.data?.categories.map((cat) => <option key={cat}>{cat}</option>)}
                    </select>
                  </label>
                  <label className="field-inline">
                    Qty
                    <input className="input compact" value={qtyMin} inputMode="decimal"
                      onChange={(e) => setQtyMin(e.target.value)} />
                  </label>
                  <label className="field-inline">
                    Target $
                    <input className="input compact" value={targetPrice} inputMode="decimal"
                      onChange={(e) => setTargetPrice(e.target.value)} />
                  </label>
                  <label className="field-inline">
                    By
                    <input className="input compact" type="date" value={neededBy}
                      onChange={(e) => setNeededBy(e.target.value)} />
                  </label>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!customerId || !needProduct.trim() || !needCategory || Number(qtyMin) <= 0 || isRunning}
                    onClick={createNeed}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Need
                  </button>
                </div>
              )}
              {activeEntryTab === 'stock' && (
                <div role="tabpanel" aria-label="New Vendor Stock" className="control-band subtle-band">
                  <label className="field-inline">
                    Vendor
                    <select className="select" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                      <option value="">Select vendor</option>
                      {reference.data?.vendors.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-inline grow">
                    Stock
                    <input ref={supplyProductRef} className="input" value={supplyProduct}
                      onChange={(e) => setSupplyProduct(e.target.value)} placeholder="e.g. Blue Dream 28g" />
                  </label>
                  <label className="field-inline">
                    Category
                    <select className="select compact" value={supplyCategory} onChange={(e) => setSupplyCategory(e.target.value)}>
                      <option value="">Category</option>
                      {reference.data?.categories.map((cat) => <option key={cat}>{cat}</option>)}
                    </select>
                  </label>
                  <label className="field-inline">
                    Qty
                    <input className="input compact" value={availableQty} inputMode="decimal"
                      onChange={(e) => setAvailableQty(e.target.value)} />
                  </label>
                  <label className="field-inline">
                    Ask $
                    <input className="input compact" value={askingPrice} inputMode="decimal"
                      onChange={(e) => setAskingPrice(e.target.value)} />
                  </label>
                  <label className="field-inline">
                    Date
                    <input className="input compact" type="date" value={availableDate}
                      onChange={(e) => setAvailableDate(e.target.value)} />
                  </label>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!vendorId || !supplyProduct.trim() || !supplyCategory || Number(availableQty) <= 0 || isRunning}
                    onClick={createSupply}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Stock
                  </button>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {/* ── Active grid (one at a time, driven by ViewTabBar) ── */}
      {activeTab === TAB_MATCHES && (
        <OperatorGrid
          view="matchmaking"
          title="Deterministic Matches"
          rows={statusFilteredMatches}
          columns={matchColumns}
          rowClassRules={matchRowClassRules}
          loading={board.isLoading || isRunning}
          onSelectionChange={setSelectedMatches}
          emptyTitle="No matches yet"
          emptyChildren="Add a customer need and vendor stock with matching category or tags."
          expansionConfig={matchExpansionConfig}
        />
      )}

      {activeTab === TAB_TO_MOVE && (
        <OperatorGrid
          view="matchmaking"
          title="Inventory to Move"
          subtitle={`Based on purchase history (last ${s.historyLookbackDays} days)`}
          rows={(opportunities.data?.toMove ?? []) as GridRow[]}
          columns={toMoveColumns}
          loading={opportunities.isLoading}
          emptyTitle="No opportunities yet"
          emptyChildren="Inventory opportunities appear once customers have purchase history or posted needs."
        />
      )}

      {activeTab === TAB_GAPS && (
        <OperatorGrid
          view="matchmaking"
          title="Gaps to Fill"
          subtitle={`Based on purchase history (last ${s.historyLookbackDays} days)`}
          rows={(opportunities.data?.toSource ?? []) as GridRow[]}
          columns={toSourceColumns}
          loading={opportunities.isLoading}
          emptyTitle="No gaps detected"
          emptyChildren="Sourcing suggestions appear when inventory in a category drops to or below the gap threshold."
        />
      )}

      {activeTab === TAB_NEEDS && (
        <OperatorGrid
          view="matchmaking"
          title="Customer Needs"
          rows={filteredNeeds}
          columns={needCols}
          loading={board.isLoading || isRunning}
          onCellCommit={canWrite ? updateNeedCell : undefined}
        />
      )}

      {activeTab === TAB_STOCK && (
        <OperatorGrid
          view="matchmaking"
          title="Vendor Stock"
          rows={filteredSupplies}
          columns={supplyCols}
          loading={board.isLoading || isRunning}
          onCellCommit={canWrite ? updateSupplyCell : undefined}
        />
      )}

      {/* ── Bulk action bar (on match selection) ── */}
      <BulkActionBar
        selectedCount={selectedMatches.length}
        entityLabel="match"
        actions={bulkActions}
        onClear={() => setSelectedMatches([])}
      />
    </div>
  );
}
