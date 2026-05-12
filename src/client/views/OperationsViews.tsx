import { CalendarClock, Check, ClipboardList, FileDown, Landmark, ListChecks, PackageCheck, PackagePlus, Plus, RotateCcw, Send, ShieldCheck, Trash2, Truck, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type React from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { PhotographyQueuePanel } from '../components/PhotographyQueuePanel';
import { QuickLedgerGrid } from '../components/QuickLedgerGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow, ViewKey } from '../../shared/types';
import type { CommandName } from '../../shared/commandCatalog';

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
    { field: 'legacyStatusMarkers', headerName: 'Raw', width: 115 },
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
    { field: 'vendor', width: 180 },
    { field: 'availableQty', editable: true, type: 'numericColumn', width: 130 },
    { field: 'reservedQty', type: 'numericColumn', width: 130 },
    { field: 'uom', width: 90 },
    { field: 'unitCost', type: 'numericColumn', width: 110 },
    { field: 'unitPrice', editable: true, type: 'numericColumn', width: 110 },
    { field: 'location', width: 120 },
    { field: 'legacyMarker', headerName: 'Raw', editable: true, width: 90 },
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
    { field: 'source', pinned: 'left', width: 140 },
    { field: 'requestType', width: 170 },
    { field: 'customer', width: 180 },
    { field: 'status', width: 125 },
    { field: 'routedTo', width: 130 },
    { field: 'operatorNotes', minWidth: 180 },
    { field: 'safetyNote', minWidth: 260 },
    { field: 'payload', minWidth: 260 },
    { field: 'createdAt', width: 180 }
  ],
  recovery: [
    { field: 'id', pinned: 'left', width: 240 },
    { field: 'commandName', width: 220 },
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
    { field: 'csvPath', minWidth: 240 },
    { field: 'jsonlPath', minWidth: 240 },
    { field: 'pdfPath', minWidth: 240 },
    { field: 'createdAt', width: 180 }
  ]
};

const EMPTY_ROWS: GridRow[] = [];

