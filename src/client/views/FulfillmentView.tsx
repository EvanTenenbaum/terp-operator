import { PackageCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GridColDef } from '../../shared/grid-types';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { GridView } from '../templates/GridView';
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
const labelsPrintedChipCol: GridColDef<GridRow> = {
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
const manifestChipCol: GridColDef<GridRow> = {
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
export const fulfillmentPickColumns: GridColDef<GridRow>[] = (columnsByView.fulfillment ?? []).map(
  (col) => {
    if (col.field === 'labelsPrinted') return labelsPrintedChipCol;
    if (col.field === 'manifestPath') return manifestChipCol;
    return col;
  }
);

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

const fulfillmentLineColumns: GridColDef<GridRow>[] = [
  { field: 'itemName', pinned: 'left', minWidth: 180 },
  { field: 'batchCode', width: 140 },
  { field: 'expectedQty', type: 'numericColumn', width: 130 },
  { field: 'actualQty', editable: true, type: 'numericColumn', width: 120 },
  { field: 'actualWeight', editable: true, type: 'numericColumn', width: 140 },
  { field: 'bagCode', editable: true, width: 140 },
  { field: 'status', width: 120 }
];

export function FulfillmentView() {
  const selectedRows = useUiStore((state) => state.selectedRows.fulfillment);
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedPick = selected[0];
  const lines = trpc.fulfillment.fulfillmentLines.useQuery({ pickListId: String(selectedPick?.id ?? '00000000-0000-0000-0000-000000000000') }, { enabled: Boolean(selectedPick?.id) });
  const [selectedLines, setSelectedLines] = useState<GridRow[]>([]);
  const [actualQty, setActualQty] = useState('');
  const [actualWeight, setActualWeight] = useState('');
  const [bagCode, setBagCode] = useState('');
  const [tracking, setTracking] = useState('');

  // CAP-030 / TER-1510 — filter chips (non-persisted)
  const pickQueueFilters = useUiStore((state) => state.pickQueueFilters);
  const setPickQueueFilter = useUiStore((state) => state.setPickQueueFilter);
  const clearPickQueueFilters = useUiStore((state) => state.clearPickQueueFilters);

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
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const line = selectedLines[0];
  const fulfillmentComplete = Boolean(
    selectedPick?.id &&
      lines.data?.length &&
      lines.data.every((candidate) => String(candidate.status ?? '') === 'packed' || (Number(candidate.actualQty ?? 0) > 0 && Boolean(candidate.bagCode)))
  );

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

  // Wire selectedPick from GridView's selection (via useUiStore)
  useEffect(() => {
    if (selectedPick?.id) setAlertsPickListId(String(selectedPick.id));
  }, [selectedPick?.id]);

  return (
    <div className="h-full flex flex-col">
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

      {/* ── Main grid — GridView template handles picks grid (columns, filtering, bulk actions, slide-over) ── */}
      <div className="flex-1 min-h-0">
        <GridView viewKey="fulfillment" entityType="fulfillmentLine" />
      </div>

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
