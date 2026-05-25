import { Check, Plus, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
const needColumns: ColDef<GridRow>[] = [
  { field: 'needCode', headerName: 'Need', pinned: 'left', width: 120 },
  { field: 'customer', width: 170 },
  { field: 'productName', headerName: 'Request', editable: true, minWidth: 180 },
  { field: 'category', editable: true, width: 120 },
  { field: 'qtyMin', headerName: 'Qty', editable: true, type: 'numericColumn', width: 100 },
  { field: 'targetPrice', headerName: 'Target $', editable: true, type: 'numericColumn', width: 110 },
  { field: 'neededBy', headerName: 'By', editable: true, width: 130 },
  { field: 'status', width: 115 },
];

const supplyColumns: ColDef<GridRow>[] = [
  { field: 'supplyCode', headerName: 'Stock', pinned: 'left', width: 120 },
  { field: 'vendor', width: 170 },
  { field: 'productName', headerName: 'Product', editable: true, minWidth: 180 },
  { field: 'category', editable: true, width: 120 },
  { field: 'availableQty', headerName: 'Qty', editable: true, type: 'numericColumn', width: 100 },
  { field: 'askingPrice', headerName: 'Ask $', editable: true, type: 'numericColumn', width: 110 },
  { field: 'availableDate', headerName: 'Available', editable: true, width: 130 },
  { field: 'status', width: 115 },
];

export function MatchmakingView() {
  const reference = trpc.queries.reference.useQuery();
  const board = trpc.queries.matchmakingBoard.useQuery();
  const settings = trpc.queries.matchmakingSettings.useQuery();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const canManageSettings = me.data?.role === 'manager' || me.data?.role === 'owner';
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
  const activeQuickLaunch = useUiStore((state) => state.activeQuickLaunch);
  const { runCommand, isRunning } = useCommandRunner();
  const needProductRef = useRef<HTMLInputElement | null>(null);
  const supplyProductRef = useRef<HTMLInputElement | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<GridRow[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [needProduct, setNeedProduct] = useState('');
  const [needCategory, setNeedCategory] = useState('');
  const [qtyMin, setQtyMin] = useState('0');
  const [targetPrice, setTargetPrice] = useState('');
  const [neededBy, setNeededBy] = useState('');

  const [vendorId, setVendorId] = useState('');
  const [supplyProduct, setSupplyProduct] = useState('');
  const [supplyCategory, setSupplyCategory] = useState('');
  const [availableQty, setAvailableQty] = useState('0');
  const [askingPrice, setAskingPrice] = useState('');
  const [availableDate, setAvailableDate] = useState('');

  // C1: controlled state for number inputs — synced from server on load
  const [localFloor, setLocalFloor] = useState(s.matchQualityFloor);
  const [localThreshold, setLocalThreshold] = useState(s.workQueueThreshold);
  const [localGapFloor, setLocalGapFloor] = useState(s.gapFloorQty);

  useEffect(() => {
    setLocalFloor(s.matchQualityFloor);
    setLocalThreshold(s.workQueueThreshold);
    setLocalGapFloor(s.gapFloorQty);
  }, [s.matchQualityFloor, s.workQueueThreshold, s.gapFloorQty]);

  useEffect(() => {
    if (activeQuickLaunch === 'customerNeed') needProductRef.current?.focus();
    if (activeQuickLaunch === 'vendorSupply') supplyProductRef.current?.focus();
  }, [activeQuickLaunch]);

  async function updateSettings(patch: Record<string, unknown>) {
    try {
      await runCommand('updateMatchmakingSettings', patch, 'Update matchmaking settings');
      settings.refetch();
    } catch {
      // error toast already handled by useCommandRunner
    }
  }

  async function createNeed() {
    await runCommand(
      'createCustomerNeed',
      {
        customerId,
        productName: needProduct,
        category: needCategory,
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

  async function updateNeedCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    await runCommand('updateCustomerNeed', { customerNeedId: event.data.id, [String(event.colDef.field)]: event.newValue }, `Inline customer need edit: ${event.colDef.field}`);
  }

  async function updateSupplyCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    await runCommand('updateVendorSupply', { vendorSupplyId: event.data.id, [String(event.colDef.field)]: event.newValue }, `Inline vendor stock edit: ${event.colDef.field}`);
  }

  async function acceptSelected() {
    for (const row of selectedMatches) await runCommand('acceptMatchmakingMatch', { matchId: row.id }, 'Accept matchmaking row');
  }

  async function dismissSelected() {
    for (const row of selectedMatches) await runCommand('dismissMatchmakingMatch', { matchId: row.id }, 'Dismiss matchmaking row');
  }

  const matchColumns = useMemo<ColDef<GridRow>[]>(() => [
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

  const matchExpansionConfig = useMemo(
    () => ({
      enabled: true,
      actionsRenderer: (row: GridRow) => {
        const status = typeof row.status === 'string' ? row.status : '';
        const isOpen = status === 'open';
        const isClosed = status === 'accepted' || status === 'dismissed';
        return (
          <>
            {isOpen ? (
              <>
                <button
                  className="primary-button compact-action"
                  disabled={isRunning || !canWrite}
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
            {isClosed ? (
              <button
                className="secondary-button compact-action"
                disabled={isRunning || !canWrite}
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
    [isRunning, runCommand, canWrite]
  );

  return (
    <div className="view-stack">
      <WorkspacePanel
        panelId="matchmaking:settings"
        title="⚙ Matchmaking Settings"
        collapsedSummary={`Showing matches ≥ ${s.matchQualityFloor} · Work queue alerts ≥ ${s.workQueueThreshold} · ${s.historyLookbackDays}-day history`}
        contentClassName="p-3"
      >
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
      </WorkspacePanel>

      {canWrite ? (
        <WorkspacePanel panelId="matchmaking:entry" title="Matchmaking Entry" contentClassName="p-3">
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="control-band subtle-band">
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
            <div className="control-band subtle-band">
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
          </div>
        </WorkspacePanel>
      ) : null}

      <OperatorGrid
        view="matchmaking"
        title="Deterministic Matches"
        rows={(board.data?.matches ?? []) as GridRow[]}
        columns={matchColumns}
        rowClassRules={matchRowClassRules}
        loading={board.isLoading || isRunning}
        onSelectionChange={setSelectedMatches}
        actions={
          <>
            <button className="primary-button compact-action" type="button" disabled={!selectedMatches.length || isRunning} onClick={acceptSelected}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Accept
            </button>
            <button className="secondary-button compact-action" type="button" disabled={!selectedMatches.length || isRunning} onClick={dismissSelected}>
              <X className="h-4 w-4" aria-hidden="true" />
              Dismiss
            </button>
          </>
        }
        emptyTitle="No matches yet"
        emptyChildren="Add a customer need and vendor stock with matching category or tags."
        expansionConfig={matchExpansionConfig}
      />

      <div className="grid gap-3 xl:grid-cols-2">
        <OperatorGrid
          view="matchmaking"
          title="Customer Needs"
          rows={(board.data?.needs ?? []) as GridRow[]}
          columns={needColumns}
          loading={board.isLoading || isRunning}
          onCellCommit={canWrite ? updateNeedCell : undefined}
        />
        <OperatorGrid
          view="matchmaking"
          title="Vendor Stock"
          rows={(board.data?.supplies ?? []) as GridRow[]}
          columns={supplyColumns}
          loading={board.isLoading || isRunning}
          onCellCommit={canWrite ? updateSupplyCell : undefined}
        />
      </div>
    </div>
  );
}
