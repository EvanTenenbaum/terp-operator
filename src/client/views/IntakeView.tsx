import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellValueChangedEvent,
  ColDef,
  GetDetailRowDataParams,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  NewValueParams,
  ValueGetterParams
} from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { CommandResult } from '../../shared/types';

interface IntakeBatchRow {
  id: string;
  purchaseOrderId: string;
  purchaseOrderLineId: string | null;
  batchCode: string;
  name: string;
  category: string;
  intakeQty: string;
  availableQty: string;
  unitCost: string;
  unitPrice: string;
  uom: string;
  status: string;
  notes: string | null;
  validationIssues: string[];
  mediaStatus: string;
  arrivalStatus: string;
  vendorId: string | null;
  tags: string[];
  location: string;
  lotCode: string | null;
  expectedQty: string | null;
  expectedUnitCost: string | null;
  discrepancyReason?: string;
  createdAt: string;
}

interface IntakeOrderRow {
  id: string;
  poNo: string;
  vendor: string | null;
  vendorId: string | null;
  status: string;
  expectedDate: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  total: string;
  expectedTotal: string;
  expectedTotalQty: string;
  receivedTotalQty: string;
  internalNotes: string | null;
  buyerNotes: string | null;
  createdAt: string;
  batches: IntakeBatchRow[];
}

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
  const previewBatchIds = previewOrder
    ? previewOrder.batches
        .filter((batch) => ['draft', 'ready', 'needs_fix'].includes(batch.status))
        .map((batch) => batch.id)
    : [];
  const receiptPreview = trpc.queries.receiptPreview.useQuery(
    { batchIds: previewBatchIds },
    { enabled: previewBatchIds.length > 0 }
  );

  const orderRows = (intakeQueue.data ?? EMPTY) as IntakeOrderRow[];

  async function importCsv(validateOnly: boolean) {
    const result = await runCommand('importBatchesCsv', { csv: csvText, validateOnly }, validateOnly ? 'Validate intake CSV import' : 'Import validated intake CSV');
    setCsvResult(result);
    if (result.ok && !validateOnly) setCsvOpen(false);
  }

  async function deleteDraftBatch(batchId: string) {
    setBusy(true);
    try {
      await runCommand('deleteBatch', { batchId }, 'Delete draft intake row from queue');
    } finally {
      setBusy(false);
    }
  }

  const detailCellRendererParams = useMemo(
    () => ({
      detailGridOptions: {
        columnDefs: buildBatchColumns(
          canWrite,
          async (batchId, reason) => {
            setBusy(true);
            try {
              await runCommand('flagBatch', { batchId, reason }, 'Flag intake lot from grid');
            } finally {
              setBusy(false);
            }
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
          deleteDraftBatch
        ),
        defaultColDef: { resizable: true, sortable: true } as ColDef<IntakeBatchRow>,
        domLayout: 'autoHeight' as const,
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
        minWidth: 360,
        cellRenderer: (params: ICellRendererParams<IntakeOrderRow>) => {
          const order = params.data;
          if (!order) return null;
          return (
            <div className="flex h-full items-center gap-2">
              <button
                type="button"
                className="primary-button compact-action"
                disabled={!canWrite || busy || isRunning || !canVerifyIntake(order)}
                onClick={() => void verifyIntakeForOrder(order)}
              >
                Verify intake
              </button>
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

  function canVerifyIntake(order: IntakeOrderRow) {
    if (!order.batches?.length) return false;
    if (!order.batches.some((batch) => ['draft', 'ready', 'needs_fix'].includes(batch.status))) return false;
    return order.batches
      .filter((batch) => ['draft', 'ready', 'needs_fix'].includes(batch.status))
      .every((batch) => {
        const drafted = verifiedDraftsRef.current.get(batch.id);
        if (drafted != null && Number.isFinite(drafted)) return true;
        return Number(batch.intakeQty) > 0;
      });
  }

  function hasPendingBatches(order: IntakeOrderRow) {
    return order.batches?.some((batch) => ['draft', 'ready', 'needs_fix'].includes(batch.status)) ?? false;
  }

  async function verifyIntakeForOrder(order: IntakeOrderRow) {
    setBusy(true);
    try {
      const pending = order.batches.filter((batch) => ['draft', 'ready', 'needs_fix'].includes(batch.status));
      for (const batch of pending) {
        const drafted = verifiedDraftsRef.current.get(batch.id);
        if (drafted == null || !Number.isFinite(drafted) || drafted < 0) continue;
        await runCommand(
          'updateBatch',
          { id: batch.id, intakeQty: drafted, availableQty: drafted },
          'Apply actual intake quantity'
        );
      }
      const discrepancyNotes: Record<string, string> = {};
      for (const batch of pending) {
        const reason = discrepancyReasonsRef.current.get(batch.id);
        if (reason) discrepancyNotes[batch.id] = reason;
      }
      await runCommand(
        'postPurchaseReceipt',
        { batchIds: pending.map((batch) => batch.id), discrepancyNotes },
        `Verify intake for ${order.poNo}`
      );
      verifiedDraftsRef.current.clear();
      discrepancyReasonsRef.current.clear();
    } finally {
      setBusy(false);
    }
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
    <div className="view-stack">
      <div className="control-band">
        <button className="secondary-button" type="button" onClick={() => setCsvOpen((value) => !value)}>
          CSV import
        </button>
      </div>
      {csvOpen ? (
        <WorkspacePanel panelId="intake:csv-import" title="Validate-first CSV import" contentClassName="p-3">
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
      {previewOrder ? (
        <WorkspacePanel
          panelId="intake:receipt-preview"
          title={`Receipt preview — ${previewOrder.poNo}`}
          contentClassName="p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <button className="text-button" type="button" onClick={() => setPreviewOrder(null)}>
              Close
            </button>
          </div>
          {receiptPreview.data ? (
            <div className="mt-3 grid gap-3">
              <div className="grid gap-2 text-sm md:grid-cols-4">
                <span className="selection-pill">Vendor {receiptPreview.data.vendor || 'Mixed / missing'}</span>
                <span className="selection-pill">{receiptPreview.data.rows.length} row(s)</span>
                <span className="selection-pill">Total ${receiptPreview.data.total}</span>
                <span className={receiptPreview.data.ok ? 'selection-pill success' : 'selection-pill warning'}>
                  {receiptPreview.data.ok ? 'Ready to post' : `${receiptPreview.data.conflicts.length} conflict(s)`}
                </span>
              </div>
              {receiptPreview.data.conflicts.length ? (
                <div className="grid gap-1 text-sm text-red-700">
                  {receiptPreview.data.conflicts.map((conflict) => (
                    <div key={conflict}>{conflict}</div>
                  ))}
                </div>
              ) : null}
              <div className="finder-table-wrap max-h-64">
                <table className="finder-table">
                  <thead>
                    <tr>
                      <th>Batch</th>
                      <th>Name</th>
                      <th>Qty</th>
                      <th>Cost</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptPreview.data.rows.map((row) => (
                      <tr key={String(row.id)}>
                        <td>{String(row.batchCode)}</td>
                        <td>{String(row.name)}</td>
                        <td>{String(row.intakeQty)}</td>
                        <td>${String(row.unitCost)}</td>
                        <td>${Number(row.subtotal ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-600">Loading preview...</div>
          )}
        </WorkspacePanel>
      ) : null}
      {confirmVerifyAllFor ? (
        <WorkspacePanel panelId="intake:confirm-verify-all" title={`Verify all intake for ${confirmVerifyAllFor.poNo}?`} contentClassName="p-3">
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
        </WorkspacePanel>
      ) : null}
    </div>
  );
}

function buildBatchColumns(
  canWrite: boolean,
  onFlag: (batchId: string, reason: string) => Promise<void>,
  onReject: (batchId: string, reason: string) => Promise<void>,
  onAppendNote: (batchId: string, currentNotes: string | null, addition: string) => Promise<void>,
  onDeleteDraft: (batchId: string) => Promise<void>
): ColDef<IntakeBatchRow>[] {
  return [
    { field: 'batchCode', headerName: 'Batch', pinned: 'left', minWidth: 160 },
    { field: 'name', minWidth: 180 },
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
    {
      field: 'notes',
      headerName: 'Notes',
      editable: canWrite,
      minWidth: 220,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true,
      onCellValueChanged: (event: NewValueParams<IntakeBatchRow>) => {
        if (!event.data?.id) return;
        const addition = String(event.newValue ?? '').trim();
        if (!addition || addition === event.oldValue) return;
        void onAppendNote(event.data.id, event.data.notes ?? null, addition);
      }
    },
    {
      headerName: 'Actions',
      pinned: 'right',
      minWidth: 260,
      cellRenderer: (params: ICellRendererParams<IntakeBatchRow>) => {
        const row = params.data;
        if (!row || !canWrite) return null;
        return (
          <BatchRowActions row={row} onFlag={onFlag} onReject={onReject} onDeleteDraft={onDeleteDraft} />
        );
      }
    }
  ];
}

function BatchRowActions({
  row,
  onFlag,
  onReject,
  onDeleteDraft
}: {
  row: IntakeBatchRow;
  onFlag: (batchId: string, reason: string) => Promise<void>;
  onReject: (batchId: string, reason: string) => Promise<void>;
  onDeleteDraft: (batchId: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'idle' | 'flag' | 'reject'>('idle');
  const [reason, setReason] = useState('');

  if (mode === 'idle') {
    const disabled = row.status === 'returned' || row.status === 'posted';
    return (
      <div className="flex h-full items-center gap-1">
        <button type="button" className="secondary-button compact-action" disabled={disabled} onClick={() => setMode('flag')}>
          Flag
        </button>
        <button type="button" className="secondary-button compact-action" disabled={disabled} onClick={() => setMode('reject')}>
          Reject
        </button>
        <button
          type="button"
          className="secondary-button compact-action"
          disabled={row.status !== 'draft'}
          title="Delete this draft batch"
          onClick={() => void onDeleteDraft(row.id)}
        >
          Delete draft
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center gap-1">
      <input
        className="input compact"
        autoFocus
        placeholder={`${mode === 'flag' ? 'Flag' : 'Reject'} reason`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <button
        type="button"
        className="primary-button compact-action"
        disabled={!reason.trim()}
        onClick={async () => {
          const trimmed = reason.trim();
          if (!trimmed) return;
          if (mode === 'flag') await onFlag(row.id, trimmed);
          else await onReject(row.id, trimmed);
          setMode('idle');
          setReason('');
        }}
      >
        {mode === 'flag' ? 'Flag' : 'Reject'}
      </button>
      <button
        type="button"
        className="secondary-button compact-action"
        onClick={() => {
          setMode('idle');
          setReason('');
        }}
      >
        Cancel
      </button>
    </div>
  );
}
