import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { formatMoney, moneyCol } from '../utils/format';
import type {
  ColDef,
  GetDetailRowDataParams,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  RowClickedEvent,
  ValueGetterParams
} from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { ReceiptPreviewDrawer } from '../components/ReceiptPreviewDrawer';
import { VerifyAllPreviewBody } from '../components/VerifyAllPreviewBody';
import { MasterDetailView } from '../templates/MasterDetailView';
import { useCommandRunner } from '../components/useCommandRunner';
import { useConfirm } from '../hooks/useConfirm';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import type { IntakeBatchRow, IntakeOrderRow } from './IntakeView.types';
import { markerTooltip } from '../utils/markerLegend';
import { parseTsv, mapTsvToFields, pasteSummary } from '../utils/clipboardPaste';
import { requireShortcut } from '../shortcuts/registry';

// UX-C09: keystroke labels pulled from the shortcuts registry so they stay
// in sync with whatever the actual binding is in Hotkeys.tsx.
const SHORTCUT_DUPLICATE = requireShortcut('intake.duplicate').combo;
const SHORTCUT_READY     = requireShortcut('intake.markReady').combo;
const SHORTCUT_PROCESS   = requireShortcut('intake.process').combo;

// UX-C02: ordered editable fields for TSV paste into the batch detail grid.
const INTAKE_PASTE_FIELDS = ['name', 'intakeQty', 'discrepancyReason', 'notes'] as const;
const INTAKE_PASTE_VALIDATORS: Record<string, (v: string) => boolean> = {
  intakeQty: (v) => v === '' || /^\d+(\.\d+)?$/.test(v.trim()),
};

const EMPTY: IntakeOrderRow[] = [];

