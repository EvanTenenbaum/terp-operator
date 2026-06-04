import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
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
import { useCommandRunner } from '../components/useCommandRunner';
import { useConfirm } from '../hooks/useConfirm';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useUiStore } from '../store/uiStore';
import type { CommandResult, GridRow } from '../../shared/types';
import type { IntakeBatchRow, IntakeOrderRow } from './IntakeView.types';

const EMPTY: IntakeOrderRow[] = [];

export function IntakeView() {
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const intakeQueue = trpc.queries.intakeQueue.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();
  const utils = trpc.useUtils();
  const pushToast = useUiStore((state) => state.pushToast);
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
  const [busy, setBusy] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('name,category,vendor,intake_qty,unit_cost,source_code,legacy_marker,ownership_status,notes\n');
  const [csvResult, setCsvResult] = useState<CommandResult | null>(null);
  const [previewOrder, setPreviewOrder] = useState<IntakeOrderRow | null>(null);
  // TER-1627 (F-13/F-32): drag-and-drop affordance for the CSV import textarea
  const [csvDragActive, setCsvDragActive] = useState(false);
  // #21 slice 3 (UX-A9): inline confirm panels each get a focus trap so Tab
  // stays in-panel and Escape collapses them, matching CommandPalette /
  // RefereeRelationshipDialog. The trap activates only when its panel is open.
  const csvImportFocusRef = useFocusTrap<HTMLDivElement>(csvOpen, () => setCsvOpen(false));
  const orderRows = (intakeQueue.data ?? EMPTY) as IntakeOrderRow[];

  async function importCsv(validateOnly: boolean) {
    const result = await runCommand('importBatchesCsv', { csv: csvText, validateOnly }, validateOnly ? 'Validate intake CSV import' : 'Import validated intake CSV');
    setCsvResult(result);
    if (result.ok && !validateOnly) setCsvOpen(false);
  }

  // TER-1627: accept .csv files dropped onto the import textarea zone
  function handleCsvDrop(e: React.DragEvent) {
    e.preventDefault();
    setCsvDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setCsvText(text);
      };
      reader.readAsText(file);
    }
  }

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
          }
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
    [canWrite, runCommand, me.data?.name, onBatchRowClicked]
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
    <div className="flex flex-row min-h-0 flex-1">
      <div className="view-stack flex-1 min-w-0">
        <div className="control-band">
          <button className="secondary-button" type="button" onClick={() => setCsvOpen((value) => !value)}>
            CSV import
          </button>
        </div>
        {csvOpen ? (
          <WorkspacePanel panelId="intake:csv-import" title="Validate-first CSV import" contentClassName="p-3">
            <div ref={csvImportFocusRef}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="secondary-button compact-action"
                    type="button"
                    disabled={!csvText.trim() || isRunning || busy}
                    onClick={() => void importCsv(true)}
                  >
                    Validate
                  </button>
                  <button
                    className="primary-button compact-action"
                    type="button"
                    disabled={!csvResult?.ok || !csvText.trim() || isRunning || busy}
                    onClick={() => void importCsv(false)}
                  >
                    Import
                  </button>
                </div>
              </div>
              {/* TER-1627: drop zone wrapper — accepts .csv file drag-and-drop */}
              <div
                className={`media-upload-zone mt-2${csvDragActive ? ' media-upload-zone-active' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setCsvDragActive(true);
                }}
                onDragLeave={() => setCsvDragActive(false)}
                onDrop={handleCsvDrop}
              >
                <textarea
                  className="h-36 w-full resize-y border border-line p-2 font-mono text-xs outline-none focus:shadow-focus"
                  value={csvText}
                  onChange={(event) => setCsvText(event.target.value)}
                />
              </div>
              {csvResult ? (
                <pre className="json-chip mt-2">{JSON.stringify(csvResult.delta ?? { ok: csvResult.ok, toast: csvResult.toast }, null, 2)}</pre>
              ) : null}
            </div>
          </WorkspacePanel>
        ) : null}
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
      <ReceiptPreviewDrawer
        order={previewOrder}
        onClose={() => setPreviewOrder(null)}
      />
    </div>
  );
}

function buildBatchColumns(
  canWrite: boolean,
  onVerify: (batchId: string, intakeQty: string, expectedQty: string | null, discrepancyReason?: string) => Promise<void>,
  onReject: (batchId: string, reason: string) => Promise<void>,
  onAppendNote: (batchId: string, currentNotes: string | null, addition: string) => Promise<void>,
  onSetMarketName: (itemId: string, alias: string) => Promise<void>,
  onDeleteDraft: (batchId: string) => Promise<void>
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
      tooltipValueGetter: () => 'Free-text reason; carried onto the vendor bill and PO notes when intake is verified.'
    },
    { ...(moneyCol('unitCost', { headerName: 'Unit cost', width: 110 }) as ColDef<IntakeBatchRow>), type: 'numericColumn', editable: false, minWidth: 110 },
    { field: 'status', minWidth: 110 },
    { field: 'arrivalStatus', headerName: 'Arrival', width: 110 },
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
}: {
  row: IntakeBatchRow;
  busy: boolean;
  isRunning: boolean;
  onVerify: (batchId: string, intakeQty: string, expectedQty: string | null, discrepancyReason?: string) => Promise<void>;
  onReject: (batchId: string, reason: string) => Promise<void>;
  onAppendNote: (batchId: string, currentNotes: string | null, addition: string) => Promise<void>;
  onSetMarketName: (itemId: string, alias: string) => Promise<void>;
  onDeleteDraft: (batchId: string) => Promise<void>;
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
        <select
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
          <textarea
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
      <input
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