const purchaseOrderLineColumns: ColDef<GridRow>[] = [
  { field: 'productName', headerName: 'Product', pinned: 'left', editable: true, minWidth: 190 },
  { field: 'category', editable: true, width: 120 },
  { field: 'qty', headerName: 'Ordered', editable: true, type: 'numericColumn', width: 120 },
  { field: 'receivedQty', headerName: 'Received', width: 120 },
  { field: 'uom', editable: true, width: 90 },
  { field: 'unitCost', headerName: 'Cost', editable: true, type: 'numericColumn', width: 110 },
  { field: 'unitPrice', headerName: 'Target price', editable: true, type: 'numericColumn', width: 130 },
  { field: 'sourceCode', headerName: 'Code', editable: true, width: 130 },
  { field: 'shorthand', editable: true, width: 120 },
  { field: 'legacyMarker', headerName: 'Raw', editable: true, width: 90 },
  { field: 'ownershipStatus', headerName: 'Owner', editable: true, width: 110 },
  { field: 'notes', editable: true, minWidth: 180 },
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
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedPo = selected[0];
  const lines = trpc.queries.purchaseOrderLines.useQuery(
    { purchaseOrderId: String(selectedPo?.id ?? '00000000-0000-0000-0000-000000000000') },
    { enabled: Boolean(selectedPo?.id) }
  );
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const [vendorId, setVendorId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [productName, setProductName] = useState('Infused Candy');
  const [category, setCategory] = useState('Infused');
  const [qty, setQty] = useState('1');
  const [unitCost, setUnitCost] = useState('0');
  const [unitPrice, setUnitPrice] = useState('0');
  const [selectedLines, setSelectedLines] = useState<GridRow[]>([]);
  const defaultVendorId = vendorId || reference.data?.vendors[0]?.id || '';

  async function createPo() {
    const result = await runCommand('createPurchaseOrder', { vendorId: defaultVendorId, expectedDate: expectedDate || undefined }, 'Create purchase order from PO workspace');
    if (result.ok && result.affectedIds[0]) setSelectedRows('purchaseOrders', [{ id: result.affectedIds[0] }]);
  }

  async function addLine() {
    if (!selectedPo?.id) return;
    await runCommand(
      'addPurchaseOrderLine',
      {
        purchaseOrderId: selectedPo.id,
        productName,
        category,
        qty: Number(qty),
        unitCost: Number(unitCost),
        unitPrice: Number(unitPrice || unitCost),
        sourceCode: selectedPo.poNo,
        ownershipStatus: 'UNKNOWN'
      },
      'Add product line to selected purchase order'
    );
  }

  async function updatePoCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    if (['expectedDate', 'buyerNotes', 'internalNotes'].includes(String(event.colDef.field))) {
      await runCommand('updatePurchaseOrder', { purchaseOrderId: event.data.id, [String(event.colDef.field)]: event.newValue }, `Inline purchase order edit: ${event.colDef.field}`);
    }
  }

  async function updateLineCell(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    await runCommand('updatePurchaseOrderLine', { lineId: event.data.id, [String(event.colDef.field)]: event.newValue }, `Inline purchase order line edit: ${event.colDef.field}`);
  }

  return (
    <div className="view-stack">
      {canWrite ? (
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
          <label className="field-inline">
            Expected
            <input className="input compact" type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} />
          </label>
          <button className="primary-button" type="button" disabled={!defaultVendorId || isRunning} onClick={createPo}>
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            New PO
          </button>
          <span className="selection-pill">PO first, receiving second, intake posting last.</span>
        </div>
      ) : null}
      <OperatorGrid
        view="purchaseOrders"
        title="Purchase Orders"
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
              <button className="secondary-button" disabled={!selected.length || isRunning} onClick={() => runCommand('approvePurchaseOrder', { purchaseOrderId: selected[0].id }, 'Approve selected purchase order')} type="button">
                <Check className="h-4 w-4" aria-hidden="true" />
                Approve
              </button>
              <button className="primary-button" disabled={!selected.length || isRunning} onClick={() => runCommand('receivePurchaseOrder', { purchaseOrderId: selected[0].id }, 'Receive selected purchase order to intake')} type="button">
                <PackagePlus className="h-4 w-4" aria-hidden="true" />
                Receive to Intake
              </button>
              <button className="secondary-button" disabled={!selected.length || isRunning} onClick={() => runCommand('cancelPurchaseOrder', { purchaseOrderId: selected[0].id }, 'Cancel selected purchase order')} type="button">
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Cancel
              </button>
            </>
          ) : null
        }
      />
      {selectedPo ? (
        <>
          {canWrite ? (
            <div className="control-band subtle-band">
              <label className="field-inline grow">
                Product
                <input className="input" value={productName} onChange={(event) => setProductName(event.target.value)} />
              </label>
              <label className="field-inline">
                Category
                <select className="select compact" value={category} onChange={(event) => setCategory(event.target.value)}>
                  {reference.data?.categories.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="field-inline">
                Qty
                <input className="input compact" value={qty} inputMode="decimal" onChange={(event) => setQty(event.target.value)} />
              </label>
              <label className="field-inline">
                Cost
                <input className="input compact" value={unitCost} inputMode="decimal" onChange={(event) => setUnitCost(event.target.value)} />
              </label>
              <label className="field-inline">
                Price
                <input className="input compact" value={unitPrice} inputMode="decimal" onChange={(event) => setUnitPrice(event.target.value)} />
              </label>
              <button className="secondary-button" type="button" disabled={!productName || Number(qty) <= 0 || isRunning} onClick={addLine}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Line
              </button>
            </div>
          ) : null}
          <OperatorGrid
            view="purchaseOrders"
            title={`${String(selectedPo.poNo ?? 'Selected PO')} Lines`}
            rows={(lines.data ?? []) as GridRow[]}
            columns={purchaseOrderLineColumns}
            loading={lines.isLoading || isRunning}
            onSelectionChange={setSelectedLines}
            onCellCommit={canWrite ? updateLineCell : undefined}
            actions={
              canWrite ? (
                <>
                  <button
                    className="secondary-button"
                    disabled={!selectedLines.length || isRunning}
                    onClick={() => runCommand('receivePurchaseOrder', { purchaseOrderId: selectedPo.id, lineIds: selectedLines.map((line) => line.id) }, 'Receive selected PO lines to intake')}
                    type="button"
                  >
                    <PackagePlus className="h-4 w-4" aria-hidden="true" />
                    Receive Lines
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!selectedLines.length || isRunning}
                    onClick={() => runCommand('removePurchaseOrderLine', { lineId: selectedLines[0].id }, 'Remove selected purchase order line')}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove Line
                  </button>
                </>
              ) : null
            }
          />
        </>
      ) : null}
    </div>
  );
}

