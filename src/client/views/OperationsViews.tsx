import { CalendarClock, Check, ChevronDown, ChevronRight, ClipboardList, FileDown, Landmark, ListChecks, PackageCheck, PackagePlus, Plus, RotateCcw, Send, ShieldCheck, Trash2, Truck, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type React from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { PhotographyQueuePanel } from '../components/PhotographyQueuePanel';
import { QuickLedgerGrid } from '../components/QuickLedgerGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow, ViewKey } from '../../shared/types';
import { commandLabelFor } from '../../shared/commandCatalog';
import type { CommandName } from '../../shared/commandCatalog';
import { parseTagInput } from '../../shared/tags';

const columnsByView: Partial<Record<ViewKey, ColDef<GridRow>[]>> = {
  purchaseOrders: [
    { field: 'poNo', headerName: 'PO', pinned: 'left', width: 150 },
    { field: 'vendor', width: 190 },
    { field: 'status', width: 135 },
    { field: 'expectedDate', headerName: 'Expected', editable: true, width: 165 },
    { field: 'total', type: 'numericColumn', width: 120 },
    { field: 'lines', width: 95 },
    { field: 'orderedQty', headerName: 'Ordered', type: 'numericColumn', width: 120 },
    { field: 'receivedQty', headerName: 'Received', type: 'numericColumn', width: 120 },
    { field: 'buyerNotes', headerName: 'Buyer notes', editable: true, minWidth: 220 },
    { field: 'internalNotes', headerName: 'Internal', editable: true, minWidth: 220 },
    { field: 'orderedAt', width: 170 },
    { field: 'receivedAt', width: 170 },
    { field: 'createdAt', width: 170 }
  ],
  orders: [
    { field: 'orderNo', pinned: 'left', width: 150 },
    { field: 'customer', width: 180 },
    { field: 'status', width: 125 },
    { field: 'total', type: 'numericColumn', width: 120 },
    { field: 'deliveryWindow', editable: true, width: 180 },
    { field: 'notes', editable: true, minWidth: 180 },
    { field: 'invoiceNo', width: 150 },
    { field: 'invoiceStatus', width: 130 },
    { field: 'packed', editable: true, width: 105 },
    { field: 'inventoryPosted', headerName: 'Inv Posted', editable: true, width: 125 },
    { field: 'paymentFollowup', headerName: 'Pay/F-up', editable: true, width: 125 },
    { field: 'legacyStatusMarkers', headerName: 'Markers', width: 115 },
    { field: 'validationIssues', headerName: 'Fix', minWidth: 200 },
    { field: 'postedAt', width: 180 },
    { field: 'fulfilledAt', width: 180 }
  ],
  payments: [
    { field: 'customer', pinned: 'left', width: 180 },
    { field: 'method', width: 110 },
    { field: 'direction', width: 120 },
    { field: 'category', width: 140 },
    { field: 'amount', type: 'numericColumn', width: 120 },
    { field: 'unappliedAmount', type: 'numericColumn', width: 150 },
    { field: 'allocationIntent', width: 145 },
    { field: 'impactPreview', minWidth: 220 },
    { field: 'reference', width: 160 },
    { field: 'locationBucket', width: 150 },
    { field: 'notes', minWidth: 180 },
    { field: 'status', width: 125 },
    { field: 'createdAt', width: 180 }
  ],
  inventory: [
    { field: 'batchCode', pinned: 'left', width: 150 },
    { field: 'name', minWidth: 180 },
    { field: 'category', width: 120 },
    { field: 'tags', editable: true, minWidth: 170 },
    { field: 'vendor', width: 180 },
    { field: 'availableQty', editable: true, type: 'numericColumn', width: 130 },
    { field: 'reservedQty', type: 'numericColumn', width: 130 },
    { field: 'uom', width: 90 },
    { field: 'unitCost', type: 'numericColumn', width: 110 },
    { field: 'unitPrice', editable: true, type: 'numericColumn', width: 110 },
    { field: 'location', width: 120 },
    { field: 'legacyMarker', headerName: 'Marker', editable: true, width: 105 },
    { field: 'ownershipStatus', width: 120 },
    { field: 'arrivalStatus', width: 120 },
    { field: 'mediaStatus', headerName: 'Media', width: 120 },
    { field: 'lotCode', editable: true, width: 120 },
    { field: 'expirationDate', editable: true, width: 140 },
    { field: 'status', width: 120 }
  ],
  clients: [
    { field: 'name', pinned: 'left', width: 190 },
    { field: 'creditLimit', type: 'numericColumn', width: 140 },
    { field: 'balance', type: 'numericColumn', width: 130 },
    { field: 'tags', minWidth: 180 },
    { field: 'notes', minWidth: 260 },
    { field: 'invoiceCount', width: 120 }
  ],
  vendors: [
    { field: 'vendor', pinned: 'left', width: 190 },
    { field: 'billNo', width: 150 },
    { field: 'amount', type: 'numericColumn', width: 120 },
    { field: 'amountPaid', type: 'numericColumn', width: 130 },
    { field: 'status', width: 125 },
    { field: 'dueDate', width: 180 },
    { field: 'scheduledFor', width: 180 },
    { field: 'dueReason', minWidth: 240 },
    { field: 'consignmentTriggered', width: 170 }
  ],
  fulfillment: [
    { field: 'pickNo', pinned: 'left', width: 150 },
    { field: 'orderNo', width: 150 },
    { field: 'customer', width: 180 },
    { field: 'status', width: 125 },
    { field: 'unitsPerBag', width: 130 },
    { field: 'labelFormat', width: 120 },
    { field: 'labelsPrinted', width: 140 },
    { field: 'manifestPath', minWidth: 220 },
    { field: 'tracking', minWidth: 160 },
    { field: 'lines', width: 90 }
  ],
  connectors: [
    { field: 'source', headerName: 'From', pinned: 'left', width: 170, valueFormatter: (params) => formatRequestSource(params.value) },
    { field: 'requestType', headerName: 'Request', width: 170, valueFormatter: (params) => formatRequestType(params.value) },
    { field: 'customer', width: 180 },
    { field: 'status', width: 125 },
    { field: 'operatorNotes', headerName: 'Notes', minWidth: 220 },
    { field: 'createdAt', width: 180 }
  ],
  recovery: [
    { field: 'commandName', headerName: 'Action', pinned: 'left', width: 220, valueFormatter: (params) => commandLabelFor(params.value) },
    { field: 'actorName', width: 150 },
    { field: 'status', width: 125 },
    { field: 'error', minWidth: 260 },
    { field: 'reversedByCommandId', width: 220 },
    { field: 'createdAt', width: 180 }
  ],
  closeout: [
    { field: 'period', pinned: 'left', width: 100 },
    { field: 'status', width: 125 },
    { field: 'controlTotals', minWidth: 220 },
    { field: 'csvPath', headerName: 'CSV', minWidth: 180 },
    { field: 'jsonlPath', headerName: 'JSONL', minWidth: 180 },
    { field: 'pdfPath', headerName: 'PDF', minWidth: 180 },
    { field: 'createdAt', width: 180 }
  ]
};

const EMPTY_ROWS: GridRow[] = [];

const purchaseOrderLineColumns: ColDef<GridRow>[] = [
  { field: 'productName', headerName: 'Product / strain', pinned: 'left', editable: true, minWidth: 190 },
  { field: 'category', editable: true, width: 120 },
  { field: 'subcategory', editable: true, width: 140 },
  { field: 'unitCost', headerName: 'Unit cost', editable: true, type: 'numericColumn', width: 120 },
  { field: 'costRange', headerName: 'Cost range', editable: true, width: 135 },
  { field: 'qty', headerName: 'Units', editable: true, type: 'numericColumn', width: 105 },
  { field: 'uom', headerName: 'Unit type', editable: true, width: 110 },
  { field: 'lineTotal', headerName: 'Row total', type: 'numericColumn', width: 120, valueGetter: (params) => Number(params.data?.qty ?? 0) * Number(params.data?.unitCost ?? 0) },
  { field: 'paymentTerms', headerName: 'Payment terms', editable: true, width: 145 },
  { field: 'notes', headerName: 'Vendor receipt notes', editable: true, minWidth: 190 },
  { field: 'internalNotes', headerName: 'Internal notes', editable: true, minWidth: 180 },
  { field: 'tags', editable: true, minWidth: 160 },
  { field: 'receivedQty', headerName: 'Received', width: 120 },
  { field: 'status', width: 120 }
];

const fulfillmentLineColumns: ColDef<GridRow>[] = [
  { field: 'itemName', pinned: 'left', minWidth: 180 },
  { field: 'batchCode', width: 140 },
  { field: 'expectedQty', type: 'numericColumn', width: 130 },
  { field: 'actualQty', editable: true, type: 'numericColumn', width: 120 },
  { field: 'actualWeight', editable: true, type: 'numericColumn', width: 140 },
  { field: 'bagCode', editable: true, width: 140 },
  { field: 'status', width: 120 }
];

export function PurchaseOrdersView() {
  const grid = trpc.queries.grid.useQuery({ view: 'purchaseOrders' });
  const reference = trpc.queries.reference.useQuery();
  const selectedRows = useUiStore((state) => state.selectedRows.purchaseOrders);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const pushToast = useUiStore((state) => state.pushToast);
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedPo = selected[0];
  const lines = trpc.queries.purchaseOrderLines.useQuery(
    { purchaseOrderId: String(selectedPo?.id ?? '00000000-0000-0000-0000-000000000000') },
    { enabled: Boolean(selectedPo?.id) }
  );
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const [authoringOpen, setAuthoringOpen] = useState(false);
  const [vendorId, setVendorId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [buyerNotes, setBuyerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [draftLines, setDraftLines] = useState<GridRow[]>([makePoDraftLine()]);
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorTerms, setNewVendorTerms] = useState('14');
  const [newVendorContact, setNewVendorContact] = useState('');
  const [newVendorNotes, setNewVendorNotes] = useState('');
  const [selectedLines, setSelectedLines] = useState<GridRow[]>([]);
  const [poTrayOpen, setPoTrayOpen] = useState(false);
  const [lineTrayOpen, setLineTrayOpen] = useState(false);
  const defaultVendorId = vendorId;
  const selectedVendor = reference.data?.vendors.find((vendor) => vendor.id === defaultVendorId);
  const vendorRelationship = trpc.queries.relationshipSummary.useQuery({ vendorId: defaultVendorId }, { enabled: authoringOpen && Boolean(defaultVendorId) });
  const historicalProducts = (reference.data?.availableBatches ?? [])
    .filter((row) => !defaultVendorId || row.vendorId === defaultVendorId)
    .slice(0, 8);
  const selectedPoStatus = String(selectedPo?.status ?? '');
  const filledDraftLines = draftLines.filter((line) => String(line.productName ?? '').trim());
  const approvalLineIssues = filledDraftLines.filter((line) => Number(line.qty ?? 0) <= 0 || Number(line.unitCost ?? 0) <= 0);
  const canApproveDraft = Boolean(defaultVendorId) && filledDraftLines.length > 0 && approvalLineIssues.length === 0;

  function openAuthoringWorkspace() {
    setAuthoringOpen(true);
    setSelectedRows('purchaseOrders', []);
    setDraftLines((rows) => rows.length ? rows : [makePoDraftLine()]);
    setDrawerState('purchaseOrders', 'closed');
  }

  function updateDraftLine(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null) return;
    const field = String(event.colDef.field);
    setDraftLines((rows) =>
      rows.map((row) => {
        if (row.id !== event.data?.id) return row;
        const next = { ...row, [field]: event.newValue };
        if (field === 'category') next.uom = unitTypeForCategory(String(event.newValue));
        return next;
      })
    );
  }

  function addDraftLine(seed: Partial<GridRow> = {}) {
    setDraftLines((rows) => [...rows, makePoDraftLine(seed)]);
  }

  function quickAddHistorical(row: GridRow) {
    addDraftLine({
      productName: row.name,
      category: row.category,
      subcategory: Array.isArray(row.tags) ? row.tags[0] : '',
      tags: Array.isArray(row.tags) ? row.tags.join(', ') : '',
      unitCost: row.unitCost,
      qty: 1,
      uom: row.uom || unitTypeForCategory(String(row.category ?? ''))
    });
  }

  async function saveDraftPo(options: { approve?: boolean } = {}) {
    if (!defaultVendorId) return null;
    const linesToSubmit = draftLines.filter((row) => String(row.productName ?? '').trim());
    if (options.approve && (!linesToSubmit.length || linesToSubmit.some((row) => Number(row.qty ?? 0) <= 0 || Number(row.unitCost ?? 0) <= 0))) {
      pushToast('Approve PO needs product, units, and unit cost on every filled line.', 'error');
      return null;
    }
    const result = await runCommand(
      'createPurchaseOrder',
      { vendorId: defaultVendorId, expectedDate: expectedDate || undefined, buyerNotes: buyerNotes || undefined, internalNotes: internalNotes || undefined },
      options.approve ? 'Create purchase order draft before approval' : 'Save purchase order draft'
    );
    if (!result.ok || !result.affectedIds[0]) return null;
    const purchaseOrderId = result.affectedIds[0];
    for (const line of linesToSubmit) {
      await runCommand(
        'addPurchaseOrderLine',
        {
          purchaseOrderId,
          productName: line.productName,
          category: line.category || 'Flower',
          tags: parseTagInput(String(line.tags ?? '')),
          qty: Number(line.qty || 0),
          unitCost: Number(line.unitCost || 0),
          uom: line.uom || unitTypeForCategory(String(line.category ?? '')),
          notes: composePoLineNotes(line),
          shorthand: line.costRange ? `Range: ${String(line.costRange)}` : undefined,
          ownershipStatus: 'UNKNOWN'
        },
        'Add purchase order line from authoring table'
      );
    }
    if (options.approve) {
      await runCommand('approvePurchaseOrder', { purchaseOrderId }, 'Approve PO to receive queue');
    }
    setAuthoringOpen(false);
    setDraftLines([makePoDraftLine()]);
    setBuyerNotes('');
    setInternalNotes('');
    setSelectedRows('purchaseOrders', [{ id: purchaseOrderId }]);
    return purchaseOrderId;
  }

  async function saveNewVendor() {
    const result = await runCommand(
      'createVendor',
      { name: newVendorName, termsDays: Number(newVendorTerms || 14), contact: newVendorContact || undefined, notes: newVendorNotes || undefined },
      'Add vendor from PO workspace'
    );
    if (result.ok && result.affectedIds[0]) {
      setVendorId(result.affectedIds[0]);
      setNewVendorOpen(false);
      setNewVendorName('');
      setNewVendorContact('');
      setNewVendorNotes('');
    }
  }

  async function updatePoCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    if (['expectedDate', 'buyerNotes', 'internalNotes'].includes(String(event.colDef.field))) {
      await runCommand('updatePurchaseOrder', { purchaseOrderId: event.data.id, [String(event.colDef.field)]: event.newValue }, `Inline purchase order edit: ${event.colDef.field}`);
    }
  }

  async function updateLineCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    const field = String(event.colDef.field);
    const supported = ['productName', 'category', 'tags', 'qty', 'uom', 'unitCost', 'notes'];
    if (!supported.includes(field)) return;
    await runCommand('updatePurchaseOrderLine', { lineId: event.data.id, [field]: field === 'tags' ? parseTagInput(String(event.newValue ?? '')) : event.newValue }, `Inline purchase order line edit: ${field}`);
  }

  async function runPurchaseOrderPrimary() {
    if (!selectedPo?.id) return;
    if (['approved', 'ordered', 'partially_received'].includes(selectedPoStatus)) {
      await runCommand('receivePurchaseOrder', { purchaseOrderId: selectedPo.id }, 'Receive selected purchase order to draft intake');
      return;
    }
    await runCommand('approvePurchaseOrder', { purchaseOrderId: selectedPo.id }, 'Approve PO to receive queue');
  }

  return (
    <div className="view-stack">
      {canWrite ? (
        <div className="control-band">
          <button className="primary-button" type="button" disabled={isRunning} onClick={openAuthoringWorkspace}>
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            New PO
          </button>
        </div>
      ) : null}
      {authoringOpen ? (
        <section className="inline-panel po-authoring-layout" aria-label="New purchase order workspace">
          <div className="po-authoring-main">
            <div className="po-header-strip">
              <div>
                <div className="text-xs font-bold uppercase text-zinc-500">New purchase order</div>
                <div className="text-base font-semibold text-ink">Draft workspace</div>
              </div>
              <div className="po-header-facts">
                <span>{selectedVendor?.name ?? 'Choose vendor'}</span>
                <span>Expected {expectedDate ? dateish(expectedDate) : 'optional'}</span>
                <span>${moneyish(poLinesTotal(draftLines))} PO total</span>
              </div>
              <button className="secondary-button compact-action" type="button" onClick={() => setAuthoringOpen(false)}>
                Cancel draft PO
              </button>
            </div>
            <div className="control-band subtle-band">
              <label className="field-inline">
                Vendor
                <select
                  className="select"
                  value={vendorId}
                  onChange={(event) => {
                    setVendorId(event.target.value);
                  }}
                >
                  <option value="">Choose vendor</option>
                  {reference.data?.vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary-button compact-action" type="button" onClick={() => setNewVendorOpen((value) => !value)} aria-expanded={newVendorOpen}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add new vendor
              </button>
              <label className="field-inline">
                Expected
                <input className="input compact" type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} />
              </label>
              <label className="field-inline grow">
                Vendor receipt notes
                <input className="input" value={buyerNotes} onChange={(event) => setBuyerNotes(event.target.value)} />
              </label>
              <label className="field-inline grow">
                Internal notes
                <input className="input" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} />
              </label>
            </div>
            {newVendorOpen ? (
              <div className="po-context-panel" role="region" aria-label="Add new vendor drawer">
                <div className="mb-2 text-sm font-semibold text-ink">Add new vendor</div>
                <div className="grid gap-2 md:grid-cols-4">
                  <label className="field-inline">
                    Name
                    <input className="input" value={newVendorName} onChange={(event) => setNewVendorName(event.target.value)} />
                  </label>
                  <label className="field-inline">
                    Terms
                    <input className="input compact" inputMode="numeric" value={newVendorTerms} onChange={(event) => setNewVendorTerms(event.target.value)} />
                  </label>
                  <label className="field-inline">
                    Contact
                    <input className="input" value={newVendorContact} onChange={(event) => setNewVendorContact(event.target.value)} />
                  </label>
                  <label className="field-inline">
                    Notes
                    <input className="input" value={newVendorNotes} onChange={(event) => setNewVendorNotes(event.target.value)} />
                  </label>
                </div>
                <button className="primary-button mt-2" type="button" disabled={!newVendorName.trim() || isRunning} onClick={saveNewVendor}>
                  Save vendor
                </button>
              </div>
            ) : null}
            <OperatorGrid
              view="purchaseOrders"
              title="New PO lines"
              subtitle="Enter lines directly in the table"
              rows={draftLines.map(withPoLineTotal)}
              columns={purchaseOrderLineColumns}
              loading={isRunning}
              onSelectionChange={setSelectedLines}
              onCellCommit={updateDraftLine}
              actions={
                <>
                  {approvalLineIssues.length ? <span className="selection-pill danger">{approvalLineIssues.length} filled line needs units and unit cost.</span> : null}
                  <button className="secondary-button compact-action" type="button" onClick={() => addDraftLine()}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add line row
                  </button>
                  <button className="secondary-button compact-action" type="button" disabled={!defaultVendorId || isRunning} onClick={() => void saveDraftPo()}>
                    Save draft
                  </button>
                  <button className="primary-button compact-action" type="button" disabled={isRunning || !canApproveDraft} title={approvalLineIssues.length ? 'Every filled PO line needs units and unit cost before approval.' : undefined} onClick={() => void saveDraftPo({ approve: true })}>
                    Approve PO
                  </button>
                </>
              }
              emptyTitle="No PO lines"
              emptyChildren="Add a line row, then type product, units, cost, terms, and notes directly into the table."
            />
            <div className="po-total-strip">
              <span>PO total ${moneyish(poLinesTotal(draftLines))}</span>
              <span>Procurement cost only. Sales price stays in Sales.</span>
              {approvalLineIssues.length ? <span className="po-total-warning">{approvalLineIssues.length} filled line needs units and unit cost.</span> : null}
            </div>
          </div>
          <aside className="po-context-panel" aria-label="Vendor context">
            <h2 className="section-title">Vendor context</h2>
            <div className="po-context-list">
              <div className="drawer-fact-row"><span>Vendor</span><strong>{selectedVendor?.name ?? 'Choose vendor'}</strong></div>
              <div className="drawer-fact-row"><span>Terms</span><strong>{selectedVendor ? `${String(selectedVendor.termsDays ?? 14)} days` : '-'}</strong></div>
              <div className="drawer-fact-row"><span>Open bills</span><strong>{vendorRelationship.data?.bills?.length ?? 0}</strong></div>
              <div className="drawer-fact-row"><span>Payments</span><strong>{vendorRelationship.data?.vendorPayments?.length ?? 0}</strong></div>
              <div className="drawer-fact-row"><span>Prior POs</span><strong>{vendorRelationship.data?.purchaseOrders?.length ?? 0}</strong></div>
            </div>
            <h3 className="section-title mt-4">Historical quick add</h3>
            <div className="po-context-list">
              {historicalProducts.length ? historicalProducts.map((row) => (
                <button className="po-context-row" type="button" key={String(row.id)} onClick={() => quickAddHistorical(row)}>
                  <span>{String(row.name ?? 'Product')}</span>
                  <strong>${moneyish(row.unitCost)}</strong>
                </button>
              )) : (
                <div className="drawer-empty">No reusable vendor history yet.</div>
              )}
            </div>
          </aside>
        </section>
      ) : null}
      <OperatorGrid
        view="purchaseOrders"
        title="Recent purchase orders"
        rows={(grid.data ?? []) as GridRow[]}
        columns={columnsByView.purchaseOrders ?? []}
        loading={grid.isLoading || isRunning}
        onSelectionChange={(rows) => {
          setSelectedRows('purchaseOrders', rows);
          setSelectedLines([]);
        }}
        onCellCommit={canWrite ? updatePoCell : undefined}
        actions={
          canWrite ? (
            <>
              <button className="primary-button" disabled={!selected.length || isRunning || purchaseOrderPrimaryDisabled(selectedPoStatus)} onClick={runPurchaseOrderPrimary} type="button">
                {['approved', 'ordered', 'partially_received'].includes(selectedPoStatus) ? <PackagePlus className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                {purchaseOrderPrimaryLabel(selectedPoStatus)}
              </button>
              <button className="secondary-button compact-action" disabled={!selected.length} onClick={() => setPoTrayOpen((value) => !value)} aria-expanded={poTrayOpen} type="button">
                {poTrayOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                More
              </button>
              {poTrayOpen ? (
                <>
                  <button className="secondary-button compact-action" disabled={!selected.length || isRunning || !['approved', 'ordered', 'partially_received'].includes(selectedPoStatus)} onClick={() => runCommand('receivePurchaseOrder', { purchaseOrderId: selected[0].id }, 'Receive selected purchase order to draft intake')} type="button">
                    <PackagePlus className="h-4 w-4" aria-hidden="true" />
                    Draft intake
                  </button>
                  <button className="secondary-button compact-action" disabled={!selected.length || isRunning} onClick={() => runCommand('cancelPurchaseOrder', { purchaseOrderId: selected[0].id }, 'Cancel selected purchase order')} type="button">
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    Cancel draft PO
                  </button>
                </>
              ) : null}
            </>
          ) : null
        }
      />
      {selectedPo ? (
        <>
          <section className="po-header-strip" aria-label="Selected purchase order summary">
            <div>
              <div className="text-xs font-bold uppercase text-zinc-500">Selected PO</div>
              <div className="text-base font-semibold text-ink">{String(selectedPo.poNo ?? 'Purchase order')}</div>
            </div>
            <div className="po-header-facts">
              <span>{String(selectedPo.vendor ?? 'Vendor')}</span>
              <span>Expected {dateish(selectedPo.expectedDate)}</span>
              <span>{String(selectedPo.status ?? 'draft')}</span>
              <span>{moneyish(selectedPo.receivedQty)} / {moneyish(selectedPo.orderedQty)} received</span>
              <span>${moneyish(selectedPo.total)}</span>
            </div>
            {canWrite ? (
              <button className="primary-button compact-action" disabled={isRunning || purchaseOrderPrimaryDisabled(selectedPoStatus)} onClick={runPurchaseOrderPrimary} type="button">
                {purchaseOrderPrimaryLabel(selectedPoStatus)}
              </button>
            ) : null}
          </section>
          <OperatorGrid
            view="purchaseOrders"
            title={`${String(selectedPo.poNo ?? 'Selected PO')} Lines`}
            subtitle="Procurement cost lines"
            rows={(lines.data ?? []) as GridRow[]}
            columns={purchaseOrderLineColumns}
            loading={lines.isLoading || isRunning}
            onSelectionChange={setSelectedLines}
            onCellCommit={canWrite ? updateLineCell : undefined}
            actions={
              canWrite ? (
                <>
                  <button
                    className="primary-button"
                    disabled={!selectedLines.length || isRunning}
                    onClick={() => runCommand('receivePurchaseOrder', { purchaseOrderId: selectedPo.id, lineIds: selectedLines.map((line) => line.id) }, 'Receive selected PO lines to intake')}
                    type="button"
                  >
                    <PackagePlus className="h-4 w-4" aria-hidden="true" />
                    Draft selected lines
                  </button>
                  <button
                    className="secondary-button compact-action"
                    disabled={!selectedLines.length}
                    onClick={() => setLineTrayOpen((value) => !value)}
                    type="button"
                    aria-expanded={lineTrayOpen}
                  >
                    {lineTrayOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                    Line actions
                  </button>
                  {lineTrayOpen ? <button
                    className="secondary-button compact-action"
                    disabled={!selectedLines.length || isRunning}
                    onClick={() => runCommand('removePurchaseOrderLine', { lineId: selectedLines[0].id }, 'Remove selected purchase order line')}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove PO line
                  </button> : null}
                </>
              ) : null
            }
          />
        </>
      ) : null}
    </div>
  );
}

function makePoDraftLine(seed: Partial<GridRow> = {}): GridRow {
  const category = String(seed.category ?? 'Flower');
  return {
    id: `draft-${crypto.randomUUID()}`,
    productName: seed.productName ?? '',
    category,
    subcategory: seed.subcategory ?? '',
    costRange: seed.costRange ?? '',
    qty: seed.qty ?? 1,
    uom: seed.uom ?? unitTypeForCategory(category),
    unitCost: seed.unitCost ?? 0,
    paymentTerms: seed.paymentTerms ?? 'Vendor terms',
    notes: seed.notes ?? '',
    internalNotes: seed.internalNotes ?? '',
    tags: seed.tags ?? '',
    receivedQty: 0,
    status: 'draft'
  };
}

function withPoLineTotal(row: GridRow): GridRow {
  return { ...row, lineTotal: Number(row.qty ?? 0) * Number(row.unitCost ?? 0) };
}

function poLinesTotal(rows: GridRow[]) {
  return rows.reduce((sum, row) => sum + Number(row.qty ?? 0) * Number(row.unitCost ?? 0), 0);
}

function unitTypeForCategory(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes('flower')) return 'lb';
  if (normalized.includes('infused')) return 'case';
  if (normalized.includes('pre-roll')) return 'pack';
  return 'unit';
}