export function IntakeView() {
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const intakeQueue = trpc.queries.intakeQueue.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();
  const utils = trpc.useUtils();
  const pushToast = useUiStore((state) => state.pushToast);
  const navigate = useNavigate();
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  // CAP-003 / CAP-011 — TER-1476 / TER-1486: surface PO and batch context in
  // the shared ContextDrawer when an intake row is selected. The outer master
  // row is a PO (drawer → po tabs: lines, linked-intake, vendor); inner detail
  // rows are batches (drawer → lot tabs: movement, sales, photos). The
  // existing ReceiptPreviewDrawer is independent and continues to render in
  // parallel for receipt-preview UX.
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);

  const confirm = useConfirm();
  const apiRef = useRef<GridApi<IntakeOrderRow> | null>(null);
  // UX-H03: selected master (PO) rows — drives the selection totals strip.
  const [selectedOrders, setSelectedOrders] = useState<IntakeOrderRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<IntakeOrderRow | null>(null);
  // TER-1658: CSV import (importBatchesCsv / createBatch without purchaseOrderLineId)
  // was retired from MVP intake. All intake must originate from an approved purchase
  // order via Receive PO. The backend rejects those flows with operator-facing guidance.
  const orderRows = (intakeQueue.data ?? EMPTY) as IntakeOrderRow[];

  // UX-H03: derive selection totals across all selected PO groups.
  // Count = total batch rows (not PO rows) so "4 batches across 1 PO" is clear.
  const selectionTotals = useMemo(() => {
    const batches = selectedOrders.flatMap((order) => order.batches);
    const count = batches.length;
    const qtySum = batches.reduce((acc, b) => acc + Number(b.intakeQty ?? 0), 0);
    const costSum = batches.reduce((acc, b) => acc + Number(b.intakeQty ?? 0) * Number(b.unitCost ?? 0), 0);
    const ownershipMix = [...new Set(batches.map((b) => b.status !== 'posted' ? 'pending' : 'posted'))];
    return { count, qtySum, costSum, ownershipMix };
  }, [selectedOrders]);

  // UX-C02: handle TSV paste onto the intake queue panel container. Pasted
  // rows are treated as annotation-only (they cannot CREATE new batch rows
  // without a PO line — the backend enforces this). Instead, paste here shows
  // a summary toast with field counts so operators know the clipboard content
  // was received and how many cells need fixes. Draft row creation from TSV
  // is infeasible without a new tRPC procedure and PO line association;
  // the paste → summary toast is the safe subset.
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const raw = event.clipboardData.getData('text/plain');
      if (!raw || !raw.includes('\t')) return; // not TSV — let normal paste proceed
      event.preventDefault();
      try {
        const rows = parseTsv(raw);
        if (!rows.length) return;
        const parsed = mapTsvToFields(rows, [...INTAKE_PASTE_FIELDS], INTAKE_PASTE_VALIDATORS);
        pushToast(`TSV paste: ${pasteSummary(parsed)} — rows must be created via PO to enter the grid.`, 'info');
      } catch {
        pushToast('Could not parse pasted content as TSV.', 'error');
      }
    },
    [pushToast]
  );

  async function verifyBatch(batchId: string, intakeQty: string, expectedQty: string | null, discrepancyReason?: string) {
    setBusy(true);
    try {
      const actual = Number(intakeQty);
      const expected = Number(expectedQty ?? 0);

      // Step 1: Persist the actual qty to the batch (mirrors old verifyIntakeForOrder)
      if (Number.isFinite(actual) && actual >= 0) {
        const updateResult = await runCommand(
          'updateBatch',
          { id: batchId, intakeQty: actual, availableQty: actual },
          'Apply actual intake quantity'
        );
        if (!updateResult.ok) return;
      }

      // Step 2: Auto-flag if discrepancy
      if (expected > 0 && actual > 0 && actual !== expected) {
        const reason = discrepancyReason?.trim()
          || `Quantity discrepancy: expected ${expected}, received ${actual}`;
        const flagResult = await runCommand('flagBatch', { batchId, reason }, 'Auto-flag quantity discrepancy');
        if (!flagResult.ok) return; // abort if flag failed; operator sees error toast from runCommand
      }

      // Step 3: Post receipt — pass discrepancyNotes so the server wires it to PO/bill notes
      const discrepancyNotes: Record<string, string> = {};
      if (discrepancyReason?.trim()) discrepancyNotes[batchId] = discrepancyReason.trim();
      await runCommand(
        'postPurchaseReceipt',
        { batchIds: [batchId], discrepancyNotes },
        'Verify single batch intake'
      );
      await utils.queries.intakeQueue.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function setMarketName(itemId: string, alias: string) {
    setBusy(true);
    try {
      await runCommand(
        'setItemAlias',
        { itemId, alias },
        alias ? `Set market name to "${alias}"` : 'Clear market name'
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraftBatch(batchId: string) {
    setBusy(true);
    try {
      await runCommand('deleteBatch', { batchId }, 'Delete draft intake row');
      await utils.queries.intakeQueue.invalidate();
    } finally {
      setBusy(false);
    }
  }

  // Outer master rows are PO groups — pin them as `po` entities so the drawer
  // shows PO tabs (lines / linked-intake / vendor). Without this override the
  // default `inferDrawerEntity` for the intake view would tag the row as a
  // `lot` and the lot-tabs would query inventory_movements with a PO uuid.
  const onOrderRowClicked = useCallback(
    (event: RowClickedEvent<IntakeOrderRow>) => {
      const row = event.data;
      if (!row?.id) return;
      // GridRow uses an index signature; IntakeOrderRow's stricter shape
      // satisfies it but TS needs the cast to bridge the typed `status` fields.
      setSelectedRows('intake', [row as unknown as GridRow]);
      setDrawerEntity('intake', 'po', String(row.id));
      // UX-H03: sync selected orders for the totals strip.
      setSelectedOrders([row]);
    },
    [setSelectedRows, setDrawerEntity]
  );

  // Inner detail rows are batches — keep the default `lot` entity inference
  // but ensure setSelectedRows captures the batch row so the drawer body
  // renders batch-level facts and the lot-movement tab queries by batchId.
  const onBatchRowClicked = useCallback(
    (event: RowClickedEvent<IntakeBatchRow>) => {
      const row = event.data;
      if (!row?.id) return;
      setSelectedRows('intake', [row as unknown as GridRow]);
      setDrawerEntity('intake', 'lot', String(row.id));
    },
    [setSelectedRows, setDrawerEntity]
  );

  // UX-M01: deep-link from a posted intake batch to Recovery prefiltered by the
  // batch's UUID so the operator can view or reverse the postPurchaseReceipt command.
  const handleBatchHistory = useCallback(
    (batchId: string) => {
      setGridFilter('recovery', batchId);
      navigate('/recovery');
    },
    [setGridFilter, navigate]
  );

  const detailCellRendererParams = useMemo(
    () => ({
      detailGridOptions: {
        columnDefs: buildBatchColumns(
          canWrite,
          async (batchId, intakeQty, expectedQty, discrepancyReason) => {
            await verifyBatch(batchId, intakeQty, expectedQty, discrepancyReason);
          },
          async (batchId, reason) => {
            setBusy(true);
            try {
              await runCommand('rejectBatch', { batchId, reason }, 'Reject intake lot from grid');
            } finally {
              setBusy(false);
            }
          },
          async (batchId, currentNotes, addition) => {
            setBusy(true);
            try {
              const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
              const actor = me.data?.name || 'operator';
              const merged = [currentNotes, `[${stamp} ${actor}] ${addition}`].filter(Boolean).join('\n');
              await runCommand('updateBatch', { id: batchId, notes: merged }, 'Update intake notes');
            } finally {
              setBusy(false);
            }
          },
          async (itemId, alias) => {
            await setMarketName(itemId, alias);
          },
          async (batchId) => {
            await deleteDraftBatch(batchId);
          },
          handleBatchHistory
        ),
        defaultColDef: { resizable: true, sortable: true, wrapHeaderText: true, autoHeaderHeight: true } as ColDef<IntakeBatchRow>,
        domLayout: 'autoHeight' as const,
        rowHeight: 28,
        headerHeight: 30,
        // CAP-011 / TER-1486: pipe batch row clicks into the drawer so the
        // lot-movement tab can render the selected batch's history.
        onRowClicked: onBatchRowClicked,
      },
      getDetailRowData: (params: GetDetailRowDataParams<IntakeOrderRow>) => {
        params.successCallback(params.data?.batches ?? []);
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, runCommand, me.data?.name, onBatchRowClicked, handleBatchHistory]
  );

  const columnDefs = useMemo<ColDef<IntakeOrderRow>[]>(
    () => [
      {
        field: 'poNo',
        headerName: 'PO',
        cellRenderer: 'agGroupCellRenderer',
        pinned: 'left',
        minWidth: 180
      },
      { field: 'vendor', headerName: 'Vendor', minWidth: 160 },
      { field: 'status', minWidth: 140 },
      {
        headerName: 'Expected qty',
        valueGetter: (params: ValueGetterParams<IntakeOrderRow>) =>
          params.data ? Number(params.data.expectedTotalQty || 0).toFixed(3) : ''
      },
      {
        headerName: 'Received qty',
        valueGetter: (params: ValueGetterParams<IntakeOrderRow>) =>
          params.data ? Number(params.data.receivedTotalQty || 0).toFixed(3) : ''
      },
      {
        headerName: 'Expected $',
        valueGetter: (params: ValueGetterParams<IntakeOrderRow>) =>
          params.data ? formatMoney(Number(params.data.expectedTotal || 0)) : ''
      },
      {
        headerName: 'Verified $',
        valueGetter: (params: ValueGetterParams<IntakeOrderRow>) =>
          params.data ? formatMoney(Number(params.data.total || 0)) : ''
      },
      {
        headerName: 'Actions',
        pinned: 'right',
        minWidth: 280,
        cellRenderer: (params: ICellRendererParams<IntakeOrderRow>) => {
          const order = params.data;
          if (!order) return null;

          const postedCount = order.batches.filter((b) => b.status === 'posted').length;
          const totalCount = order.batches.length;
          const allVerified = totalCount > 0 && postedCount === totalCount;

          return (
            <div className="flex h-full items-center gap-2">
              <span className={allVerified ? 'selection-pill success' : 'selection-pill'}>
                {postedCount}/{totalCount} verified
              </span>
              {canWrite ? (
                <button
                  type="button"
                  className="secondary-button compact-action"
                  disabled={busy || isRunning || !hasPendingBatches(order)}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: `Verify all intake for ${order.poNo}?`,
                        body: (
                          <VerifyAllPreviewBody
                            batches={order.batches}
                            vendor={order.vendor}
                          />
                        ),
                        primaryLabel: 'Verify all',
                        tone: 'default',
                        persist: true,
                      });
                      if (!ok) return;
                      await verifyAllForOrder(order);
                      pushToast(`Verified all intake for ${order.poNo}.`, 'success');
                    })();
                  }}
                >
                  Verify all
                </button>
              ) : null}
              <button
                type="button"
                className="secondary-button compact-action"
                disabled={!hasPendingBatches(order)}
                onClick={() => setPreviewOrder(order)}
              >
                Preview receipt
              </button>
            </div>
          );
        }
      }
    ],
    [busy, isRunning, canWrite, confirm, pushToast]
  );

  function hasPendingBatches(order: IntakeOrderRow) {
    return order.batches?.some((batch) => ['draft', 'ready', 'needs_fix'].includes(batch.status)) ?? false;
  }

  async function verifyAllForOrder(order: IntakeOrderRow) {
    setBusy(true);
    try {
      await runCommand('verifyAllIntake', { purchaseOrderId: order.id }, `Verify all intake for ${order.poNo}`);
      await utils.queries.intakeQueue.invalidate();
    } finally {
      setBusy(false);
    }
  }

  const onGridReady = useCallback((event: GridReadyEvent<IntakeOrderRow>) => {
    apiRef.current = event.api;
    event.api.sizeColumnsToFit();
  }, []);

  if (intakeQueue.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
        <p className="text-sm">Unable to load intake queue. Check your connection.</p>
        <button className="btn-secondary text-xs" onClick={() => intakeQueue.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <MasterDetailView
      viewKey="intake"
      entityType="intake"
      useLegacyIntake
      detailOpen={Boolean(previewOrder)}
      detailContent={previewOrder ? (
        <ReceiptPreviewDrawer
          order={previewOrder}
          onClose={() => setPreviewOrder(null)}
        />
      ) : undefined}
    >
      {/* UX-C02: onPaste intercepts TSV clipboard data pasted onto the intake
          panel and produces a summary toast. Actual row creation remains
          PO-gated (see handlePaste above). */}
      <div className="view-stack" onPaste={handlePaste}>
        {/* UX-H03: Selection totals strip — shown when one or more PO groups
            are selected in the master grid. Sticky above the Process action. */}
        {selectedOrders.length > 0 ? (
          <div className="receipt-impact-strip" data-testid="intake-selection-totals" role="status" aria-live="polite">
            <span className="text-xs font-semibold text-zinc-700">
              {selectionTotals.count} batch{selectionTotals.count !== 1 ? 'es' : ''}
            </span>
            <span className="text-xs text-zinc-600">
              Qty: <strong>{selectionTotals.qtySum.toFixed(3)}</strong>
            </span>
            <span className="text-xs text-zinc-600">
              Cost: <strong>{formatMoney(selectionTotals.costSum)}</strong>
            </span>
            <button
              type="button"
              className="secondary-button compact-action text-xs"
              disabled={!selectedOrders[0] || !hasPendingBatches(selectedOrders[0])}
              title="Preview the purchase receipt for the selected PO"
              onClick={() => selectedOrders[0] && setPreviewOrder(selectedOrders[0])}
            >
              Preview receipt
            </button>
            {/* UX-C09: Show keystroke labels next to the action verbs */}
            {canWrite ? (
              <span className="text-xs text-zinc-500">
                Duplicate{' '}
                <kbd className="kbd-chip" aria-label={`Shortcut: ${SHORTCUT_DUPLICATE}`}>{SHORTCUT_DUPLICATE}</kbd>
                {' '}· Ready{' '}
                <kbd className="kbd-chip" aria-label={`Shortcut: ${SHORTCUT_READY}`}>{SHORTCUT_READY}</kbd>
                {' '}· Process{' '}
                <kbd className="kbd-chip" aria-label={`Shortcut: ${SHORTCUT_PROCESS}`}>{SHORTCUT_PROCESS}</kbd>
              </span>
            ) : null}
          </div>
        ) : null}
        {/* TER-1658: CSV import and manual batch creation removed from MVP intake.
            All batches must originate from a purchase order via Receive PO.
            Backend (importBatchesCsv, createBatch without purchaseOrderLineId) now
            rejects these flows with operator-facing guidance. */}
        <WorkspacePanel panelId="intake:queue" title="Intake queue" subtitle={`${orderRows.length} purchase order(s) with batches awaiting verification`}>
          <p className="page-subtitle px-3 pb-1">Yellow = qty differs from expected · Red = discrepancy reason required</p>
          <div className="ag-theme-quartz grid-shell">
            <AgGridReact<IntakeOrderRow>
              rowData={orderRows}
              columnDefs={columnDefs}
              defaultColDef={{ sortable: true, resizable: true, filter: true, minWidth: 120, wrapHeaderText: true, autoHeaderHeight: true }}
              masterDetail
              detailRowAutoHeight
              detailCellRendererParams={detailCellRendererParams}
              context={{ busy, isRunning }}
              getRowId={(params) => String(params.data.id)}
              onGridReady={onGridReady}
              onRowClicked={onOrderRowClicked}
              loading={intakeQueue.isLoading || isRunning || busy}
              isRowMaster={(data) => Boolean(data?.batches?.length)}
              animateRows={false}
            />
          </div>
          {!intakeQueue.isLoading && orderRows.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No approved purchase orders with linked intake batches yet. Approve a PO to populate this queue.</div>
          ) : null}
        </WorkspacePanel>

      </div>
    </MasterDetailView>
  );
}

