import { ChevronDown, ChevronRight, FileDown, PackageCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { FilterPresetStrip, StatusActionBar, type StatusActionTable } from '../components/templates';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { GridRow } from '../../shared/types';
import { columnsByView, EMPTY_ROWS } from './operations/shared';

// UX-L04: chip cellRenderers for labelsPrinted and manifestPath.
// labelsPrinted is a boolean on pick_lists; manifest is derivable as
// "exists" when manifestPath is a non-empty string. Both signals are
// already on the wire (queries.ts fulfillment row projection).
// printLabels stays deferred (TER-1660) — chips display state only.

/** "Labels ✓" chip when printed; muted dash otherwise. */
const labelsPrintedChipCol: ColDef<GridRow> = {
  field: 'labelsPrinted',
  headerName: 'Labels',
  width: 115,
  filter: 'agSetColumnFilter',
  cellClass: 'text-center',
  filterParams: {
    valueFormatter: (params: { value: unknown }) =>
      params.value ? 'Printed' : 'Not printed',
  },
  cellRenderer: (params: { value: unknown }) => {
    if (params.value) {
      return (
        <span
          className="finder-chip success text-xs"
          title="Labels have been printed for this pick list"
        >
          Labels ✓
        </span>
      );
    }
    return <span className="text-xs text-zinc-400" title="Labels not yet printed">Labels —</span>;
  },
};

/** "Manifest ✓" chip when manifestPath is set; muted dash otherwise. */
const manifestChipCol: ColDef<GridRow> = {
  field: 'manifestPath',
  headerName: 'Manifest',
  width: 120,
  filter: 'agSetColumnFilter',
  cellClass: 'text-center',
  filterParams: {
    valueFormatter: (params: { value: unknown }) =>
      params.value ? 'Generated' : 'Not generated',
  },
  cellRenderer: (params: { value: unknown }) => {
    const hasManifest = Boolean(params.value) && String(params.value ?? '').trim() !== '';
    if (hasManifest) {
      return (
        <span
          className="finder-chip success text-xs"
          title="Manifest CSV has been generated for this pick list"
        >
          Manifest ✓
        </span>
      );
    }
    return (
      <span className="text-xs text-zinc-400" title="Manifest not yet generated">
        Manifest —
      </span>
    );
  },
};

/**
 * Fulfillment pick-queue column set. Identical to columnsByView.fulfillment
 * except labelsPrinted and manifestPath are replaced with chip renderers
 * (UX-L04) so closeout-readiness is visible at a glance without opening the
 * drawer.
 */
export const fulfillmentPickColumns: ColDef<GridRow>[] = (columnsByView.fulfillment ?? []).map(
  (col) => {
    if (col.field === 'labelsPrinted') return labelsPrintedChipCol;
    if (col.field === 'manifestPath') return manifestChipCol;
    return col;
  }
);

// UX-D01: navigate to orders view filtered to a specific order after fulfillment.
function useOrderDeepLink() {
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const navigate = useNavigate();
  return (orderId: string | undefined) => {
    if (!orderId) return;
    setGridFilter('orders', `id:${orderId}`);
    setDrawerEntity('orders', 'order', orderId);
    setDrawerState('orders', 'standard');
    navigate('/orders');
    setActiveView('orders');
  };
}

// CAP-030 / TER-1510 — WarehouseAlert interface matches warehouseAlerts JSONB shape in fulfillment_lines
interface WarehouseAlert {
  id: string;
  pickListId: string;
  lineId: string;
  type: 'qty_mismatch' | 'item_not_found' | 'overcount' | 'damaged' | 'other';
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  itemName?: string;
  batchCode?: string;
  createdAt: string;
}

interface PickQueueRow {
  id: string;
  pickNo: string;
  orderId: string;
  customer: string;
  status: 'needs_picking' | 'in_progress' | 'has_alerts' | 'ready_to_close' | 'closed';
  alertCount: number;
  lineCount: number;
  linesPicked: number;
}

const fulfillmentLineColumns: ColDef<GridRow>[] = [
  { field: 'itemName', pinned: 'left', minWidth: 180 },
  { field: 'batchCode', width: 140 },
  { field: 'expectedQty', type: 'numericColumn', width: 130 },
  { field: 'actualQty', editable: true, type: 'numericColumn', width: 120 },
  { field: 'actualWeight', editable: true, type: 'numericColumn', width: 140 },
  { field: 'bagCode', editable: true, width: 140 },
  { field: 'status', width: 120 }
];

export function FulfillmentView() {
  const grid = trpc.queries.grid.useQuery({ view: 'fulfillment' });
  const selectedRows = useUiStore((state) => state.selectedRows.fulfillment);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const pickRows = (grid.data ?? []) as GridRow[];
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedPick = selected[0];
  const lines = trpc.queries.fulfillmentLines.useQuery({ pickListId: String(selectedPick?.id ?? '00000000-0000-0000-0000-000000000000') }, { enabled: Boolean(selectedPick?.id) });
  const [selectedLines, setSelectedLines] = useState<GridRow[]>([]);
  const [actualQty, setActualQty] = useState('');
  const [actualWeight, setActualWeight] = useState('');
  const [bagCode, setBagCode] = useState('');
  const [tracking, setTracking] = useState('');
  const [labelFormat, setLabelFormat] = useState('4x6');
  const [printTrayOpen, setPrintTrayOpen] = useState(false);
  // CAP-030 / TER-1510 — filter chips (non-persisted)
  const pickQueueFilters = useUiStore((state) => state.pickQueueFilters);
  const setPickQueueFilter = useUiStore((state) => state.setPickQueueFilter);
  const clearPickQueueFilters = useUiStore((state) => state.clearPickQueueFilters);
  // SX-K06: the picks grid and lines grid now use distinct filter slots
  // ('fulfillment-picks' / 'fulfillment-lines') so their filter state is
  // independent. Pick filter defaults to status:open on first mount.
  const fulfillmentGridFilter = useUiStore((state) => state.gridFilters?.['fulfillment-picks'] ?? '');
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  useEffect(() => {
    if (!fulfillmentGridFilter) {
      setGridFilter('fulfillment-picks', 'status:open');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // GH #354: grid-filter presets now rendered via FilterPresetStrip template
  const [alertsDrawerOpen, setAlertsDrawerOpen] = useState(false);
  const [alertsPickListId, setAlertsPickListId] = useState<string | null>(null);

  // K8 (phase7-keyboard-a11y-audit): Trap focus inside the alerts drawer.
  const alertsRef = useFocusTrap<HTMLDivElement>(alertsDrawerOpen, () => setAlertsDrawerOpen(false));
  const [alertReturnQty, setAlertReturnQty] = useState('');
  // CAP-030 / TER-1510 — derive live alerts from fulfillmentLines.warehouseAlerts JSONB (backend now merged)
  const liveAlerts: Array<WarehouseAlert & { alertIndex: number }> = alertsPickListId && lines.data
    ? (lines.data as GridRow[]).flatMap((l) => {
        const rawAlerts = Array.isArray(l.warehouseAlerts) ? (l.warehouseAlerts as WarehouseAlert[]) : [];
        return rawAlerts
          .filter((a) => a.status !== 'acknowledged')
          .map((a, idx) => ({
            ...a,
            lineId: String(l.id ?? ''),
            itemName: a.itemName ?? String(l.itemName ?? ''),
            batchCode: a.batchCode ?? String(l.batchCode ?? ''),
            alertIndex: idx,
          }));
      })
    : [];
  const { runCommand, setNextSuccessActions, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const line = selectedLines[0];
  // UX-D01: deep-link for "View order" after fulfillment
  const openOrderDeepLink = useOrderDeepLink();
  const fulfillmentComplete = Boolean(
    selectedPick?.id &&
      lines.data?.length &&
      lines.data.every((candidate) => String(candidate.status ?? '') === 'packed' || (Number(candidate.actualQty ?? 0) > 0 && Boolean(candidate.bagCode)))
  );

  // CAP-030 / TER-1510 — apply chip filters to pick rows
  const filteredPickRows = pickQueueFilters.size === 0 ? pickRows : pickRows.filter((row) => {
    const status = String(row.status ?? '');
    const alertCount = Number(row.alertCount ?? 0);
    if (pickQueueFilters.has('needs_picking') && status !== 'needs_picking') return false;
    if (pickQueueFilters.has('in_progress') && status !== 'in_progress') return false;
    if (pickQueueFilters.has('has_alerts') && alertCount === 0) return false;
    if (pickQueueFilters.has('ready_to_close') && status !== 'ready_to_close') return false;
    return true;
  });

  useEffect(() => {
    if (!line) {
      setActualQty('');
      setActualWeight('');
      setBagCode('');
      return;
    }
    setActualQty(String(line.actualQty ?? ''));
    setActualWeight(String(line.actualWeight ?? ''));
    setBagCode(String(line.bagCode ?? ''));
  }, [line]);

  return (
    <div className="view-stack">
      {/* CAP-030 / TER-1510 — pick queue filter chips */}
      {canWrite ? (
        <div className="control-band subtle-band flex-wrap gap-1">
          <span className="text-xs text-zinc-500 font-medium">Filter:</span>
          {[
            { key: 'needs_picking', label: 'Needs picking' },
            { key: 'in_progress', label: 'In progress' },
            { key: 'has_alerts', label: 'Has alerts' },
            { key: 'ready_to_close', label: 'Ready to close' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={pickQueueFilters.has(key) ? 'selection-pill warning' : 'selection-pill'}
              onClick={() => setPickQueueFilter(key, !pickQueueFilters.has(key))}
              aria-pressed={pickQueueFilters.has(key)}
            >
              {label}
              {pickQueueFilters.has(key) ? ' ×' : ''}
            </button>
          ))}
          {pickQueueFilters.size > 0 ? (
            <button type="button" className="text-button text-xs" onClick={clearPickQueueFilters}>
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
      <OperatorGrid
        view="fulfillment-picks"
        title="Fulfillment"
        rows={filteredPickRows}
        columns={fulfillmentPickColumns}
        loading={grid.isLoading || isRunning}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        // UX-D03: tailored empty state names the verb + producing surface.
        emptyTitle="No open picks — post an order to create work"
        emptyChildren="Pick lists are created when a confirmed sales order is allocated to fulfillment or a pick list is requested from the Orders view."
        onSelectionChange={(rows) => {
          setSelectedRows('fulfillment', rows);
          setSelectedLines([]);
          if (rows[0]?.id) setAlertsPickListId(String(rows[0].id));
        }}
        actions={canWrite ?
          <>
            {/* UX-L03: correct DB statuses are 'open' and 'fulfilled' (verified
                in schema.ts and commandBus). Previous presets used wrong values
                ('in_progress', 'needs_picking') that never matched any rows.
                'Open picks' is the default-active preset (seeded by useEffect above). */}
            <FilterPresetStrip
              view="fulfillment-picks"
              ariaLabel="Filter fulfillment"
              presets={[
                { label: 'Open picks', filter: 'status:open', title: 'Show only open (active) pick lists' },
                { label: 'Fulfilled', filter: 'status:fulfilled', title: 'Show fulfilled pick lists' }
              ]}
            />
            <span className={selectedPick ? 'selection-pill' : 'selection-pill warning'}>{selectedPick ? `Showing ${String(selectedPick.pickNo ?? 'pick')}` : 'Select a pick row'}</span>
            {/* TER-1660: Label printing deferred to backlog. The Print/Labels
                tray is hidden from the active fulfillment flow; the underlying
                printLabels command remains in the catalog for future re-enable. */}
            {/*
            <button className="secondary-button compact-action" disabled={!selectedPick?.id} onClick={() => setPrintTrayOpen((value) => !value)} type="button" aria-expanded={printTrayOpen}>
              {printTrayOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
              Print
            </button>
            {printTrayOpen ? (
              <>
                <label className="field-inline">
                  Format
                  <select className="select compact" value={labelFormat} onChange={(event) => setLabelFormat(event.target.value)}>
                    <option value="4x6">4x6</option>
                    <option value="2x1">2x1</option>
                  </select>
                </label>
                <button className="secondary-button compact-action" disabled={!selectedPick?.id} onClick={() => runCommand('printLabels', { pickListId: selectedPick?.id, labelFormat }, 'Print labels')} type="button">
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  Labels
                </button>
              </>
            ) : null}
            */}
          </>
          : null}
        selectionActions={canWrite ? (rows) => {
          // Spec §10.7 — status-aware primary for pick rows. Real pick_lists
          // statuses are 'open' and 'fulfilled' only (verified in schema +
          // commandBus); the spec's draft/in_pack/packed/labeled states do
          // not exist — pack progress is derived from the line grid
          // (fulfillmentComplete). printLabels stays out of the bar per the
          // TER-1660 deferral.
          // UX-D01: success toast for fulfillment deep-links to the order.
          const fulfillAct = {
            key: 'fulfilled',
            label: 'Mark fulfilled',
            icon: <PackageCheck className="h-4 w-4" aria-hidden="true" />,
            disabled: !fulfillmentComplete,
            disabledReason: 'Pack every line (qty + bag code) below before fulfilling',
            run: (r: GridRow[]) => {
              const orderId = String(r[0]?.orderId ?? '');
              setNextSuccessActions?.([{ label: 'View order', onAction: () => openOrderDeepLink(orderId) }]);
              return runCommand('markOrderFulfilled', { orderId: r[0]?.orderId, tracking }, 'Mark order fulfilled');
            }
          };
          const pickTable: StatusActionTable = {
            rules: [
              { when: 'open', primary: fulfillAct, tray: [] },
              { when: 'fulfilled', primary: null, tray: [] },
              // Catch-all: the verb stays reachable for unknown statuses.
              { when: () => true, primary: null, tray: [fulfillAct] }
            ]
          };
          return <StatusActionBar rows={rows} table={pickTable} busy={isRunning} />;
        } : undefined}
      />
      {canWrite && line ? (
        <div className="control-band fulfillment-pack-strip">
          <span className="selection-pill">{String(line.itemName ?? 'Selected line')} / {String(line.batchCode ?? 'batch')}</span>
          <label className="field-inline">
            Qty
            <input className="input compact" value={actualQty} onChange={(event) => setActualQty(event.target.value)} />
          </label>
          <label className="field-inline">
            Weight
            <input className="input compact" value={actualWeight} onChange={(event) => setActualWeight(event.target.value)} />
          </label>
          <label className="field-inline">
            Bag
            <input className="input compact" value={bagCode} onChange={(event) => setBagCode(event.target.value)} />
          </label>
          <label className="field-inline">
            Tracking
            <input className="input compact" value={tracking} onChange={(event) => setTracking(event.target.value)} />
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!actualQty || !bagCode}
            title={!actualQty ? 'Enter actual quantity before packing' : !bagCode ? 'Enter a bag code before packing' : undefined}
            onClick={() =>
              runCommand(
                'recordWeighAndPack',
                {
                  fulfillmentLineId: line.id,
                  actualQty: actualQty ? Number(actualQty) : line.actualQty,
                  actualWeight: actualWeight ? Number(actualWeight) : line.actualWeight,
                  bagCode: bagCode || line.bagCode
                },
                'Record fulfillment line bagging'
              )
            }
          >
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            Pack line
          </button>
        </div>
      ) : null}
      <OperatorGrid
        view="fulfillment-lines"
        title="Fulfillment Lines"
        rows={(lines.data ?? []) as GridRow[]}
        columns={fulfillmentLineColumns}
        loading={lines.isLoading}
        onSelectionChange={setSelectedLines}
        emptyTitle={selectedPick ? 'No lines on this pick' : 'No pick selected'}
        emptyChildren={selectedPick ? 'Allocate an order to fulfillment to create pack lines.' : 'Select a fulfillment row to load pack lines.'}
        onCellCommit={canWrite ? (event) => {
          if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
          runCommand('adjustFulfillmentLine', { fulfillmentLineId: event.data.id, [event.colDef.field]: event.newValue }, `Inline fulfillment edit: ${event.colDef.field}`);
        } : undefined}
      />
      {/* CAP-030 / TER-1510 — Alerts drawer */}
      {canWrite && alertsDrawerOpen && alertsPickListId ? (
        <div ref={alertsRef} className="inline-panel border-t border-line">
          <div className="flex items-center justify-between">
            <h2 className="section-title">
              Warehouse Alerts
              {liveAlerts.length > 0 ? (
                <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {liveAlerts.length}
                </span>
              ) : null}
            </h2>
            <button type="button" className="icon-button" onClick={() => setAlertsDrawerOpen(false)} aria-label="Close alerts panel">×</button>
          </div>
          {liveAlerts.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No alerts for this pick list.</p>
          ) : (
            <div className="mt-2 divide-y divide-line">
              {liveAlerts.map((alert) => (
                <div key={alert.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-sm font-medium text-ink">{alert.itemName ?? alert.lineId}</span>
                      <span className="ml-2 text-xs text-zinc-500">{alert.batchCode}</span>
                      <p className="mt-0.5 text-xs text-zinc-600">{alert.message}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        className="secondary-button compact-action text-xs"
                        disabled={isRunning}
                        onClick={() => {
                          runCommand('acknowledgeWarehouseAlert', { fulfillmentLineId: alert.lineId, alertIndex: alert.alertIndex }, 'Acknowledge warehouse alert');
                        }}
                      >
                        Acknowledge
                      </button>
                      <div className="flex gap-1">
                        <input aria-label="Qty"
                          className="input compact w-16"
                          value={alertReturnQty}
                          inputMode="decimal"
                          placeholder="Qty"
                          min="0.001"
                          step="0.001"
                          type="number"
                          onChange={(e) => setAlertReturnQty(e.target.value)}
                        />
                        <button
                          type="button"
                          className="secondary-button compact-action text-xs"
                          disabled={isRunning || !alertReturnQty || Number(alertReturnQty) <= 0}
                          onClick={() => {
                            runCommand('returnPickedUnits', { fulfillmentLineId: alert.lineId, qty: Number(alertReturnQty) }, 'Return picked units');
                            setAlertReturnQty('');
                          }}
                        >
                          Return
                        </button>
                      </div>
                      <button
                        type="button"
                        className="secondary-button compact-action text-xs"
                        disabled={isRunning}
                        onClick={() => {
                          runCommand('cancelFulfillmentLine', { fulfillmentLineId: alert.lineId }, 'Cancel fulfillment line from alert');
                        }}
                      >
                        Mark cancelled
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Toggle alerts drawer when row has alerts */}
      {canWrite && selectedPick && Number(selectedPick.alertCount ?? 0) > 0 && !alertsDrawerOpen ? (
        <div className="control-band subtle-band">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setAlertsDrawerOpen(true);
              setAlertsPickListId(String(selectedPick.id));
            }}
          >
            View {Number(selectedPick.alertCount)} alerts for {String(selectedPick.pickNo ?? 'this pick')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
