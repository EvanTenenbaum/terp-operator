import { ChevronDown, ChevronRight, FileText, PackagePlus, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { InventoryFinderPanel, type InventoryFinderBatch } from '../components/InventoryFinderPanel';
import { OperatorGrid } from '../components/OperatorGrid';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';

const orderColumns: ColDef<GridRow>[] = [
  { field: 'orderNo', pinned: 'left', width: 150 },
  { field: 'customer', width: 180 },
  { field: 'status', width: 125 },
  { field: 'pricingStrategy', width: 145 },
  { field: 'total', type: 'numericColumn', width: 120 },
  { field: 'internalMargin', headerName: 'Internal margin', type: 'numericColumn', width: 145 },
  { field: 'lines', width: 95 },
  { field: 'deliveryWindow', editable: true, minWidth: 180 }
];

const suggestionColumns: ColDef<GridRow>[] = [
  { field: 'batchCode', pinned: 'left', width: 150 },
  { field: 'name', minWidth: 180 },
  { field: 'category', width: 110 },
  { field: 'vendor', width: 150 },
  { field: 'availableQty', type: 'numericColumn', width: 130 },
  { field: 'unitPrice', type: 'numericColumn', width: 110 },
  { field: 'unitCost', type: 'numericColumn', width: 110 },
  { field: 'estimatedMargin', type: 'numericColumn', width: 150 },
  { field: 'tags', minWidth: 140 },
  { field: 'reason', minWidth: 260 }
];

const lineColumns: ColDef<GridRow>[] = [
  { field: 'legacyStatusMarker', headerName: 'Raw', editable: true, width: 90, pinned: 'left' },
  {
    field: 'displayName',
    headerName: 'Customer label',
    editable: false,
    minWidth: 190,
    pinned: 'left',
    cellRenderer: (params: { value: unknown; data: GridRow }) => {
      const fallback = params.value ?? params.data?.itemName ?? '';
      return (
        <span>
          {params.data?.itemAlias ? (
            <span title="Customer-facing alias" style={{ color: '#eab308', marginRight: 4 }}>
              ●
            </span>
          ) : null}
          {String(fallback)}
        </span>
      );
    }
  },
  { field: 'itemName', headerName: 'Canonical', editable: true, minWidth: 170 },
  { field: 'batchCode', headerName: 'Source', width: 140 },
  { field: 'unresolvedSourceText', headerName: 'Unresolved source', editable: true, minWidth: 170 },
  { field: 'qty', editable: true, type: 'numericColumn', width: 95 },
  { field: 'unitPrice', editable: true, type: 'numericColumn', width: 115 },
  { field: 'unitCost', headerName: 'Cost', type: 'numericColumn', width: 105 },
  { field: 'availableQty', headerName: 'Avail', type: 'numericColumn', width: 105 },
  { field: 'packed', editable: true, width: 105 },
  { field: 'inventoryPosted', headerName: 'Inv Posted', editable: true, width: 125 },
  { field: 'paymentFollowup', headerName: 'Pay/F-up', editable: true, width: 125 },
  { field: 'validationIssues', headerName: 'Fix', minWidth: 220 },
  { field: 'status', width: 115 }
];

const EMPTY_ROWS: GridRow[] = [];

function moneyish(value: unknown) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
}