function buildBatchColumns(
  canWrite: boolean,
  onVerify: (batchId: string, intakeQty: string, expectedQty: string | null, discrepancyReason?: string) => Promise<void>,
  onReject: (batchId: string, reason: string) => Promise<void>,
  onAppendNote: (batchId: string, currentNotes: string | null, addition: string) => Promise<void>,
  onSetMarketName: (itemId: string, alias: string) => Promise<void>,
  onDeleteDraft: (batchId: string) => Promise<void>,
  /** UX-M01: deep-link to Recovery prefiltered by batchId for posted batches */
  onHistory: (batchId: string) => void
): ColDef<IntakeBatchRow>[] {
  return [
    { field: 'batchCode', headerName: 'Batch', pinned: 'left', minWidth: 160 },
    { field: 'name', minWidth: 180 },
    { field: 'subcategory', width: 120 },
    {
      field: 'itemAlias',
      headerName: 'Market name',
      editable: false,
      minWidth: 160,
      tooltipValueGetter: (params) =>
        params.value ? `Market name: ${params.value}. Set via "Add market name" on this row.` : 'No market name set. Use "Add market name" to assign one.'
    },
    {
      headerName: 'Expected qty',
      valueGetter: (params: ValueGetterParams<IntakeBatchRow>) => (params.data?.expectedQty != null ? Number(params.data.expectedQty).toFixed(3) : ''),
      editable: false,
      minWidth: 120
    },
    {
      field: 'intakeQty',
      headerName: 'Actual qty',
      editable: canWrite,
      type: 'numericColumn',
      minWidth: 140,
      valueParser: (params) => {
        const next = Number(params.newValue);
        return Number.isFinite(next) && next >= 0 ? next : params.oldValue;
      },
      cellStyle: (params) => {
        const expected = Number(params.data?.expectedQty ?? 0);
        const actual = Number(params.value ?? 0);
        return expected && actual && expected !== actual ? { backgroundColor: '#fef9c3' } : null;
      },
      // UX-S03: warning glyph for yellow-tinted cells (qty differs from expected).
      cellRenderer: (params: ICellRendererParams<IntakeBatchRow>) => {
        const expected = Number(params.data?.expectedQty ?? 0);
        const actual = Number(params.data?.intakeQty ?? 0);
        const hasMismatch = expected > 0 && actual > 0 && expected !== actual;
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasMismatch ? (
              <AlertTriangle
                className="h-3 w-3 flex-shrink-0"
                style={{ color: '#92400e' }}
                aria-label={`Qty mismatch: expected ${expected.toFixed(3)}, received ${actual.toFixed(3)}`}
                data-testid="intake-qty-warning"
              />
            ) : null}
            {params.value != null ? String(params.value) : ''}
          </span>
        );
      },
      tooltipValueGetter: (params) => {
        const expected = Number(params.data?.expectedQty ?? 0);
        const actual = Number(params.data?.intakeQty ?? 0);
        if (expected && actual && expected !== actual) {
          return `Off by ${(actual - expected).toFixed(3)} from expected ${expected.toFixed(3)}`;
        }
        return null;
      }
    },
    {
      field: 'discrepancyReason',
      headerName: 'Discrepancy reason',
      editable: canWrite,
      minWidth: 240,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true,
      cellStyle: (params) => {
        const expected = Number(params.data?.expectedQty ?? 0);
        const actual = Number(params.data?.intakeQty ?? 0);
        const hasMismatch = expected && actual && expected !== actual;
        const hasReason = String(params.value ?? '').trim().length > 0;
        if (hasMismatch && !hasReason) return { backgroundColor: '#fee2e2' };
        return null;
      },
      // UX-S03: warning glyph for red-tinted cells (discrepancy reason required).
      cellRenderer: (params: ICellRendererParams<IntakeBatchRow>) => {
        const expected = Number(params.data?.expectedQty ?? 0);
        const actual = Number(params.data?.intakeQty ?? 0);
        const hasMismatch = expected > 0 && actual > 0 && expected !== actual;
        const hasReason = String(params.value ?? '').trim().length > 0;
        const needsReason = hasMismatch && !hasReason;
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {needsReason ? (
              <AlertTriangle
                className="h-3 w-3 flex-shrink-0"
                style={{ color: '#991b1b' }}
                aria-label="Discrepancy reason required — enter reason for qty mismatch"
                data-testid="intake-reason-warning"
              />
            ) : null}
            {params.value != null ? String(params.value) : ''}
          </span>
        );
      },
      tooltipValueGetter: () => 'Free-text reason; carried onto the vendor bill and PO notes when intake is verified.'
    },
    { ...(moneyCol('unitCost', { headerName: 'Unit cost', width: 110 }) as ColDef<IntakeBatchRow>), type: 'numericColumn', editable: false, minWidth: 110 },
    { field: 'status', minWidth: 110 },
    // UX-H05: arrivalStatus inline editable select cell — lets operators update
    // pending/arrived/canceled independent of ownership or raw marker value.
    {
      field: 'arrivalStatus',
      headerName: 'Arrival',
      width: 130,
      editable: canWrite,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['pending', 'arrived', 'canceled'] },
      tooltipValueGetter: () => 'Arrival status — click to change: pending / arrived / canceled',
    },
    { field: 'mediaStatus', headerName: 'Media', width: 110 },
    { field: 'notes', headerName: 'Notes', editable: false, minWidth: 220 },
    {
      headerName: 'Actions',
      pinned: 'right',
      minWidth: 300,
      cellRenderer: (params: ICellRendererParams<IntakeBatchRow>) => {
        const row = params.data;
        if (!row || !canWrite) return null;
        const ctx = params.context as { busy: boolean; isRunning: boolean } | undefined;
        return (
          <BatchRowActions
            row={row}
            busy={ctx?.busy ?? false}
            isRunning={ctx?.isRunning ?? false}
            onVerify={onVerify}
            onReject={onReject}
            onAppendNote={onAppendNote}
            onSetMarketName={onSetMarketName}
            onDeleteDraft={onDeleteDraft}
            onHistory={onHistory}
          />
        );
      }
    }
  ];
}

