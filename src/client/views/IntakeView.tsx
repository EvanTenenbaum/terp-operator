import { ChevronDown, ChevronRight, ClipboardCheck, Copy, Plus, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { CommandResult, GridRow } from '../../shared/types';

const intakeColumns: ColDef<GridRow>[] = [
  { field: 'batchCode', headerName: 'Batch', pinned: 'left', editable: false, width: 150 },
  { field: 'poNo', headerName: 'PO', editable: false, width: 130 },
  { field: 'sourceCode', headerName: 'Code', editable: true, width: 110 },
  { field: 'intakeDate', headerName: 'Date', editable: true, width: 150 },
  { field: 'shorthand', headerName: 'Shorthand', editable: true, width: 145 },
  { field: 'legacyMarker', headerName: 'Marker', editable: true, width: 105 },
  { field: 'name', editable: true, minWidth: 190 },
  { field: 'category', editable: true, width: 120 },
  { field: 'tags', editable: true, minWidth: 160 },
  { field: 'vendor', editable: false, width: 160 },
  { field: 'ticketCost', headerName: 'Ticket cost', editable: true, type: 'numericColumn', width: 120 },
  { field: 'priceRange', headerName: 'Range', editable: true, width: 120 },
  { field: 'intakeQty', headerName: 'intake_qty', editable: (params) => params.data?.status !== 'posted', type: 'numericColumn', width: 120 },
  { field: 'availableQty', headerName: 'available_qty', editable: false, type: 'numericColumn', width: 130 },
  { field: 'uom', editable: true, width: 90 },
  { field: 'unitCost', editable: true, type: 'numericColumn', width: 110 },
  { field: 'unitPrice', editable: true, type: 'numericColumn', width: 110 },
  { field: 'ownershipStatus', headerName: 'Owner', editable: true, width: 110 },
  { field: 'arrivalStatus', editable: true, width: 130 },
  { field: 'arrivalConfirmed', editable: true, width: 130 },
  { field: 'mediaStatus', headerName: 'Media', editable: true, width: 110 },
  { field: 'validationIssues', headerName: 'Fix', width: 220 },
  { field: 'location', editable: true, width: 120 },
  { field: 'lotCode', editable: true, width: 120 },
  { field: 'expirationDate', headerName: 'Expires', editable: true, width: 140 },
  { field: 'notes', editable: true, minWidth: 180 },
  { field: 'status', pinned: 'right', width: 125 }
];

const EMPTY_ROWS: GridRow[] = [];

export function IntakeView() {
  const selectedRows = useUiStore((state) => state.selectedRows.intake);
  const rows = selectedRows ?? EMPTY_ROWS;
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const grid = trpc.queries.grid.useQuery({ view: 'intake' });
  const reference = trpc.queries.reference.useQuery();
  const { runCommand, isRunning } = useCommandRunner();
  const firstVendor = reference.data?.vendors[0]?.id;
  const [vendorId, setVendorId] = useState('');
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [intakeTrayOpen, setIntakeTrayOpen] = useState(false);
  const [csvText, setCsvText] = useState('name,category,vendor,intake_qty,unit_cost,unit_price,source_code,legacy_marker,ownership_status,notes\n');
  const [csvResult, setCsvResult] = useState<CommandResult | null>(null);
  const [lotCode, setLotCode] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [rowTags, setRowTags] = useState('');
  const defaultVendorId = vendorId || firstVendor;
  const receiptPreview = trpc.queries.receiptPreview.useQuery({ batchIds: rows.map((row) => String(row.id)) }, { enabled: rows.length > 0 });
  const selectedReady = rows.length > 0 && rows.every((row) => row.status === 'ready');

  async function onCellCommit(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null) return;
    if (event.oldValue === event.newValue) return;
    await runCommand('updateBatch', { id: event.data.id, [event.colDef.field]: event.newValue }, `Inline intake edit: ${event.colDef.field}`);
  }

  async function createRow() {
    const sourceCode = `DROP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    await runCommand('createBatch', {
      vendorId: defaultVendorId,
      sourceCode,
      shorthand: 'Ins/candy',
      name: 'New receiving line',
      category: 'Infused',
      tags: parseTags(rowTags),
      intakeDate: new Date().toISOString(),
      intakeQty: 1,
      unitCost: 0,
      unitPrice: 0,
      ticketCost: 0,
      priceRange: '',
      ownershipStatus: 'UNKNOWN',
      legacyMarker: 'T',
      arrivalStatus: 'pending',
      status: 'draft',
      location: 'Receiving',
      notes: ''
    });
  }

  async function duplicateRows() {
    for (const row of rows) {
      await runCommand('createBatch', {
        vendorId: row.vendorId,
        sourceCode: row.sourceCode,
        shorthand: row.shorthand,
        name: `${row.name} copy`,
        category: row.category,
        tags: row.tags,
        intakeDate: row.intakeDate,
        intakeQty: row.intakeQty,
        unitCost: row.unitCost,
        unitPrice: row.unitPrice,
        ticketCost: row.ticketCost,
        priceRange: row.priceRange,
        uom: row.uom,
        ownershipStatus: row.ownershipStatus,
        legacyMarker: row.legacyMarker,
        arrivalStatus: row.arrivalStatus,
        location: row.location,
        lotCode: row.lotCode,
        notes: row.notes,
        status: 'draft'
      });
    }
  }

  async function markReady() {
    for (const row of rows) await runCommand('updateBatch', { id: row.id, status: 'ready' }, 'Batch mark selected rows Ready');
  }

  async function processIntake() {
    await runCommand('postPurchaseReceipt', { batchIds: rows.map((row) => row.id) }, 'Process selected intake rows');
  }

  async function importCsv(validateOnly: boolean) {
    const result = await runCommand('importBatchesCsv', { csv: csvText, validateOnly }, validateOnly ? 'Validate intake CSV import' : 'Import validated intake CSV');
    setCsvResult(result);
    if (result.ok && !validateOnly) setCsvOpen(false);
  }

  async function deleteDraftRows() {
    for (const row of rows) await runCommand('deleteBatch', { batchId: row.id }, 'Delete selected draft intake row');
  }

  async function setSelectedLotInfo() {
    for (const row of rows) {
      await runCommand('setBatchLotInfo', { batchId: row.id, lotCode: lotCode || row.lotCode, expirationDate: expirationDate || row.expirationDate }, 'Set selected intake lot info');
    }
  }

  return (
    <div className="view-stack">
      <div className="control-band">
        <label className="field-inline">
          Vendor
          <select className="select" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
            <option value="">Default vendor</option>
            {reference.data?.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="button" onClick={() => setCsvOpen((value) => !value)}>
          CSV import
        </button>
        <label className="field-inline grow">
          Tags
          <input className="input" value={rowTags} placeholder="premium, candy" onChange={(event) => setRowTags(event.target.value)} />
        </label>
        <label className="field-inline">
          Lot code
          <input className="input compact" value={lotCode} onChange={(event) => setLotCode(event.target.value)} />
        </label>
        <label className="field-inline">
          Expiration
          <input className="input compact" type="date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} />
        </label>
        <button className="secondary-button" type="button" disabled={!rows.length || (!lotCode && !expirationDate)} onClick={setSelectedLotInfo}>
          Set lot info
        </button>
      </div>
      {csvOpen ? (
        <WorkspacePanel panelId="intake:csv-import" title="Validate-first CSV import" contentClassName="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button className="secondary-button compact-action" type="button" disabled={!csvText.trim()} onClick={() => void importCsv(true)}>
                Validate
              </button>
              <button className="primary-button compact-action" type="button" disabled={!csvResult?.ok || !csvText.trim()} onClick={() => void importCsv(false)}>
                Import
              </button>
            </div>
          </div>
          <textarea className="mt-2 h-36 w-full resize-y border border-line p-2 font-mono text-xs outline-none focus:shadow-focus" value={csvText} onChange={(event) => setCsvText(event.target.value)} />
          {csvResult ? (
            <pre className="json-chip mt-2">{JSON.stringify(csvResult.delta ?? { ok: csvResult.ok, toast: csvResult.toast }, null, 2)}</pre>
          ) : null}
        </WorkspacePanel>
      ) : null}
      <OperatorGrid
        view="intake"
        title="Inventory Intake"
        rows={(grid.data ?? []) as GridRow[]}
        columns={intakeColumns}
        loading={grid.isLoading || isRunning}
        onSelectionChange={(selection) => setSelectedRows('intake', selection)}
        onCellCommit={onCellCommit}
        selectionActions={(selection) => (
          <>
            <button type="button" className="primary-button compact-action" disabled={!selection.length} onClick={selectedReady ? processIntake : markReady}>
              {selectedReady ? <ReceiptText className="h-4 w-4" aria-hidden="true" /> : <ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
              {selectedReady ? 'Post receipt' : 'Mark Ready'}
            </button>
            <button type="button" className="secondary-button compact-action" disabled={!selection.length} onClick={() => setReceiptPreviewOpen(true)}>
              Preview receipt
            </button>
            <button type="button" className="secondary-button compact-action" disabled={!selection.length} onClick={() => setIntakeTrayOpen((value) => !value)} aria-expanded={intakeTrayOpen}>
              {intakeTrayOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
              Intake tray
            </button>
            {intakeTrayOpen ? (
              <>
                <button type="button" className="secondary-button compact-action" disabled={!selection.length} onClick={duplicateRows}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Duplicate
                </button>
                <button type="button" className="secondary-button compact-action" disabled={!selection.length} onClick={deleteDraftRows}>
                  Delete draft
                </button>
                <button type="button" className="secondary-button compact-action" disabled={!selection.length || (!lotCode && !expirationDate)} onClick={setSelectedLotInfo}>
                  Set lot info
                </button>
              </>
            ) : null}
          </>
        )}
        actions={
          <>
            <button type="button" className="primary-button" onClick={createRow} disabled={!defaultVendorId}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Receive Inventory
            </button>
          </>
        }
      />
      {rows.length ? (
        <div className="control-band receipt-impact-strip">
          <span className="selection-pill">{rows.length} selected</span>
          <span className="selection-pill">Vendor {receiptPreview.data?.vendor || 'Mixed / missing'}</span>
          <span className="selection-pill">Total ${receiptPreview.data?.total ?? '...'}</span>
          <span className={receiptPreview.data?.ok ? 'selection-pill success' : 'selection-pill warning'}>
            {receiptPreview.data?.ok ? 'Receipt ready' : `${receiptPreview.data?.conflicts.length ?? 0} fix`}
          </span>
          <button type="button" className="secondary-button compact-action" onClick={() => setReceiptPreviewOpen(true)}>
            Receipt detail
          </button>
        </div>
      ) : null}
      {receiptPreviewOpen ? (
        <WorkspacePanel panelId="intake:receipt-preview" title="Selected-row receipt preview" contentClassName="p-3">
          <div className="flex items-start justify-between gap-3">
            <button className="text-button" type="button" onClick={() => setReceiptPreviewOpen(false)}>
              Close
            </button>
          </div>
          {receiptPreview.data ? (
            <div className="mt-3 grid gap-3">
              <div className="grid gap-2 text-sm md:grid-cols-4">
                <span className="selection-pill">Vendor {receiptPreview.data.vendor || 'Mixed / missing'}</span>
                <span className="selection-pill">{receiptPreview.data.rows.length} row(s)</span>
                <span className="selection-pill">Total ${receiptPreview.data.total}</span>
                <span className={receiptPreview.data.ok ? 'selection-pill success' : 'selection-pill warning'}>{receiptPreview.data.ok ? 'Ready to post' : `${receiptPreview.data.conflicts.length} conflict(s)`}</span>
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
                      <th>Marker</th>
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
                        <td>{String(row.legacyMarker ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="primary-button w-fit" type="button" disabled={!receiptPreview.data.ok || !rows.length} onClick={processIntake}>
                Post receipt from selected rows
              </button>
            </div>
          ) : (
            <div className="text-sm text-zinc-600">Loading preview...</div>
          )}
        </WorkspacePanel>
      ) : null}
    </div>
  );
}

function parseTags(value: string) {
  return value.split(/[|,]/).map((tag) => tag.trim()).filter(Boolean);
}