export function OrdersView() {
  return (
    <GridJourney
      view="orders"
      title="J04 Client Order Posting"
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
      title="J05 Payment Logging and Allocation"
      prelude={() => (
        <>
          <QuickLedgerGrid />
          <PaymentAllocationTools selectedPayment={selectedPayment} />
        </>
      )}
      actions={(rows, runCommand) => (
        <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('allocatePayment', { paymentId: rows[0].id }, 'FIFO payment allocation')} type="button">
          <Check className="h-4 w-4" aria-hidden="true" />
          FIFO Allocate
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
          <p className="mt-1 text-xs text-zinc-600">Allocation rows, unallocation, and early-pay discount are first-class controls here.</p>
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
    </section>
  );
}

export function InventoryView() {
  return (
    <GridJourney
      view="inventory"
      title="Inventory Batches"
      prelude={() => <PhotographyQueuePanel />}
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
        if (['legacyMarker', 'ownershipStatus', 'arrivalStatus', 'mediaStatus'].includes(String(event.colDef.field))) {
          runCommand('updateBatch', { batchId: event.data?.id, [String(event.colDef.field)]: event.newValue }, `Inline inventory edit: ${event.colDef.field}`);
        }
      }}
    />
  );
}

export function ClientLedgerView() {
  return <GridJourney view="clients" title="Client Ledger and Credit" />;
}

export function VendorPayablesView() {
  const selectedRows = useUiStore((state) => state.selectedRows.vendors);
  const selectedBill = selectedRows?.[0];
  return (
    <GridJourney
      view="vendors"
      title="J06 Vendor Payable and Payout"
      prelude={() => <VendorBillTools selectedBill={selectedBill} />}
      actions={(rows, runCommand) => (
        <>
          <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('approveVendorBill', { vendorBillId: rows[0].id }, 'Approve vendor bill')} type="button">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Approve
          </button>
          <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('scheduleVendorPayment', { vendorBillId: rows[0].id, scheduledFor: new Date(Date.now() + 86400000).toISOString() }, 'Schedule vendor payment')} type="button">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Schedule
          </button>
          <button className="primary-button" disabled={!rows.length || rows[0].status !== 'scheduled'} onClick={() => runCommand('recordVendorPayment', { vendorBillId: rows[0].id }, 'Record vendor payout')} type="button">
            <Landmark className="h-4 w-4" aria-hidden="true" />
            Pay
          </button>
        </>
      )}
    />
  );
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
                {String(payment.billNo)} / ${String(payment.amount)} / {String(payment.status)}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="button" disabled={!chosenPaymentId || isRunning} onClick={() => runCommand('voidVendorPayment', { vendorPaymentId: chosenPaymentId }, 'Void selected vendor payout')}>
          Void payout
        </button>
      </div>
    </section>
  );
}

