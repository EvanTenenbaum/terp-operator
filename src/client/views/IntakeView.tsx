import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellValueChangedEvent,
  ColDef,
  GetDetailRowDataParams,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  ValueGetterParams
} from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { ReceiptPreviewDrawer } from '../components/ReceiptPreviewDrawer';
import { useCommandRunner } from '../components/useCommandRunner';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useUiStore } from '../store/uiStore';
import type { CommandResult } from '../../shared/types';
import type { IntakeBatchRow, IntakeOrderRow } from './IntakeView.types';

const EMPTY: IntakeOrderRow[] = [];

export function IntakeView() {
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const intakeQueue = trpc.queries.intakeQueue.useQuery(undefined, { refetchOnWindowFocus: false });
  const { runCommand, isRunning } = useCommandRunner();
  const pushToast = useUiStore((state) => state.pushToast);

  const verifiedDraftsRef = useRef<Map<string, number>>(new Map());
  const discrepancyReasonsRef = useRef<Map<string, string>>(new Map());
  const apiRef = useRef<GridApi<IntakeOrderRow> | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmVerifyAllFor, setConfirmVerifyAllFor] = useState<IntakeOrderRow | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('name,category,vendor,intake_qty,unit_cost,source_code,legacy_marker,ownership_status,notes\n');
  const [csvResult, setCsvResult] = useState<CommandResult | null>(null);
  const [previewOrder, setPreviewOrder] = useState<IntakeOrderRow | null>(null);
  // #21 slice 3 (UX-A9): inline confirm panels each get a focus trap so Tab
  // stays in-panel and Escape collapses them, matching CommandPalette /
  // RefereeRelationshipDialog. The trap activates only when its panel is open.
  const csvImportFocusRef = useFocusTrap<HTMLDivElement>(csvOpen, () => setCsvOpen(false));
  const confirmVerifyAllFocusRef = useFocusTrap<HTMLDivElement>(
    confirmVerifyAllFor !== null,
    () => setConfirmVerifyAllFor(null)
  );
  const orderRows = (intakeQueue.data ?? EMPTY) as IntakeOrderRow[];

  async function importCsv(validateOnly: boolean) {
    const result = await runCommand('importBatchesCsv', { csv: csvText, validateOnly }, validateOnly ? 'Validate intake CSV import' : 'Import validated intake CSV');
    setCsvResult(result);
    if (result.ok && !validateOnly) setCsvOpen(false);
  }

  async function verifyBatch(batchId: string, intakeQty: string, expectedQty: string | null) {
    setBusy(true);
    try {
      const actual = Number(intakeQty);
      const expected = Number(expectedQty ?? 0);
      if (expected > 0 && actual > 0 && actual !== expected) {
        await runCommand(
          'flagBatch',
          { batchId, reason: `Quantity discrepancy: expected ${expected}, received ${actual}` },
          'Auto-flag quantity discrepancy'
        );
      }
      await runCommand(
        'postPurchaseReceipt',
        { batchIds: [batchId] },
        'Verify single batch intake'
      );
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

  const detailCellRendererParams = useMemo(
    () => ({
      detailGridOptions: {
        columnDefs: buildBatchColumns(
          canWrite,
          async (batchId, intakeQty, expectedQty) => {
            await verifyBatch(batchId, intakeQty, expectedQty);
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
          }
        ),
        defaultColDef: { resizable: true, sortable: true } as ColDef<IntakeBatchRow>,
        domLayout: 'autoHeight' as const,
        rowHeight: 28,
        headerHeight: 30,
        onCellValueChanged: (event: CellValueChangedEvent<IntakeBatchRow>) => {
          const data = event.data;
          if (!data?.id) return;
          const field = event.colDef.field;
          if (field === 'intakeQty') {
            const next = Number(event.newValue ?? data.intakeQty ?? 0);
            if (Number.isFinite(next) && next >= 0) {
              verifiedDraftsRef.current.set(data.id, next);
            }
          } else if (field === 'discrepancyReason') {
            const reason = String(event.newValue ?? '').trim();
            if (reason) discrepancyReasonsRef.current.set(data.id, reason);
            else discrepancyReasonsRef.current.delete(data.id);
          }
        }
      },
      getDetailRowData: (params: GetDetailRowDataParams<IntakeOrderRow>) => {
        params.successCallback(params.data?.batches ?? []);
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canWrite, runCommand, me.data?.name]
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
          params.data ? `$${Number(params.data.expectedTotal || 0).toFixed(2)}` : ''
      },
      {
        headerName: 'Verified $',
        valueGetter: (params: ValueGetterParams<IntakeOrderRow>) =>
          params.data ? `$${Number(params.data.total || 0).toFixed(2)}` : ''
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
              <button
                type="button"
                className="secondary-button compact-action"
                disabled={!canWrite || busy || isRunning || !hasPendingBatches(order)}
                onClick={() => setConfirmVerifyAllFor(order)}
              >
                Verify all
              </button>
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
    [busy, isRunning, canWrite]
  );

  function hasPendingBatches(order: IntakeOrderRow) {
    return order.batches?.some((batch) => ['draft', 'ready', 'needs_fix'].includes(batch.status)) ?? false;
  }

  async function verifyAllForOrder(order: IntakeOrderRow) {
    setBusy(true);
    try {
      await runCommand('verifyAllIntake', { purchaseOrderId: order.id }, `Verify all intake for ${order.poNo}`);
      verifiedDraftsRef.current.clear();
      discrepancyReasonsRef.current.clear();
    } finally {
      setBusy(false);
    }
  }

  const onGridReady = useCallback((event: GridReadyEvent<IntakeOrderRow>) => {
    apiRef.current = event.api;
    event.api.sizeColumnsToFit();
  }, []);

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
              <textarea
                className="mt-2 h-36 w-full resize-y border border-line p-2 font-mono text-xs outline-none focus:shadow-focus"
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
              />
              {csvResult ? (
                <pre className="json-chip mt-2">{JSON.stringify(csvResult.delta ?? { ok: csvResult.ok, toast: csvResult.toast }, null, 2)}</pre>
              ) : null}
            </div>
          </WorkspacePanel>
        ) : null}
        <WorkspacePanel panelId="intake:queue" title="Intake queue" subtitle={`${orderRows.length} purchase order(s) with batches awaiting verification`}>
          <div className="ag-theme-quartz grid-shell">
            <AgGridReact<IntakeOrderRow>
              rowData={orderRows}
              columnDefs={columnDefs}
              defaultColDef={{ sortable: true, resizable: true, filter: true, minWidth: 120 }}
              masterDetail
              detailRowAutoHeight
              detailCellRendererParams={detailCellRendererParams}
              getRowId={(params) => String(params.data.id)}
              onGridReady={onGridReady}
              loading={intakeQueue.isLoading || isRunning || busy}
              isRowMaster={(data) => Boolean(data?.batches?.length)}
              animateRows={false}
            />
          </div>
          {!intakeQueue.isLoading && orderRows.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No approved purchase orders with linked intake batches yet. Approve a PO to populate this queue.</div>
          ) : null}
        </WorkspacePanel>
        {confirmVerifyAllFor ? (
          <WorkspacePanel panelId="intake:confirm-verify-all" title={`Verify all intake for ${confirmVerifyAllFor.poNo}?`} contentClassName="p-3">
            <div ref={confirmVerifyAllFocusRef}>
              <p className="text-sm text-zinc-700">
                This will accept every pending batch on this PO as the expected quantity and post the receipt.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="primary-button compact-action"
                  disabled={busy || isRunning}
                  onClick={async () => {
                    const target = confirmVerifyAllFor;
                    setConfirmVerifyAllFor(null);
                    if (target) {
                      await verifyAllForOrder(target);
                      pushToast(`Verified all intake for ${target.poNo}.`, 'success');
                    }
                  }}
                >
                  Yes — verify all
                </button>
                <button type="button" className="secondary-button compact-action" onClick={() => setConfirmVerifyAllFor(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </WorkspacePanel>
        ) : null}
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
  onVerify: (batchId: string, intakeQty: string, expectedQty: string | null) => Promise<void>,
  onReject: (batchId: string, reason: string) => Promise<void>,
  onAppendNote: (batchId: string, currentNotes: string | null, addition: string) => Promise<void>,
  onSetMarketName: (itemId: string, alias: string) => Promise<void>
): ColDef<IntakeBatchRow>[] {
  return [
    { field: 'batchCode', headerName: 'Batch', pinned: 'left', minWidth: 160 },
    { field: 'name', minWidth: 180 },
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
      cellClass: (params) => {
        const expected = Number(params.data?.expectedQty ?? 0);
        const actual = Number(params.value ?? 0);
        return expected && actual && expected !== actual ? 'intake-discrepancy' : '';
      },
      cellStyle: (params) => {
        const expected = Number(params.data?.expectedQty ?? 0);
        const actual = Number(params.value ?? 0);
        return expected && actual && expected !== actual ? { backgroundColor: '#fef9c3' } : null;
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
    {
      field: 'unitCost',
      headerName: 'Unit cost',
      type: 'numericColumn',
      editable: false,
      valueFormatter: (params) => `$${Number(params.value ?? 0).toFixed(2)}`,
      minWidth: 110
    },
    { field: 'status', minWidth: 110 },
    { field: 'notes', headerName: 'Notes', editable: false, minWidth: 220 },
    {
      headerName: 'Actions',
      pinned: 'right',
      minWidth: 300,
      cellRenderer: (params: ICellRendererParams<IntakeBatchRow>) => {
        const row = params.data;
        if (!row || !canWrite) return null;
        return (
          <BatchRowActions
            row={row}
            onVerify={onVerify}
            onReject={onReject}
            onAppendNote={onAppendNote}
            onSetMarketName={onSetMarketName}
          />
        );
      }
    }
  ];
}

function BatchRowActions({
  row,
  onVerify,
  onReject,
  onAppendNote,
  onSetMarketName,
}: {
  row: IntakeBatchRow;
  onVerify: (batchId: string, intakeQty: string, expectedQty: string | null) => Promise<void>;
  onReject: (batchId: string, reason: string) => Promise<void>;
  onAppendNote: (batchId: string, currentNotes: string | null, addition: string) => Promise<void>;
  onSetMarketName: (itemId: string, alias: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'idle' | 'reject' | 'note' | 'marketName'>('idle');
  const [inputValue, setInputValue] = useState('');

  const canVerify = row.status === 'draft' || row.status === 'ready';
  const canAct = row.status !== 'returned' && row.status !== 'posted';

  function openMode(next: 'reject' | 'note' | 'marketName', prefill = '') {
    setMode(next);
    setInputValue(prefill);
  }

  function cancel() {
    setMode('idle');
    setInputValue('');
  }

  if (mode === 'idle') {
    return (
      <div className="flex h-full items-center gap-1">
        <button
          type="button"
          className="primary-button compact-action"
          disabled={!canVerify}
          title={!canVerify ? `Cannot verify: batch is ${row.status}` : 'Verify this batch'}
          onClick={() => void onVerify(row.id, row.intakeQty, row.expectedQty)}
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
      </div>
    );
  }

  const placeholder =
    mode === 'reject' ? 'Reject reason' :
    mode === 'note' ? 'Add a note…' :
    'Market name';

  const label =
    mode === 'reject' ? 'Reject' :
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
          if (mode === 'reject') {
            if (!value) return;
            await onReject(row.id, value);
          } else if (mode === 'note') {
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