function composePoLineNotes(line: GridRow) {
  return [
    line.notes ? `Receipt: ${String(line.notes)}` : '',
    line.internalNotes ? `Internal: ${String(line.internalNotes)}` : '',
    line.paymentTerms ? `Terms: ${String(line.paymentTerms)}` : ''
  ].filter(Boolean).join(' | ');
}

function purchaseOrderPrimaryLabel(status: string) {
  if (['approved', 'ordered', 'partially_received'].includes(status)) return 'Receive PO';
  if (status === 'received') return 'Received';
  if (status === 'cancelled') return 'Cancelled';
  return 'Approve PO';
}

function purchaseOrderPrimaryDisabled(status: string) {
  return ['received', 'cancelled'].includes(status);
}

export function OrdersView() {
  return (
    <GridJourney
      view="orders"
      title="Orders"
      onCellCommit={(event, runCommand) => {
        if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
        if (event.colDef.field === 'deliveryWindow') {
          runCommand('setDeliveryWindow', { orderId: event.data.id, deliveryWindow: event.newValue }, 'Inline delivery window edit');
          return;
        }
        if (['notes', 'packed', 'inventoryPosted', 'paymentFollowup'].includes(String(event.colDef.field))) {
          runCommand('updateSalesOrderLine', { orderId: event.data.id, [String(event.colDef.field)]: event.newValue }, `Inline order closeout edit: ${event.colDef.field}`);
        }
      }}
      actions={(rows, runCommand) => (
        <>
          <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('confirmSalesOrder', { orderId: rows[0].id }, 'Mark selected order Ready/Confirmed')} type="button">
            <Check className="h-4 w-4" aria-hidden="true" />
            Ready
          </button>
          <button className="primary-button" disabled={!rows.length} onClick={() => runCommand('postSalesOrder', { orderId: rows[0].id }, 'Post selected order')} type="button">
            <Send className="h-4 w-4" aria-hidden="true" />
            Post
          </button>
          <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('repriceOrder', { orderId: rows[0].id, strategy: 'clearance' }, 'Reprice selected order')} type="button">
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Reprice
          </button>
          <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('allocateOrderToFulfillment', { orderId: rows[0].id }, 'Allocate order to fulfillment')} type="button">
            <Truck className="h-4 w-4" aria-hidden="true" />
            Fulfillment
          </button>
          <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('createPickList', { orderId: rows[0].id }, 'Create pick list for selected order')} type="button">
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            Pick list
          </button>
          <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('cancelSalesOrder', { orderId: rows[0].id }, 'Cancel selected order')} type="button">
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Cancel
          </button>
        </>
      )}
    />
  );
}