export function FulfillmentView() {
  const grid = trpc.queries.grid.useQuery({ view: 'fulfillment' });
  const selectedRows = useUiStore((state) => state.selectedRows.fulfillment);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedPick = selected[0];
  const lines = trpc.queries.fulfillmentLines.useQuery({ pickListId: String(selectedPick?.id ?? '00000000-0000-0000-0000-000000000000') }, { enabled: Boolean(selectedPick?.id) });
  const [selectedLines, setSelectedLines] = useState<GridRow[]>([]);
  const [actualQty, setActualQty] = useState('');
  const [actualWeight, setActualWeight] = useState('');
  const [bagCode, setBagCode] = useState('');
  const [tracking, setTracking] = useState('');
  const [labelFormat, setLabelFormat] = useState('4x6');
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const line = selectedLines[0];
  return (
    <div className="view-stack">
      <OperatorGrid
        view="fulfillment"
        title="J07 Fulfillment and Bagging"
        rows={(grid.data ?? []) as GridRow[]}
        columns={columnsByView.fulfillment ?? []}
        loading={grid.isLoading || isRunning}
        onSelectionChange={(rows) => {
          setSelectedRows('fulfillment', rows);
          setSelectedLines([]);
        }}
        actions={canWrite ?
          <>
            <label className="field-inline">
              Print
              <select className="select compact" value={labelFormat} onChange={(event) => setLabelFormat(event.target.value)}>
                <option value="4x6">4x6</option>
                <option value="2x1">2x1</option>
              </select>
            </label>
            <button className="secondary-button" disabled={!selected.length} onClick={() => runCommand('printLabels', { pickListId: selected[0].id, labelFormat }, 'Print labels')} type="button">
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Labels
            </button>
            <button className="primary-button" disabled={!selected.length} onClick={() => runCommand('markOrderFulfilled', { orderId: selected[0].orderId, tracking }, 'Mark order fulfilled')} type="button">
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              Fulfilled
            </button>
          </>
          : null}
      />
      {canWrite ? <div className="control-band">
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
          disabled={!line}
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
      </div> : null}
      <OperatorGrid
        view="fulfillment"
        title="Fulfillment Lines"
        rows={(lines.data ?? []) as GridRow[]}
        columns={fulfillmentLineColumns}
        loading={lines.isLoading}
        onSelectionChange={setSelectedLines}
        onCellCommit={canWrite ? (event) => {
          if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
          runCommand('adjustFulfillmentLine', { fulfillmentLineId: event.data.id, [event.colDef.field]: event.newValue }, `Inline fulfillment edit: ${event.colDef.field}`);
        } : undefined}
      />
    </div>
  );
}

export function ConnectorsView() {
  const [routeTo, setRouteTo] = useState('sales');
  const [operatorNotes, setOperatorNotes] = useState('');
  const selectedRows = useUiStore((state) => state.selectedRows.connectors);
  const selected = selectedRows?.[0];
  return (
    <GridJourney
      view="connectors"
      title="J08 Connector Request Review"
      prelude={() => (
        <>
          <div className="control-band">
            <span className="selection-pill success">Connector requests route work only; ledgers change after core operators post commands.</span>
            <label className="field-inline">
              Route
              <select className="select compact" value={routeTo} onChange={(event) => setRouteTo(event.target.value)}>
                {['sales', 'intake', 'fulfillment', 'payments'].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="field-inline">
              Notes
              <input className="input compact" value={operatorNotes} onChange={(event) => setOperatorNotes(event.target.value)} />
            </label>
          </div>
          {selected ? (
            <section className="inline-panel text-sm">
              <h2 className="section-title">Selected request history</h2>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                <span>{String(selected.source)} / {String(selected.requestType)}</span>
                <span>{String(selected.safetyNote ?? 'No direct ledger mutation.')}</span>
                <span>{safeHistory(selected.reviewHistory)}</span>
              </div>
            </section>
          ) : null}
        </>
      )}
      actions={(rows, runCommand) => (
        <>
          <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('approveConnectorRequest', { requestId: rows[0].id, routedTo: routeTo, operatorNotes }, 'Approve connector request without ledger mutation')} type="button">
            <Check className="h-4 w-4" aria-hidden="true" />
            Approve
          </button>
          <button className="secondary-button" disabled={!rows.length} onClick={() => runCommand('rejectConnectorRequest', { requestId: rows[0].id, operatorNotes }, 'Reject connector request')} type="button">
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Reject
          </button>
          <button className="primary-button" disabled={!rows.length} onClick={() => runCommand('routeConnectorRequest', { requestId: rows[0].id, routedTo: routeTo, operatorNotes }, 'Route connector request')} type="button">
            <Send className="h-4 w-4" aria-hidden="true" />
            Route
          </button>
        </>
      )}
    />
  );
}