export function SalesView() {
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const selectedSalesRows = useUiStore((state) => state.selectedRows.sales);
  const selectedOrders = selectedSalesRows ?? EMPTY_ROWS;
  const [customerId, setCustomerId] = useState('');
  const [selectedSuggestions, setSelectedSuggestions] = useState<GridRow[]>([]);
  const [selectedLines, setSelectedLines] = useState<GridRow[]>([]);
  const [sheetMode, setSheetMode] = useState<'internal' | 'catalog'>('internal');
  const [draftItem, setDraftItem] = useState('');
  const [draftQty, setDraftQty] = useState('1');
  const [addedBatchIds, setAddedBatchIds] = useState<Set<string>>(new Set());
  const [saleToolsOpen, setSaleToolsOpen] = useState(false);
  const [autoStartedCustomerIds, setAutoStartedCustomerIds] = useState<Set<string>>(new Set());
  const customerSelectRef = useRef<HTMLSelectElement | null>(null);
  const activeCustomerId = useUiStore((state) => state.activeCustomerId);
  const activeQuickLaunch = useUiStore((state) => state.activeQuickLaunch);
  const setActiveCustomerId = useUiStore((state) => state.setActiveCustomerId);
  const salesRequestText = useUiStore((state) => state.salesRequestText);
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const orders = trpc.queries.grid.useQuery({ view: 'sales' });
  const reference = trpc.queries.reference.useQuery();
  const workspace = trpc.queries.customerWorkspace.useQuery({ customerId: customerId || '00000000-0000-0000-0000-000000000000' }, { enabled: Boolean(customerId) });
  const suggestions = trpc.queries.salesSuggestions.useQuery({
    customerId: customerId || undefined
  });
  const { runCommand, isRunning } = useCommandRunner();
  const workspaceOrder = workspace.data?.orders.find((order) => ['draft', 'confirmed'].includes(String(order.status))) ?? workspace.data?.orders[0];
  const selectedOrder = selectedOrders[0] ?? workspaceOrder;
  const orderLines = trpc.queries.salesOrderLines.useQuery({ orderId: String(selectedOrder?.id ?? '00000000-0000-0000-0000-000000000000') }, { enabled: Boolean(selectedOrder?.id) });
  const selectedOrderStatus = String(selectedOrder?.status ?? '');

  const sheetRows = useMemo(() => selectedSuggestions.slice(0, 8), [selectedSuggestions]);

  const salesOrderExpansionConfig = useMemo(
    () => ({
      enabled: true,
      actionsRenderer: (row: GridRow) => (
        <>
          <button
            className="primary-button compact-action"
            disabled={isRunning || String(row.status ?? '') !== 'draft'}
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('confirmSalesOrder', { orderId: row.id }, 'Confirm sales order');
            }}
            type="button"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            Confirm order
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || String(row.status ?? '') !== 'confirmed'}
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('reserveInventoryForOrder', { orderId: row.id }, 'Reserve exact inventory for order');
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Reserve inventory
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning || ['fulfilled', 'shipped', 'cancelled'].includes(String(row.status ?? ''))}
            onClick={() => {
              if (!row.id || row.id.trim() === '') return;
              runCommand('cancelSalesOrder', { orderId: row.id }, 'Cancel sales order');
            }}
            type="button"
          >
            Cancel order
          </button>
        </>
      )
    }),
    [isRunning, runCommand]
  );

  const salesLineExpansionConfig = useMemo(
    () => ({
      enabled: true,
      actionsRenderer: (row: GridRow) => (
        <>
          <button
            className="secondary-button compact-action"
            disabled={isRunning}
            onClick={async () => {
              if (!row.id || row.id.trim() === '') return;
              await runCommand('updateSalesOrderLine', { lineId: row.id, packed: true }, 'Pack line');
              await orderLines.refetch();
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Pack
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning}
            onClick={async () => {
              if (!row.id || row.id.trim() === '') return;
              await runCommand('updateSalesOrderLine', { lineId: row.id, inventoryPosted: true }, 'Post to inventory');
              await orderLines.refetch();
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Post inv
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning}
            onClick={async () => {
              if (!row.id || row.id.trim() === '') return;
              await runCommand('updateSalesOrderLine', { lineId: row.id, paymentFollowup: true }, 'Payment follow-up');
              await orderLines.refetch();
            }}
            type="button"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Pay F-up
          </button>
          <button
            className="secondary-button compact-action"
            disabled={isRunning}
            onClick={async () => {
              if (!row.id || row.id.trim() === '') return;
              await runCommand('removeSalesOrderLine', { lineId: row.id }, 'Remove line');
              await orderLines.refetch();
            }}
            type="button"
          >
            Remove
          </button>
        </>
      )
    }),
    [isRunning, runCommand, orderLines]
  );

  useEffect(() => {
    if (activeCustomerId && activeCustomerId !== customerId) setCustomerId(activeCustomerId);
  }, [activeCustomerId, customerId]);

  useEffect(() => {
    if (salesRequestText && !draftItem) setDraftItem(salesRequestText);
  }, [draftItem, salesRequestText]);

  useEffect(() => {
    if (activeQuickLaunch === 'sale' && !customerId) customerSelectRef.current?.focus();
  }, [activeQuickLaunch, customerId]);

  useEffect(() => {
    if (!customerId || !canWrite || workspace.isFetching || workspaceOrder || autoStartedCustomerIds.has(customerId)) return;
    setAutoStartedCustomerIds((current) => new Set(current).add(customerId));
    void runCommand('createSalesOrder', { customerId }, 'Auto-start customer sale workspace').then((result) => {
      if (result.ok) {
        setActiveCustomerId(customerId);
        void workspace.refetch();
      }
    });
  }, [autoStartedCustomerIds, canWrite, customerId, runCommand, setActiveCustomerId, workspace, workspace.isFetching, workspaceOrder]);

  async function createOrder() {
    if (!customerId) return;
    const result = await runCommand('createSalesOrder', { customerId }, 'Create customer-aware order from sales view');
    if (result.ok) setActiveCustomerId(customerId);
  }

  async function addSuggestion() {
    if (!selectedOrder || !selectedSuggestions[0]) return;
    await runCommand('addSalesOrderLine', { orderId: selectedOrder.id, batchId: selectedSuggestions[0].id, qty: 1, sourceRowKey: selectedSuggestions[0].batchCode }, 'Add suggested inventory to order');
    setAddedBatchIds((current) => new Set(current).add(selectedSuggestions[0].id));
  }

  async function addFinderBatch(batch: InventoryFinderBatch, qty: number) {
    if (!selectedOrder) return;
    await runCommand(
      'addSalesOrderLine',
      {
        orderId: selectedOrder.id,
        batchId: batch.id,
        qty,
        unitPrice: batch.unitPrice,
        sourceRowKey: batch.batchCode
      },
      'Add inventory finder row to order'
    );
    setAddedBatchIds((current) => new Set(current).add(batch.id));
  }

  async function priceAndConfirm() {
    if (!selectedOrder) return;
    await runCommand('priceSalesOrder', { orderId: selectedOrder.id, strategy: 'standard' }, 'Sales view pricing preview');
    await runCommand('confirmSalesOrder', { orderId: selectedOrder.id }, 'Confirm sales order');
  }

  async function runSalesPrimary() {
    if (!selectedOrder) {
      await createOrder();
      return;
    }
    if (selectedOrderStatus === 'confirmed') {
      await reserveOrder();
      return;
    }
    await priceAndConfirm();
  }

  async function reserveOrder() {
    if (!selectedOrder) return;
    await runCommand('reserveInventoryForOrder', { orderId: selectedOrder.id }, 'Reserve exact inventory for order');
    await orderLines.refetch();
  }

  async function removeSelectedLines() {
    for (const line of selectedLines) await runCommand('removeSalesOrderLine', { lineId: line.id }, 'Remove selected sales line');
    await orderLines.refetch();
  }

  async function addDraftLine() {
    if (!selectedOrder || !draftItem.trim()) return;
    await runCommand(
      'addSalesOrderLine',
      {
        orderId: selectedOrder.id,
        itemName: draftItem,
        unresolvedSourceText: draftItem,
        qty: Number(draftQty) || 1,
        unitPrice: 0,
        legacyStatusMarker: ''
      },
      'Add unresolved customer workspace line'
    );
    setDraftItem('');
    setDraftQty('1');
    await orderLines.refetch();
  }

  async function onLineCommit(event: CellValueChangedEvent<GridRow>) {
    if (!event.data?.id || event.colDef.field == null || event.oldValue === event.newValue) return;
    await runCommand('updateSalesOrderLine', { lineId: event.data.id, [event.colDef.field]: event.newValue }, `Inline sales line edit: ${event.colDef.field}`);
    await orderLines.refetch();
  }

  async function toggleLine(field: 'packed' | 'inventoryPosted' | 'paymentFollowup', value: boolean) {
    for (const line of selectedLines) await runCommand('updateSalesOrderLine', { lineId: line.id, [field]: value }, `Toggle ${field} from customer workspace`);
    await orderLines.refetch();
  }

  function exportSheet() {
    const headers = sheetMode === 'internal' ? ['batchCode', 'name', 'category', 'vendor', 'availableQty', 'unitPrice', 'unitCost', 'estimatedMargin', 'reason'] : ['batchCode', 'name', 'category', 'availableQty', 'unitPrice', 'tags'];
    const csv = [headers.join(','), ...sheetRows.map((row) => headers.map((header) => csvValue(row[header])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = sheetMode === 'internal' ? 'terp-agro-sales-sheet.csv' : 'terp-agro-sales-catalog.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="view-stack">
      {canWrite ? <div className="control-band">
        <label className="field-inline">
          Customer
          <select
            ref={customerSelectRef}
            className="select"
            value={customerId}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setActiveCustomerId(event.target.value || null);
            }}
          >
            <option value="">Choose customer</option>
            {reference.data?.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="button" disabled={(!selectedOrder && !customerId) || isOrderTerminal(selectedOrderStatus)} onClick={runSalesPrimary}>
          <Send className="h-4 w-4" aria-hidden="true" />
          {salesPrimaryLabel(selectedOrderStatus, Boolean(selectedOrder))}
        </button>
        <span className="selection-pill">{selectedOrder ? `${String(selectedOrder.orderNo ?? 'Selected sale')} / ${selectedOrderStatus || 'open'}` : customerId ? 'Sale shell starting' : 'Pick customer to start'}</span>
        <button className="secondary-button compact-action" type="button" onClick={() => setSaleToolsOpen((value) => !value)} aria-expanded={saleToolsOpen}>
          {saleToolsOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          Sale tray
        </button>
      </div> : null}
      {canWrite && saleToolsOpen ? (
        <div className="control-band subtle-band">
          <button className="secondary-button compact-action" type="button" disabled={!selectedOrder || !selectedSuggestions.length} onClick={addSuggestion}>
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Add suggestion
          </button>
          <button className="secondary-button compact-action" type="button" disabled={!selectedOrder} onClick={reserveOrder}>
            Reserve
          </button>
          <button className="secondary-button compact-action" type="button" onClick={() => setSheetMode(sheetMode === 'internal' ? 'catalog' : 'internal')}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            {sheetMode === 'internal' ? 'Sales Sheet' : 'Sales Catalog'}
          </button>
          <button className="secondary-button compact-action" type="button" disabled={!sheetRows.length} onClick={exportSheet}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Export
          </button>
          <span className="selection-pill success">Customer catalog hides cost, margin, and internal notes.</span>
        </div>
      ) : null}
      {customerId ? (
        <WorkspacePanel panelId="sales:customer-workspace" title="Customer Workspace" contentClassName="p-3">
          <div className="customer-workspace-header">
            <div>
              <div className="text-lg font-semibold text-ink">{workspace.data?.customer?.name ?? 'Customer'}</div>
              <div className="text-sm text-zinc-600">{workspace.data?.customer?.notes ?? 'No notes yet.'}</div>
            </div>
            <div className="customer-facts">
              <span>Balance ${moneyish(workspace.data?.customer?.balance)}</span>
              <span>Credit ${moneyish(workspace.data?.customer?.creditLimit)}</span>
              <span>{(workspace.data?.customer?.tags ?? []).join(', ')}</span>
            </div>
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-3">
              {canWrite ? <div className="control-band subtle-band">
                <label className="field-inline grow">
                  Request / item
                  <input className="input" value={draftItem} placeholder="Type item, source code, note, or shorthand" onChange={(event) => setDraftItem(event.target.value)} onKeyDown={(event) => {
                    if (event.key === 'Enter') void addDraftLine();
                  }} />
                </label>
                <label className="field-inline">
                  Qty
                  <input className="input compact" value={draftQty} inputMode="decimal" onChange={(event) => setDraftQty(event.target.value)} />
                </label>
                <button className="primary-button" type="button" disabled={!selectedOrder || !draftItem.trim()} onClick={addDraftLine}>
                  Add sale line
                </button>
                {orderLines.data?.length ? <button className="secondary-button" type="button" onClick={() => exportCustomerOffer(orderLines.data ?? [])}>
                  Copy/export customer offer
                </button> : null}
              </div> : null}
              <OperatorGrid
                view="sales"
                title="Customer Draft Lines"
                rows={(orderLines.data ?? []) as GridRow[]}
                columns={lineColumns}
                loading={false}
                onSelectionChange={setSelectedLines}
                onCellCommit={canWrite ? onLineCommit : undefined}
                emptyTitle="No sale lines yet"
                emptyChildren="Use Inventory Finder to add posted batches, or type a request above and press Enter."
                selectionActions={(rows) => (
                  <>
                    <button className="secondary-button compact-action" type="button" disabled={!rows.length} onClick={() => toggleLine('packed', true)}>Packed</button>
                    <button className="secondary-button compact-action" type="button" disabled={!rows.length} onClick={() => toggleLine('inventoryPosted', true)}>Inv posted</button>
                    <button className="secondary-button compact-action" type="button" disabled={!rows.length} onClick={() => toggleLine('paymentFollowup', true)}>Pay/F-up</button>
                    <button className="secondary-button compact-action" type="button" disabled={!rows.length} onClick={removeSelectedLines}>Remove</button>
                    <button className="secondary-button compact-action" type="button" disabled={!selectedOrder} onClick={reserveOrder}>Reserve</button>
                  </>
                )}
                expansionConfig={canWrite ? salesLineExpansionConfig : undefined}
              />
            </div>
            <div className="grid gap-2 text-sm">
              <div className="section-title">Recent customer context</div>
              {(workspace.data?.orders ?? []).slice(0, 4).map((order) => (
                <div className="activity-row" key={order.id}>
                  <span>{order.orderNo}</span>
                  <span>{order.status}</span>
                  <span>${moneyish(order.total)}</span>
                </div>
              ))}
              {(workspace.data?.invoices ?? []).slice(0, 4).map((invoice) => (
                <div className="activity-row" key={invoice.id}>
                  <span>{invoice.invoiceNo}</span>
                  <span>{invoice.status}</span>
                  <span>${moneyish(Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0))} open</span>
                </div>
              ))}
            </div>
          </div>
        </WorkspacePanel>
      ) : null}
      <div className="grid min-h-[420px] grid-cols-1 gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <OperatorGrid
          view="sales"
        title="Sales Orders"
        rows={(orders.data ?? []) as GridRow[]}
        columns={orderColumns}
        loading={orders.isLoading && !customerId}
        onSelectionChange={(selection) => setSelectedRows('sales', selection)}
        emptyTitle="No open sales shown"
        emptyChildren={customerId ? 'No lines yet.' : 'Choose a customer to start.'}
        expansionConfig={canWrite ? salesOrderExpansionConfig : undefined}
      />
        <InventoryFinderPanel selectedOrderId={canWrite ? String(selectedOrder?.id ?? '') : ''} focusKey={customerId} addedBatchIds={addedBatchIds} initialSearch={salesRequestText} onAddBatch={addFinderBatch} />
      </div>
      {customerId ? <div className="min-h-[340px]">
        <OperatorGrid
          view="sales"
          title="Smart Suggestions / Buyer Fit"
          rows={(suggestions.data ?? []) as GridRow[]}
          columns={suggestionColumns}
          loading={suggestions.isLoading}
          onSelectionChange={setSelectedSuggestions}
        />
      </div> : null}
      {sheetRows.length ? <WorkspacePanel panelId="sales:sheet-preview" title={sheetMode === 'internal' ? 'Internal Sales Sheet' : 'Customer Sales Catalog'} contentClassName="p-3">
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {sheetRows.map((row) => (
            <div key={row.id} className="border border-line p-3 text-sm">
              <div className="font-semibold text-ink">{String(row.name)}</div>
              <div className="text-zinc-600">{String(row.category)} · {String(row.availableQty)} available</div>
              <div className="mt-2 font-medium">${String(row.unitPrice)}</div>
              {sheetMode === 'internal' ? <div className="text-xs text-zinc-500">Cost ${String(row.unitCost)} · margin ${String(row.estimatedMargin)}</div> : null}
              {sheetMode === 'internal' ? <div className="text-xs text-zinc-500">{String(row.reason)}</div> : null}
            </div>
          ))}
        </div>
      </WorkspacePanel> : null}
    </div>
  );
}

function csvValue(value: unknown) {
  const raw = value == null ? '' : Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function exportCustomerOffer(rows: GridRow[]) {
  const headers = ['itemName', 'qty', 'unitPrice', 'sourceRowKey'];
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'terp-agro-customer-offer.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function salesPrimaryLabel(status: string, hasOrder: boolean) {
  if (!hasOrder) return 'Start';
  if (status === 'confirmed') return 'Reserve';
  if (status === 'posted') return 'Posted';
  if (status === 'cancelled') return 'Cancelled';
  return 'Price + Confirm';
}

function isOrderTerminal(status: string) {
  return ['posted', 'cancelled', 'fulfilled'].includes(status);
}