export function PaymentsView() {
  const selectedRows = useUiStore((state) => state.selectedRows.payments);
  const selectedPayment = selectedRows?.[0];
  return (
    <GridJourney
      view="payments"
      title="Payments"
      prelude={() => (
        <>
          <QuickLedgerGrid />
          <PaymentAllocationTools selectedPayment={selectedPayment} />
        </>
      )}
      actions={(rows, runCommand) => (
        <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('allocatePayment', { paymentId: rows[0].id }, 'Auto-apply payment to oldest open invoices')} type="button">
          <Check className="h-4 w-4" aria-hidden="true" />
          Auto-apply oldest
        </button>
      )}
    />
  );
}

function PaymentAllocationTools({ selectedPayment }: { selectedPayment?: GridRow }) {
  const reference = trpc.queries.reference.useQuery();
  const allocations = trpc.queries.paymentAllocations.useQuery({ paymentId: selectedPayment?.id }, { enabled: Boolean(selectedPayment?.id) });
  const { runCommand, isRunning } = useCommandRunner();
  const [allocationId, setAllocationId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const firstAllocation = allocations.data?.[0];
  const chosenAllocationId = allocationId || String(firstAllocation?.id ?? '');
  const invoices = (reference.data?.openInvoices ?? []).filter((invoice) => !selectedPayment?.customerId || invoice.customerId === selectedPayment.customerId);

  return (
    <section className="inline-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Payment allocations</h2>
          <p className="mt-1 text-xs text-zinc-600">Uses the selected payment row below.</p>
        </div>
        <span className="selection-pill">{allocations.data?.length ?? 0} allocation(s)</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="field-inline">
          Allocation
          <select className="select" value={chosenAllocationId} onChange={(event) => setAllocationId(event.target.value)} disabled={!allocations.data?.length}>
            <option value="">Choose</option>
            {allocations.data?.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>
                {String(row.invoiceNo)} / ${String(row.amount)}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="button" disabled={!chosenAllocationId || isRunning} onClick={() => runCommand('unallocatePayment', { allocationId: chosenAllocationId }, 'Unallocate selected payment allocation')}>
          Unallocate
        </button>
        <label className="field-inline">
          Invoice
          <select className="select" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)}>
            <option value="">Choose invoice</option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoiceNo} / ${Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0)}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          Discount
          <input className="input compact" value={discountAmount} inputMode="decimal" onChange={(event) => setDiscountAmount(event.target.value)} />
        </label>
        <button className="secondary-button" type="button" disabled={!invoiceId || !discountAmount || isRunning} onClick={() => runCommand('applyEarlyPayDiscount', { invoiceId, amount: Number(discountAmount) }, 'Apply early-pay discount from payments surface')}>
          Early discount
        </button>
      </div>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <span className="selection-pill">Selected {selectedPayment ? String(selectedPayment.reference ?? selectedPayment.id) : 'none'}</span>
        <span className="selection-pill">Unapplied ${moneyish(selectedPayment?.unappliedAmount)}</span>
        <span className="selection-pill success">{paymentAllocationLabel(selectedPayment?.allocationIntent)}</span>
      </div>
      {allocations.data?.length ? (
        <div className="finder-table-wrap max-h-48">
          <table className="finder-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Amount</th>
                <th>Created</th>
                <th>Trace</th>
              </tr>
            </thead>
            <tbody>
              {allocations.data.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.invoiceNo ?? row.invoiceId ?? 'Invoice')}</td>
                  <td>${moneyish(row.amount)}</td>
                  <td>{dateish(row.createdAt)}</td>
                  <td>{String(selectedPayment?.reference ?? selectedPayment?.method ?? 'Payment row')} -&gt; {String(row.invoiceNo ?? 'invoice')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function paymentAllocationLabel(intent: unknown) {
  if (intent === 'selected' || intent === 'selected_invoice') return 'Selected invoice';
  if (intent === 'unapplied') return 'Leave unapplied';
  return 'Auto-apply to oldest';
}

export function InventoryView() {
  const selectedRows = useUiStore((state) => state.selectedRows.inventory);
  const selectedBatch = selectedRows?.[0];
  const reference = trpc.queries.reference.useQuery();

  return (
    <GridJourney
      view="inventory"
      title="Inventory Batches"
      prelude={(runCommand) => (
        <>
          <PhotographyQueuePanel />
          <InventoryMovementTools selectedBatch={selectedBatch} vendors={reference.data?.vendors ?? []} runCommand={runCommand} />
        </>
      )}
      onCellCommit={(event, runCommand) => {
        if (event.colDef.field === 'unitPrice') runCommand('setBatchPrice', { batchId: event.data?.id, unitPrice: event.newValue }, 'Inline inventory price edit');
        if (event.colDef.field === 'availableQty') {
          runCommand(
            'adjustBatchQuantity',
            { batchId: event.data?.id, deltaQty: Number(event.newValue) - Number(event.oldValue), reason: 'Inline inventory adjustment from grid' },
            'Inline inventory quantity adjustment'
          );
        }
        if (['lotCode', 'expirationDate'].includes(String(event.colDef.field))) {
          runCommand('setBatchLotInfo', { batchId: event.data?.id, [String(event.colDef.field)]: event.newValue }, `Inline lot info edit: ${event.colDef.field}`);
        }
        if (['tags', 'legacyMarker', 'ownershipStatus', 'arrivalStatus', 'mediaStatus'].includes(String(event.colDef.field))) {
          runCommand('updateBatch', { batchId: event.data?.id, [String(event.colDef.field)]: event.newValue }, `Inline inventory edit: ${event.colDef.field}`);
        }
      }}
    />
  );
}

function InventoryMovementTools({
  selectedBatch,
  vendors,
  runCommand
}: {
  selectedBatch?: GridRow;
  vendors: Array<{ id: string; name: string }>;
  runCommand: ReturnType<typeof useCommandRunner>['runCommand'];
}) {
  const [status, setStatus] = useState('held');
  const [location, setLocation] = useState('');
  const [ownershipStatus, setOwnershipStatus] = useState('OFC');
  const [vendorId, setVendorId] = useState('');
  const [reason, setReason] = useState('Operator inventory correction');
  const [tagText, setTagText] = useState('');
  const batchId = selectedBatch?.id;
  const selectedLabel = selectedBatch
    ? `Inventory row: ${String(selectedBatch.batchCode ?? selectedBatch.name ?? 'Batch')} / ${labelFromToken(String(selectedBatch.status ?? 'status'))}`
    : 'Inventory row not selected';
  const consignedVendorId = vendorId || String(selectedBatch?.vendorId ?? '');

  useEffect(() => {
    const currentTags = selectedBatch?.tags;
    setTagText(Array.isArray(currentTags) ? currentTags.join(', ') : String(currentTags ?? ''));
  }, [selectedBatch?.id, selectedBatch?.tags]);

  return (
    <section className="inline-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Inventory controls</h2>
          <p className="text-xs text-zinc-600">Select a row in Inventory Batches below. Media queue selection is separate.</p>
        </div>
        <span className={selectedBatch ? 'selection-pill' : 'selection-pill warning'}>{selectedLabel}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="field-inline">
          Status
          <select className="select compact" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="posted">Available</option>
            <option value="held">Held</option>
            <option value="damaged">Damaged</option>
            <option value="returned">Returned</option>
            <option value="in_transit">In transit</option>
          </select>
        </label>
        <button className="secondary-button compact-action" type="button" disabled={!batchId || !reason.trim()} onClick={() => runCommand('setInventoryStatus', { batchId, status }, reason || `Set inventory status to ${status}`)}>
          <PackageCheck className="h-4 w-4" aria-hidden="true" />
          Set status
        </button>
        <label className="field-inline">
          Location
          <input className="input compact" value={location} placeholder={String(selectedBatch?.location ?? 'Warehouse A')} onChange={(event) => setLocation(event.target.value)} />
        </label>
        <button className="secondary-button compact-action" type="button" disabled={!batchId || !location.trim() || !reason.trim()} onClick={() => runCommand('transferInventoryLocation', { batchId, location: location.trim() }, reason || `Move inventory to ${location}`)}>
          <Truck className="h-4 w-4" aria-hidden="true" />
          Move location
        </button>
        <label className="field-inline">
          Owner
          <select className="select compact" value={ownershipStatus} onChange={(event) => setOwnershipStatus(event.target.value)}>
            <option value="OFC">Office</option>
            <option value="C">Consigned</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </label>
        {ownershipStatus === 'C' ? (
          <select className="select compact" aria-label="Consignment vendor" value={consignedVendorId} onChange={(event) => setVendorId(event.target.value)}>
            <option value="">Vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        ) : null}
        <button
          className="secondary-button compact-action"
          type="button"
          disabled={!batchId || !reason.trim() || (ownershipStatus === 'C' && !consignedVendorId)}
          onClick={() =>
            runCommand(
              'transferInventoryOwnership',
              { batchId, ownershipStatus, vendorId: ownershipStatus === 'C' ? consignedVendorId : undefined },
              reason || `Move inventory ownership to ${ownershipStatus}`
            )
          }
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Move ownership
        </button>
        <label className="field-inline grow">
          Reason
          <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <label className="field-inline grow">
          Tags
          <input className="input" value={tagText} placeholder="premium, candy" onChange={(event) => setTagText(event.target.value)} />
        </label>
        <button className="secondary-button compact-action" type="button" disabled={!batchId} onClick={() => runCommand('applyTags', { entityType: 'batch', entityId: batchId, tags: parseTagInput(tagText), mode: 'replace' }, 'Replace tags on selected inventory row')}>
          Apply tags
        </button>
      </div>
    </section>
  );
}

export function ClientLedgerView() {
  return <GridJourney view="clients" title="Client Ledger and Credit" />;
}

export function VendorPayablesView() {
  const selectedRows = useUiStore((state) => state.selectedRows.vendors);
  const selectedBill = selectedRows?.[0];
  const [payoutTrayOpen, setPayoutTrayOpen] = useState(false);
  return (
    <GridJourney
      view="vendors"
      title="Vendor Payables"
      prelude={() => (
        <>
          <VendorMoneyOutStrip selectedBill={selectedBill} />
          <VendorBillTools selectedBill={selectedBill} />
        </>
      )}
      actions={(rows, runCommand) => (
        <>
          <button className="primary-button" disabled={!rows.length || vendorPrimaryDisabled(String(rows[0]?.status ?? ''))} onClick={() => runVendorPrimary(rows[0], runCommand)} type="button">
            {vendorPrimaryIcon(String(rows[0]?.status ?? ''))}
            {vendorPrimaryLabel(String(rows[0]?.status ?? ''))}
          </button>
          <span className="selection-pill">{rows[0] ? `${String(rows[0].billNo ?? 'Bill')} / ${String(rows[0].status ?? 'open')}` : 'Select bill'}</span>
          <button className="secondary-button compact-action" disabled={!rows.length} onClick={() => setPayoutTrayOpen((value) => !value)} aria-expanded={payoutTrayOpen} type="button">
            {payoutTrayOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            Payout tray
          </button>
          {payoutTrayOpen ? (
            <>
              <button className="secondary-button compact-action" disabled={!rows.length} onClick={() => runCommand('approveVendorBill', { vendorBillId: rows[0].id }, 'Approve vendor bill')} type="button">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Approve
              </button>
              <button className="secondary-button compact-action" disabled={!rows.length} onClick={() => runCommand('scheduleVendorPayment', { vendorBillId: rows[0].id, scheduledFor: new Date(Date.now() + 86400000).toISOString() }, 'Schedule vendor payment')} type="button">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Schedule
              </button>
              <button className="secondary-button compact-action" disabled={!rows.length || rows[0].status !== 'scheduled'} onClick={() => runCommand('recordVendorPayment', { vendorBillId: rows[0].id }, 'Record vendor payout')} type="button">
                <Landmark className="h-4 w-4" aria-hidden="true" />
                Pay
              </button>
            </>
          ) : null}
        </>
      )}
    />
  );
}

function VendorMoneyOutStrip({ selectedBill }: { selectedBill?: GridRow }) {
  const { runCommand, isRunning } = useCommandRunner();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('cash');
  const [bucket, setBucket] = useState('accounting');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const openAmount = Number(selectedBill?.amount ?? 0) - Number(selectedBill?.amountPaid ?? 0);
  const payoutAmount = amount ? Number(amount) : openAmount;
  const selectedStatus = String(selectedBill?.status ?? '');
  const trace = selectedBill ? `${moneyBucketLabel(bucket)} to ${String(selectedBill.billNo ?? 'bill')}` : `${moneyBucketLabel(bucket)} to selected bill`;
  const impact = selectedBill ? `Pays ${moneyish(Math.min(Math.max(openAmount, 0), Math.max(payoutAmount, 0)))} on ${String(selectedBill.billNo ?? 'bill')}` : 'Select bill to preview payout';

  async function commit() {
    if (!selectedBill?.id) return;
    if (selectedStatus !== 'scheduled') {
      const scheduled = await runCommand('scheduleVendorPayment', { vendorBillId: selectedBill.id, scheduledFor: new Date(date).toISOString() }, 'Money out row: schedule vendor payout');
      if (!scheduled.ok) return;
    }
    await runCommand('recordVendorPayment', { vendorBillId: selectedBill.id, amount: payoutAmount, method, reference }, 'Money out row: record vendor payout');
  }

  return (
    <section className="money-out-strip" aria-label="Money out payout row">
      <span className="selection-pill">{selectedBill ? `${String(selectedBill.vendor ?? 'Vendor')} / ${String(selectedBill.billNo ?? 'bill')}` : 'Select vendor bill'}</span>
      <label className="field-inline">
        Date
        <input className="input compact" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <label className="field-inline">
        Method
        <select className="select compact" value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="wire">Wire</option>
          <option value="crypto">Crypto</option>
        </select>
      </label>
      <label className="field-inline">
        Bucket
        <select className="select compact" value={bucket} onChange={(event) => setBucket(event.target.value)}>
          <option value="accounting">Accounting</option>
          <option value="cash-file-a">Cash file A</option>
          <option value="cash-file-b">Cash file B</option>
          <option value="wire-clearing">Wire clearing</option>
        </select>
      </label>
      <label className="field-inline">
        Amount
        <input className="input compact" value={amount} placeholder={openAmount > 0 ? moneyish(openAmount) : '0'} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
      </label>
      <label className="field-inline grow">
        Reference
        <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} />
      </label>
      <span className="selection-pill">{impact}</span>
      <span className="selection-pill">{trace}</span>
      <button className="primary-button compact-action" type="button" disabled={!selectedBill?.id || payoutAmount <= 0 || isRunning} onClick={commit}>
        Commit payout
      </button>
    </section>
  );
}

function moneyBucketLabel(value: string) {
  const labels: Record<string, string> = {
    accounting: 'Accounting',
    'cash-file-a': 'Cash file A',
    'cash-file-b': 'Cash file B',
    'wire-clearing': 'Wire clearing'
  };
  return labels[value] ?? labelFromToken(value);
}

function vendorPrimaryLabel(status: string) {
  if (status === 'approved') return 'Schedule';
  if (status === 'scheduled') return 'Pay';
  if (status === 'paid') return 'Paid';
  return 'Approve';
}

function vendorPrimaryDisabled(status: string) {
  return status === 'paid' || status === 'void';
}

function vendorPrimaryIcon(status: string) {
  if (status === 'approved') return <CalendarClock className="h-4 w-4" aria-hidden="true" />;
  if (status === 'scheduled') return <Landmark className="h-4 w-4" aria-hidden="true" />;
  return <ShieldCheck className="h-4 w-4" aria-hidden="true" />;
}

function runVendorPrimary(row: GridRow | undefined, runCommand: ReturnType<typeof useCommandRunner>['runCommand']) {
  if (!row?.id) return;
  const status = String(row.status ?? '');
  if (status === 'scheduled') {
    runCommand('recordVendorPayment', { vendorBillId: row.id }, 'Record vendor payout');
    return;
  }
  if (status === 'approved') {
    runCommand('scheduleVendorPayment', { vendorBillId: row.id, scheduledFor: new Date(Date.now() + 86400000).toISOString() }, 'Schedule vendor payment');
    return;
  }
  runCommand('approveVendorBill', { vendorBillId: row.id }, 'Approve vendor bill');
}

function VendorBillTools({ selectedBill }: { selectedBill?: GridRow }) {
  const reference = trpc.queries.reference.useQuery();
  const vendorPayments = trpc.queries.vendorPayments.useQuery({ vendorBillId: selectedBill?.id }, { enabled: Boolean(selectedBill?.id) });
  const { runCommand, isRunning } = useCommandRunner();
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueReason, setDueReason] = useState('Manual vendor payable');
  const [vendorPaymentId, setVendorPaymentId] = useState('');
  const firstPayment = vendorPayments.data?.find((row) => row.status !== 'void');
  const chosenPaymentId = vendorPaymentId || String(firstPayment?.id ?? '');

  return (
    <section className="inline-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title">Vendor bill and payout tools</h2>
          <p className="mt-1 text-xs text-zinc-600">Manual bill creation and payout voiding are surfaced here instead of command-palette JSON.</p>
        </div>
        <span className="selection-pill">{vendorPayments.data?.length ?? 0} payout(s)</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="field-inline">
          Vendor
          <select className="select" value={vendorId || String(selectedBill?.vendorId ?? '')} onChange={(event) => setVendorId(event.target.value)}>
            <option value="">Choose vendor</option>
            {reference.data?.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          Amount
          <input className="input compact" value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="field-inline">
          Due
          <input className="input compact" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>
        <label className="field-inline">
          Why
          <input className="input" value={dueReason} onChange={(event) => setDueReason(event.target.value)} />
        </label>
        <button className="secondary-button" type="button" disabled={!(vendorId || selectedBill?.vendorId) || !amount || isRunning} onClick={() => runCommand('createVendorBill', { vendorId: vendorId || selectedBill?.vendorId, amount: Number(amount), dueDate: dueDate || undefined, dueReason }, 'Create manual vendor bill')}>
          Create bill
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="field-inline">
          Payout
          <select className="select" value={chosenPaymentId} onChange={(event) => setVendorPaymentId(event.target.value)} disabled={!vendorPayments.data?.length}>
            <option value="">Choose payout</option>
            {vendorPayments.data?.map((payment) => (
              <option key={String(payment.id)} value={String(payment.id)}>
                {String(payment.billNo)} / ${String(payment.amount)} / {labelFromToken(String(payment.status ?? 'open'))}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="button" disabled={!chosenPaymentId || isRunning} onClick={() => runCommand('voidVendorPayment', { vendorPaymentId: chosenPaymentId }, 'Void selected vendor payout')}>
          Void payout
        </button>
      </div>
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <span className="selection-pill">Bill {String(selectedBill?.billNo ?? 'none')}</span>
        <span className="selection-pill">Open ${moneyish(Number(selectedBill?.amount ?? 0) - Number(selectedBill?.amountPaid ?? 0))}</span>
        <span className="selection-pill success">{selectedBill ? String(selectedBill.dueReason ?? 'Due reason not recorded') : 'Select bill to see due reason'}</span>
      </div>
      {vendorPayments.data?.length ? (
        <div className="finder-table-wrap max-h-48">
          <table className="finder-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendorPayments.data.map((payment) => (
                <tr key={String(payment.id)}>
                  <td>{String(payment.billNo ?? selectedBill?.billNo ?? 'Bill')}</td>
                  <td>${moneyish(payment.amount)}</td>
                  <td>{labelFromToken(String(payment.method ?? '-'))}</td>
                  <td>{String(payment.reference ?? '-')}</td>
                  <td>{labelFromToken(String(payment.status ?? '-'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

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

  return (
    <div className="view-stack">
      <OperatorGrid
        view="fulfillment"
        title="Fulfillment"
        rows={pickRows}
        columns={columnsByView.fulfillment ?? []}
        loading={grid.isLoading || isRunning}
        onSelectionChange={(rows) => {
          setSelectedRows('fulfillment', rows);
          setSelectedLines([]);
        }}
        actions={canWrite ?
          <>
            <span className={selectedPick ? 'selection-pill' : 'selection-pill warning'}>{selectedPick ? `Showing ${String(selectedPick.pickNo ?? 'pick')}` : 'Select a pick row'}</span>
            {fulfillmentComplete ? <button className="primary-button" disabled={!selectedPick?.id} onClick={() => runCommand('markOrderFulfilled', { orderId: selectedPick?.orderId, tracking }, 'Mark order fulfilled')} type="button">
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              Fulfilled
            </button> : null}
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
          </>
          : null}
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
        view="fulfillment"
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
    </div>
  );
}

export function ConnectorsView() {
  const [operatorNotes, setOperatorNotes] = useState('');
  const selectedRows = useUiStore((state) => state.selectedRows.connectors);
  const selected = selectedRows?.[0];
  return (
    <GridJourney
      view="connectors"
      title="Inbound Requests"
      prelude={() => (
        <>
          <div className="control-band">
            <label className="field-inline">
              Notes
              <input className="input compact" value={operatorNotes} onChange={(event) => setOperatorNotes(event.target.value)} />
            </label>
            <span className="selection-pill">{selected ? `${formatRequestSource(selected.source)} / ${formatRequestType(selected.requestType)}` : 'Select request'}</span>
          </div>
          {selected ? (
            <section className="inline-panel text-sm">
              <h2 className="section-title">Selected request</h2>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <span>{formatRequestSource(selected.source)} / {formatRequestType(selected.requestType)}</span>
                <span>{String(selected.customer ?? 'No customer')}</span>
                <span>{String(selected.status ?? 'open')}</span>
              </div>
              <ConnectorTimeline selected={selected} />
            </section>
          ) : null}
        </>
      )}
      actions={(rows, runCommand) => (
        <>
          <button className="primary-button" disabled={!rows.length} onClick={() => runCommand('approveConnectorRequest', { requestId: rows[0].id, operatorNotes }, 'Approve inbound request')} type="button">
            <Check className="h-4 w-4" aria-hidden="true" />
            Approve
          </button>
          <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('rejectConnectorRequest', { requestId: rows[0].id, operatorNotes }, 'Reject connector request')} type="button">
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Reject
          </button>
        </>
      )}
    />
  );
}

function ConnectorTimeline({ selected }: { selected: GridRow }) {
  const history = normalizeReviewHistory(selected.reviewHistory);
  const steps = [
    { label: 'Received', detail: dateish(selected.createdAt), tone: 'done' },
    ...history.map((entry) => ({ label: labelFromToken(String(entry.status ?? 'reviewed')), detail: [entry.actorName, dateish(entry.at), entry.note].filter(Boolean).join(' · '), tone: entry.status === 'rejected' ? 'blocked' : 'done' })),
    { label: String(selected.status ?? 'open') === 'open' ? 'Waiting review' : 'Current status', detail: String(selected.status ?? 'open'), tone: String(selected.status ?? 'open') === 'rejected' ? 'blocked' : 'current' }
  ];
  return (
    <div className="connector-timeline" aria-label="Request review timeline">
      {steps.slice(0, 5).map((step, index) => (
        <div className="connector-timeline-step" key={`${step.label}-${index}`}>
          <span className={`timeline-dot timeline-dot-${step.tone}`} aria-hidden="true" />
          <strong>{step.label}</strong>
          <span>{step.detail || '-'}</span>
        </div>
      ))}
    </div>
  );
}

function normalizeReviewHistory(value: unknown): Array<{ status?: unknown; actorName?: unknown; at?: unknown; note?: unknown }> {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')) : [];
}

export function RecoveryView() {
  const selectedRecoveryRows = useUiStore((state) => state.selectedRows.recovery);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const rows = selectedRecoveryRows ?? EMPTY_ROWS;
  const { runCommand } = useCommandRunner();
  const [q, setQ] = useState('');
  const [showAdminTools, setShowAdminTools] = useState(false);
  const [backupId, setBackupId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState('0');
  const [memo, setMemo] = useState('');
  const [replaceTable, setReplaceTable] = useState<'batches' | 'customers' | 'vendors' | 'sales_orders' | 'connector_requests'>('batches');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceConfirm, setReplaceConfirm] = useState('');
  const search = trpc.queries.recoverySearch.useQuery({ q });
  const reference = trpc.queries.reference.useQuery();
  const support = trpc.queries.supportPacket.useQuery(undefined, { enabled: false });
  const diff = trpc.queries.snapshotDiff.useQuery({ backupId: backupId || '00000000-0000-0000-0000-000000000000' }, { enabled: Boolean(backupId) });
  const preview = trpc.queries.reversalPreview.useQuery({ commandId: String(rows[0]?.id ?? '00000000-0000-0000-0000-000000000000') }, { enabled: Boolean(rows[0]?.id) });
  const findReplace = trpc.queries.findReplacePreview.useQuery(
    { table: replaceTable, find: findText || '___', replacement: replaceText },
    { enabled: Boolean(findText) }
  );
  const selected = rows[0];
  return (
    <div className="view-stack">
      <div className="control-band">
        <label className="field-inline">
          Search
          <input className="input" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <button className="secondary-button compact-action" type="button" onClick={() => setShowAdminTools((value) => !value)} aria-expanded={showAdminTools}>
          {showAdminTools ? 'Hide admin tools' : 'Admin tools'}
        </button>
      </div>
      {showAdminTools ? (
        <>
          <div className="control-band subtle-band">
            <button className="secondary-button" type="button" onClick={() => support.refetch().then((result) => downloadJson('terp-agro-support-packet.json', result.data))}>
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Export support
            </button>
            <select className="select" value={backupId} onChange={(event) => setBackupId(event.target.value)}>
              <option value="">Backup preview</option>
              {reference.data?.backupSnapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.label}
                </option>
              ))}
            </select>
            <button className="secondary-button" type="button" disabled={!backupId} onClick={() => runCommand('restoreFromBackupPoint', { backupId }, 'Read-only backup restore preview')}>
              Restore preview
            </button>
          </div>
          <div className="control-band subtle-band">
            <label className="field-inline">
              Period
              <input className="input compact" value={period} onChange={(event) => setPeriod(event.target.value)} />
            </label>
            <label className="field-inline">
              Amount
              <input className="input compact" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <label className="field-inline">
              Memo
              <input className="input" value={memo} onChange={(event) => setMemo(event.target.value)} />
            </label>
            <button className="secondary-button" type="button" disabled={!memo} onClick={() => runCommand('createCorrectionJournalEntry', { period, amount: Number(amount), memo }, 'Create correction journal entry')}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Correction
            </button>
          </div>
          <div className="control-band subtle-band">
            <label className="field-inline">
              Find in
              <select className="select compact" value={replaceTable} onChange={(event) => setReplaceTable(event.target.value as typeof replaceTable)}>
                <option value="batches">Inventory Batches</option>
                <option value="customers">Customers</option>
                <option value="vendors">Vendors</option>
                <option value="sales_orders">Sales Orders</option>
                <option value="connector_requests">Inbound Requests</option>
              </select>
            </label>
            <label className="field-inline">
              Find value
              <input className="input compact" value={findText} onChange={(event) => setFindText(event.target.value)} />
            </label>
            <label className="field-inline">
              Replace with
              <input className="input compact" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} />
            </label>
            <label className="field-inline">
              Confirm
              <input className="input compact" value={replaceConfirm} placeholder="Type REPLACE" onChange={(event) => setReplaceConfirm(event.target.value)} />
            </label>
            <span className="selection-pill">{findReplace.data?.count ? `${findReplace.data.count} matching row(s)` : 'No matching rows'}</span>
            <button
              className="secondary-button"
              type="button"
              disabled={!findText || !findReplace.data?.count || replaceConfirm !== 'REPLACE'}
              onClick={() =>
                runCommand(
                  'createCorrectionJournalEntry',
                  {
                    period,
                    amount: 0,
                    memo: `Find and replace ${findText} -> ${replaceText} in ${replaceTable}`,
                    findReplace: { table: replaceTable, find: findText, replacement: replaceText }
                  },
                  'Action log find and replace with preview'
                )
              }
            >
              Apply previewed replace
            </button>
          </div>
        </>
      ) : null}
      <OperatorGrid
        view="recovery"
        title="Action Log"
        rows={(search.data ?? []) as GridRow[]}
        columns={columnsByView.recovery ?? []}
        loading={search.isLoading}
        onSelectionChange={(selection) => setSelectedRows('recovery', selection)}
        emptyTitle="No recent actions"
        emptyChildren="Recent commands will appear here automatically. Use search when you need a specific row, person, or action."
        actions={
          <>
            <button className="secondary-button" disabled={!selected || selected.status !== 'failed'} onClick={() => runCommand(String(selected?.commandName) as CommandName, payloadObject(selected?.inputPayload), 'Retry failed command')} type="button">
              <Send className="h-4 w-4" aria-hidden="true" />
              Retry
            </button>
            <button className="primary-button" disabled={!selected || !preview.data?.reversible} onClick={() => runCommand('reverseCommandById', { commandId: selected?.id }, 'Reverse selected command')} type="button">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Undo
            </button>
          </>
        }
      />
      {preview.data ? <div className="border border-line bg-white p-3 text-sm">{preview.data.plainLanguageImpact}</div> : null}
      {showAdminTools && diff.data ? (
        <section className="border border-line bg-white p-3">
          <h2 className="section-title">Snapshot diff</h2>
          <div className="mt-2 grid gap-1 text-sm">
            {diff.data.rows.map((row) => (
              <div key={row.key} className="activity-row">
                <span>{row.key}</span>
                <span>backup {row.backup}</span>
                <span>current {row.current}</span>
                <span>delta {row.delta}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {showAdminTools && findReplace.data?.rows.length ? (
        <section className="inline-panel">
          <h2 className="section-title">Find / replace preview</h2>
          <div className="mt-2 grid gap-2 text-xs">
            {findReplace.data.rows.slice(0, 8).map((row) => (
              <div key={row.id} className="border border-line bg-panel p-2">
                <strong>{row.id}</strong>
                {row.matches.map((match) => (
                  <div key={match.field} className="mt-1">
                    {match.field}: {String(match.before)} {'->'} {String(match.after)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function CloseoutView() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [adjustmentAmount, setAdjustmentAmount] = useState('0');
  const [adjustmentMemo, setAdjustmentMemo] = useState('');
  const [showAdjustment, setShowAdjustment] = useState(false);
  const preview = trpc.queries.closeoutPreview.useQuery({ period });
  const { runCommand } = useCommandRunner();
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setActiveSettingsTab = useUiStore((state) => state.setActiveSettingsTab);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const controlTotals = preview.data?.controlTotals ?? {};
  const blockers = preview.data?.blockers ?? [];
  const openWorkCount = preview.data?.openWorkCount ?? preview.data?.unsafeRows ?? 0;
  const readiness = closeoutReadiness(preview.data?.locked, openWorkCount);
  const lockDisabled = openWorkCount > 0 || Boolean(preview.data?.locked);

  function openBlocker(blockerId?: string) {
    const target = blockerTarget(blockerId);
    if (target.settingsTab) setActiveSettingsTab(target.settingsTab);
    setGridFilter(target.filterView ?? target.view, target.filter);
    setActiveView(target.view);
  }

  return (
    <div className="view-stack">
      <div className="control-band">
        <label className="field-inline">
          Period
          <input className="input compact" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
        <button className={openWorkCount > 0 ? 'secondary-button compact-action' : 'text-button compact-action'} type="button" onClick={() => openBlocker(blockers[0]?.id)}>
          Open work: {openWorkCount}
        </button>
        <span className={`selection-pill ${readiness.tone}`}>{readiness.label}</span>
        <span className="text-sm text-zinc-700">Batches: {controlTotals.batches ?? 0}</span>
        <span className="text-sm text-zinc-700">Sales: {controlTotals.salesOrders ?? 0}</span>
        <span className="text-sm text-zinc-700">POs: {controlTotals.purchaseOrders ?? 0}</span>
        <span className="text-sm text-zinc-700">Commands: {controlTotals.commands ?? 0}</span>
        <button className="secondary-button" type="button" onClick={() => setShowAdjustment((value) => !value)}>
          {showAdjustment ? 'Hide adjustment' : 'Adjustment'}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={lockDisabled}
          title={openWorkCount > 0 ? 'Review open work before locking this period.' : preview.data?.locked ? 'This period is already locked.' : undefined}
          onClick={() => runCommand('lockPeriod', { period }, 'Lock closeout period')}
        >
          Lock period
        </button>
        <button className="primary-button" type="button" disabled={!preview.data?.locked || openWorkCount > 0} onClick={() => runCommand('archivePeriod', { period, verified: true }, 'Archive locked period')}>
          Archive
        </button>
      </div>
      {showAdjustment ? (
        <div className="control-band subtle-band">
          <label className="field-inline">
            Adj
            <input className="input compact" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} />
          </label>
          <label className="field-inline">
            Memo
            <input className="input" value={adjustmentMemo} onChange={(event) => setAdjustmentMemo(event.target.value)} />
          </label>
          <button className="secondary-button" type="button" disabled={!adjustmentMemo} onClick={() => runCommand('postPeriodAdjustments', { period, amount: Number(adjustmentAmount), memo: adjustmentMemo }, 'Post closeout adjustment')}>
          Post adjustment
          </button>
        </div>
      ) : null}
      <section className="inline-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="section-title">Archive readiness</h2>
          </div>
          <span className={preview.data?.eligible ? 'selection-pill success' : 'selection-pill warning'}>{preview.data?.eligible ? 'Ready' : 'Open work'}</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(controlTotals).map(([key, value]) => (
            <div key={key} className="metric-mini">
              <span className="text-[11px] uppercase text-zinc-500">{key.replace(/([A-Z])/g, ' $1')}</span>
              <strong>{Number(value ?? 0).toLocaleString('en-US')}</strong>
            </div>
          ))}
        </div>
        {blockers.length ? (
          <div className="mt-3 grid gap-2 text-sm">
            {blockers.map((blocker) => (
              <button key={String(blocker.id)} type="button" className="closeout-blocker-row" onClick={() => openBlocker(String(blocker.id))}>
                <span className="font-medium text-ink">{String(blocker.label)}</span>
                <span className="selection-pill warning">{Number(blocker.count ?? 0).toLocaleString('en-US')}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>
      <GridJourney view="closeout" title="Archive Runs" />
    </div>
  );
}

function closeoutReadiness(locked: unknown, openWorkCount: number) {
  if (openWorkCount > 0) return { label: 'Review open work', tone: 'warning' };
  if (locked) return { label: 'Ready to archive', tone: 'success' };
  return { label: 'Ready to lock', tone: 'success' };
}

function blockerTarget(blockerId?: string): { view: ViewKey; filter: string; filterView?: ViewKey; settingsTab?: 'requests' | 'actions' | 'archive' } {
  const map: Record<string, { view: ViewKey; filter: string; filterView?: ViewKey; settingsTab?: 'requests' | 'actions' | 'archive' }> = {
    unsafeBatches: { view: 'intake', filter: 'status:draft,needs_fix' },
    unsafePurchaseOrders: { view: 'purchaseOrders', filter: 'status:draft,approved,ordered,partially_received' },
    openConnectors: { view: 'settings', filterView: 'connectors', settingsTab: 'requests', filter: 'status:open,pending_review,approved,accepted,routed,posting,failed' },
    openFulfillment: { view: 'fulfillment', filter: 'status:open,packed' },
    failedCommands: { view: 'settings', filterView: 'recovery', settingsTab: 'actions', filter: 'failed' },
    unresolvedDrafts: { view: 'orders', filter: 'status:draft' }
  };
  return map[blockerId ?? ''] ?? { view: 'dashboard', filter: '' };
}

export function SettingsView() {
  const activeTab = useUiStore((state) => state.activeSettingsTab);
  const setActiveTab = useUiStore((state) => state.setActiveSettingsTab);
  const tabs = [
    { key: 'requests', label: 'Requests' },
    { key: 'actions', label: 'Action log' },
    { key: 'archive', label: 'Archive' }
  ] as const;
  const activeTabLabel = tabs.find((tab) => tab.key === activeTab)?.label ?? 'Settings';
  return (
    <div className="view-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{activeTabLabel}</h1>
          <p className="page-subtitle">System review, audit history, and archive controls for managers.</p>
        </div>
      </div>
      <div className="report-chip-row" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={activeTab === tab.key ? 'report-chip report-chip-active' : 'report-chip'}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'requests' ? <ConnectorsView /> : null}
      {activeTab === 'actions' ? <RecoveryView /> : null}
      {activeTab === 'archive' ? <CloseoutView /> : null}
    </div>
  );
}

function GridJourney({
  view,
  title,
  actions,
  prelude,
  onCellCommit
}: {
  view: Exclude<ViewKey, 'dashboard' | 'intake' | 'sales' | 'reports' | 'settings'>;
  title: string;
  actions?: (rows: GridRow[], runCommand: ReturnType<typeof useCommandRunner>['runCommand']) => React.ReactNode;
  prelude?: (runCommand: ReturnType<typeof useCommandRunner>['runCommand']) => React.ReactNode;
  onCellCommit?: (event: CellValueChangedEvent<GridRow>, runCommand: ReturnType<typeof useCommandRunner>['runCommand']) => void;
}) {
  const grid = trpc.queries.grid.useQuery({ view });
  const selectedRows = useUiStore((state) => state.selectedRows[view]);
  const selected = selectedRows ?? EMPTY_ROWS;
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const { runCommand } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  return (
    <div className="view-stack">
      {canWrite ? prelude?.(runCommand) : null}
      <OperatorGrid
        view={view}
        title={title}
        rows={(grid.data ?? []) as GridRow[]}
        columns={columnsByView[view] ?? []}
        loading={grid.isLoading}
        onSelectionChange={(rows) => setSelectedRows(view, rows)}
        onCellCommit={(event) => onCellCommit?.(event, runCommand)}
        actions={canWrite ? actions?.(selected, runCommand) : null}
      />
    </div>
  );
}

function downloadJson(filename: string, value: unknown) {
  if (!value) return;
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function payloadObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function safeHistory(value: unknown) {
  if (!value) return 'No review history yet.';
  if (Array.isArray(value)) return value.map((entry) => (typeof entry === 'object' && entry ? Object.values(entry).map(historyValue).join(' / ') : historyValue(entry))).join('; ');
  if (typeof value === 'object') return Object.values(value).map(historyValue).join(' / ');
  return historyValue(value);
}

function historyValue(value: unknown) {
  return String(value === 'routed' ? 'in progress' : value);
}

function formatRequestType(value: unknown) {
  const raw = String(value ?? '');
  const labels: Record<string, string> = {
    catalog_request: 'Catalog Request',
    reserve_request: 'Reserve Request',
    bag_scan: 'Bag Scan',
    cart_submit: 'Cart Submit',
    session_end: 'Session End'
  };
  return labels[raw] ?? labelFromToken(raw);
}

function formatRequestSource(value: unknown) {
  const raw = String(value ?? '');
  const labels: Record<string, string> = {
    vip: 'VIP customer',
    'live-shopping': 'Live order',
    'mobile-scan': 'Warehouse scan'
  };
  return labels[raw] ?? labelFromToken(raw);
}

function labelFromToken(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function moneyish(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

function dateish(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}