export function RecoveryView() {
  const selectedRecoveryRows = useUiStore((state) => state.selectedRows.recovery);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const rows = selectedRecoveryRows ?? EMPTY_ROWS;
  const { runCommand } = useCommandRunner();
  const [q, setQ] = useState('');
  const [backupId, setBackupId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState('0');
  const [memo, setMemo] = useState('');
  const [replaceTable, setReplaceTable] = useState<'batches' | 'customers' | 'vendors' | 'sales_orders' | 'connector_requests'>('batches');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
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
        <button className="secondary-button" type="button" onClick={() => support.refetch().then((result) => downloadJson('terp-agro-support-packet.json', result.data))}>
          <FileDown className="h-4 w-4" aria-hidden="true" />
          Support packet
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
      <div className="control-band">
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
          Table
          <select className="select compact" value={replaceTable} onChange={(event) => setReplaceTable(event.target.value as typeof replaceTable)}>
            <option value="batches">batches</option>
            <option value="customers">customers</option>
            <option value="vendors">vendors</option>
            <option value="sales_orders">sales orders</option>
            <option value="connector_requests">connector requests</option>
          </select>
        </label>
        <label className="field-inline">
          Find
          <input className="input compact" value={findText} onChange={(event) => setFindText(event.target.value)} />
        </label>
        <label className="field-inline">
          Replace
          <input className="input compact" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} />
        </label>
        <span className="selection-pill">{findReplace.data?.count ?? 0} match row(s)</span>
        <button
          className="secondary-button"
          type="button"
          disabled={!findText || !findReplace.data?.count}
          onClick={() =>
            runCommand(
              'createCorrectionJournalEntry',
              {
                period,
                amount: 0,
                memo: `Find and replace ${findText} -> ${replaceText} in ${replaceTable}`,
                findReplace: { table: replaceTable, find: findText, replacement: replaceText }
              },
              'Recovery find and replace with preview'
            )
          }
        >
          Apply previewed replace
        </button>
      </div>
      <OperatorGrid
        view="recovery"
        title="J09 Mistake Recovery"
        rows={(search.data ?? []) as GridRow[]}
        columns={columnsByView.recovery ?? []}
        loading={search.isLoading}
        onSelectionChange={(selection) => setSelectedRows('recovery', selection)}
        actions={
          <>
            <button className="secondary-button" disabled={!selected || selected.status !== 'failed'} onClick={() => runCommand(String(selected?.commandName) as CommandName, payloadObject(selected?.inputPayload), 'Retry failed command')} type="button">
              <Send className="h-4 w-4" aria-hidden="true" />
              Retry
            </button>
            <button className="primary-button" disabled={!selected || !preview.data?.reversible} onClick={() => runCommand('reverseCommandById', { commandId: selected?.id }, 'Reverse selected command')} type="button">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reverse
            </button>
          </>
        }
      />
      {preview.data ? <div className="border border-line bg-white p-3 text-sm">{preview.data.plainLanguageImpact}</div> : null}
      {diff.data ? (
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
      {findReplace.data?.rows.length ? (
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
  return (
    <div className="view-stack">
      <div className="control-band">
        <label className="field-inline">
          Period
          <input className="input compact" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
        <button className={(preview.data?.unsafeRows ?? 0) > 0 ? 'secondary-button compact-action' : 'text-button compact-action'} type="button" onClick={() => setActiveView('intake')}>
          Unsafe rows: {preview.data?.unsafeRows ?? 0}
        </button>
        <span className="text-sm text-zinc-700">Batches: {preview.data?.controlTotals.batches ?? 0}</span>
        <span className="text-sm text-zinc-700">Orders: {preview.data?.controlTotals.orders ?? 0}</span>
        <span className="text-sm text-zinc-700">Commands: {preview.data?.controlTotals.commands ?? 0}</span>
        <button className="secondary-button" type="button" onClick={() => setShowAdjustment((value) => !value)}>
          {showAdjustment ? 'Hide adjustment' : 'Adjustment'}
        </button>
        <button className="secondary-button" type="button" onClick={() => runCommand('lockPeriod', { period }, 'Lock closeout period')}>
          Lock period
        </button>
        <button className="primary-button" type="button" disabled={!preview.data?.locked || (preview.data?.unsafeRows ?? 1) > 0} onClick={() => runCommand('archivePeriod', { period, verified: true }, 'Archive locked period')}>
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
      <GridJourney view="closeout" title="J10 Archive and Closeout" />
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
  view: Exclude<ViewKey, 'dashboard' | 'intake' | 'sales'>;
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
  if (Array.isArray(value)) return value.map((entry) => (typeof entry === 'object' && entry ? Object.values(entry).join(' / ') : String(entry))).join('; ');
  if (typeof value === 'object') return Object.values(value).join(' / ');
  return String(value);
}