const REJECT_REASONS = [
  { value: 'over_weight', label: 'Over weight' },
  { value: 'wrong_product', label: 'Wrong product' },
  { value: 'quality_fail', label: 'Quality fail' },
  { value: 'pricing_dispute', label: 'Pricing dispute' },
  { value: 'paperwork_mismatch', label: 'Paperwork mismatch' },
  { value: 'other', label: 'Other (specify)' },
] as const;

function BatchRowActions({
  row,
  busy,
  isRunning,
  onVerify,
  onReject,
  onAppendNote,
  onSetMarketName,
  onDeleteDraft,
  onHistory,
}: {
  row: IntakeBatchRow;
  busy: boolean;
  isRunning: boolean;
  onVerify: (batchId: string, intakeQty: string, expectedQty: string | null, discrepancyReason?: string) => Promise<void>;
  onReject: (batchId: string, reason: string) => Promise<void>;
  onAppendNote: (batchId: string, currentNotes: string | null, addition: string) => Promise<void>;
  onSetMarketName: (itemId: string, alias: string) => Promise<void>;
  onDeleteDraft: (batchId: string) => Promise<void>;
  /** UX-M01: navigate to Recovery prefiltered by batchId */
  onHistory: (batchId: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'reject' | 'note' | 'marketName' | 'confirmDelete'>('idle');
  const [inputValue, setInputValue] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectReasonOther, setRejectReasonOther] = useState('');

  const canVerify = row.status === 'draft' || row.status === 'ready';
  const canAct = row.status !== 'returned' && row.status !== 'posted';

  function openMode(next: 'reject' | 'note' | 'marketName', prefill = '') {
    setMode(next);
    setInputValue(prefill);
  }

  function cancel() {
    setMode('idle');
    setInputValue('');
    setRejectReason('');
    setRejectReasonOther('');
  }

  if (mode === 'idle') {
    return (
      <div className="flex h-full items-center gap-1">
        <button
          type="button"
          className="primary-button compact-action"
          disabled={!canVerify || busy || isRunning}
          title={!canVerify ? `Cannot verify: batch is ${row.status}` : 'Verify this batch'}
          onClick={() => void onVerify(row.id, row.intakeQty, row.expectedQty, row.discrepancyReason)}
        >
          Verify
        </button>
        <button
          type="button"
          className="secondary-button compact-action"
          disabled={!canAct}
          onClick={() => openMode('reject')}
        >
          Reject
        </button>
        <button
          type="button"
          className="secondary-button compact-action"
          onClick={() => openMode('note')}
        >
          Add note
        </button>
        <button
          type="button"
          className="secondary-button compact-action"
          disabled={!row.itemId}
          title={!row.itemId ? 'Batch not linked to a catalog item' : 'Set market name for this item'}
          onClick={() => openMode('marketName', row.itemAlias ?? '')}
        >
          Market name
        </button>
        {row.status === 'draft' ? (
          <button
            type="button"
            className="secondary-button compact-action"
            style={{ color: 'var(--color-danger, #b42318)' }}
            title="Delete this draft batch"
            onClick={() => setMode('confirmDelete')}
          >
            Delete
          </button>
        ) : null}
        {/* UX-M01 / UX-H02: posted batches get a History / Reverse receipt
            affordance that deep-links Recovery pre-filtered to this batch's
            commands. Minimum-viable path — no full RowInspector on intake. */}
        {row.status === 'posted' ? (
          <button
            type="button"
            className="secondary-button compact-action"
            title="View command history or reverse this receipt in Recovery"
            onClick={() => onHistory(row.id)}
            data-testid="batch-history-link"
          >
            History / Reverse receipt
          </button>
        ) : null}
      </div>
    );
  }

  if (mode === 'confirmDelete') {
    return (
      <div className="flex h-full items-center gap-1">
        <span className="text-xs text-zinc-600">Delete this draft?</span>
        <button
          type="button"
          className="secondary-button compact-action"
          style={{ color: 'var(--color-danger, #b42318)' }}
          onClick={async () => {
            await onDeleteDraft(row.id);
            cancel();
          }}
        >
          Confirm delete
        </button>
        <button type="button" className="secondary-button compact-action" onClick={cancel}>
          Cancel
        </button>
      </div>
    );
  }

  if (mode === 'reject') {
    const submitValue = rejectReason === 'other' ? rejectReasonOther.trim() : rejectReason;
    return (
      <div className="flex h-full items-center gap-1">
        <select aria-label="Reject reason"
          className="input compact"
          autoFocus
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
        >
          <option value="">Select a reason...</option>
          {REJECT_REASONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        {rejectReason === 'other' && (
          <textarea aria-label="Describe the reason..."
            className="input compact"
            placeholder="Describe the reason..."
            value={rejectReasonOther}
            onChange={(e) => setRejectReasonOther(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
            rows={1}
          />
        )}
        <button
          type="button"
          className="primary-button compact-action"
          disabled={!submitValue}
          onClick={async () => {
            if (!submitValue) return;
            await onReject(row.id, submitValue);
            cancel();
          }}
        >
          Reject
        </button>
        <button type="button" className="secondary-button compact-action" onClick={cancel}>
          Cancel
        </button>
      </div>
    );
  }

  const placeholder =
    mode === 'note' ? 'Add a note…' :
    'Market name';

  const label =
    mode === 'note' ? 'Save note' :
    'Set name';

  return (
    <div className="flex h-full items-center gap-1">
      <input aria-label="Input value"
        className="input compact"
        autoFocus
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
      />
      <button
        type="button"
        className="primary-button compact-action"
        disabled={mode !== 'note' && !inputValue.trim()}
        onClick={async () => {
          const value = inputValue.trim();
          if (mode === 'note') {
            if (!value) { cancel(); return; }
            await onAppendNote(row.id, row.notes ?? null, value);
          } else if (mode === 'marketName') {
            if (!row.itemId) return;
            await onSetMarketName(row.itemId, value);
          }
          cancel();
        }}
      >
        {label}
      </button>
      <button type="button" className="secondary-button compact-action" onClick={cancel}>
        Cancel
      </button>
    </div>
  );
}
