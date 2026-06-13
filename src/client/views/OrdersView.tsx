import { Check, FileDown, ListChecks, PackageCheck, Receipt, Send, Truck, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { crossOrderSourceColumn } from '../components/CrossOrderSourceChip';
import { OperatorGrid } from '../components/OperatorGrid';
import { FilterPresetStrip, StatusActionBar, type StatusActionTable } from '../components/templates';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { columnsByView, EMPTY_ROWS } from './operations/shared';

// UX-G04: Orders → Invoice cross-link inspector tab.
// Shows invoice summary from the order row's `invoiceNo` / `invoiceStatus` /
// `total` / `amountPaid` fields (already present in the orders grid payload)
// and provides a "View in Payments" deep-link that navigates to PaymentsView
// with a filter on this customer's payment context.
function OrderInvoiceTab({ row }: { row: GridRow }) {
  const navigate = useNavigate();
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const invoiceNo = String(row.invoiceNo ?? '');
  const invoiceStatus = String(row.invoiceStatus ?? '');
  const customerId = String(row.customerId ?? '');
  const total = Number(row.total ?? 0);
  const amountPaid = Number(row.amountPaid ?? 0);
  const balance = total - amountPaid;

  if (!invoiceNo) {
    return (
      <div className="p-3 text-sm text-zinc-500">
        No invoice linked yet. Post the order to generate an invoice.
      </div>
    );
  }

  function goToPayments() {
    if (customerId) {
      setGridFilter('payments', `customerId:${customerId}`);
    }
    setActiveView('payments');
    navigate('/payments');
  }

  const statusBadge =
    invoiceStatus === 'paid'
      ? 'bg-emerald-100 text-emerald-800'
      : invoiceStatus === 'partial'
      ? 'bg-amber-100 text-amber-800'
      : invoiceStatus === 'open'
      ? 'bg-blue-100 text-blue-800'
      : 'bg-zinc-100 text-zinc-600';

  return (
    <div className="p-3 space-y-3 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <dt className="text-zinc-500">Invoice</dt>
        <dd className="font-mono font-medium">{invoiceNo}</dd>
        <dt className="text-zinc-500">Status</dt>
        <dd>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge}`}>
            {invoiceStatus || '—'}
          </span>
        </dd>
        <dt className="text-zinc-500">Total</dt>
        <dd>${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd>
        <dt className="text-zinc-500">Paid</dt>
        <dd>${amountPaid.toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd>
        {balance > 0 ? (
          <>
            <dt className="text-zinc-500">Balance due</dt>
            <dd className="text-amber-700 font-medium">${balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd>
          </>
        ) : null}
      </dl>
      <button
        type="button"
        className="secondary-button compact-action"
        onClick={goToPayments}
        title="View all payments for this customer in the Payments view"
      >
        <Receipt className="h-4 w-4" aria-hidden="true" />
        View in Payments
      </button>
    </div>
  );
}

// UX-D01: deep-link helper — navigate to the orders view filtered to a specific
// order row and open its drawer. Mirrors the CountPill pattern (TER-1624/E01).
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

export function OrdersView() {
  const grid = trpc.queries.grid.useQuery({ view: 'orders' });
  const reference = trpc.queries.reference.useQuery();
  const selectedRows = useUiStore((state) => state.selectedRows.orders);
  const selected = selectedRows ?? EMPTY_ROWS;
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const { runCommand, setNextSuccessActions, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const [refereeRelationshipId, setRefereeRelationshipId] = useState('');
  const selectedOrder = selected[0];
  const customerId = String(selectedOrder?.customerId ?? '');
  // UX-D01: deep-link used for success-toast "View order" actions
  const openOrderDeepLink = useOrderDeepLink();

  async function handlePostOrder() {
    if (!selectedOrder) return;
    const orderId = String(selectedOrder.id ?? '');
    const payload: Record<string, unknown> = { orderId: selectedOrder.id };
    if (refereeRelationshipId) {
      payload.refereeRelationshipId = refereeRelationshipId;
      payload.logRefereeCredit = true;
    }
    // UX-D01: success toast deep-links back to this order in Orders view.
    setNextSuccessActions?.([{ label: 'View order', onAction: () => openOrderDeepLink(orderId) }]);
    await runCommand('postSalesOrder', payload, 'Post selected order');
    setRefereeRelationshipId('');
  }

  function onCellCommit(event: CellValueChangedEvent<GridRow>) {
    // GH #291: In the orders grid, each row represents a sales_order and row.id
    // is the sales order UUID. Explicitly bind it as `orderId` so the field
    // mapping to the command handlers is unambiguous.
    const orderId: string | undefined = event.data?.id;
    if (!orderId || event.colDef.field == null || event.oldValue === event.newValue) return;
    if (event.colDef.field === 'deliveryWindow') {
      // setDeliveryWindow expects { orderId } — matches sales order UUID.
      runCommand('setDeliveryWindow', { orderId, deliveryWindow: event.newValue }, 'Inline delivery window edit');
      return;
    }
    if (['notes', 'packed', 'inventoryPosted', 'paymentFollowup'].includes(String(event.colDef.field))) {
      // updateSalesOrderLine with orderId (no lineId) updates the order header +
      // propagates to all of its lines via the handler's orderId branch.
      runCommand('updateSalesOrderLine', { orderId, [String(event.colDef.field)]: event.newValue }, `Inline order closeout edit: ${event.colDef.field}`);
    }
  }

  const customerRelationships = (reference.data?.refereeRelationships ?? [])
    .filter((rel: any) => rel.entityType === 'customer' && rel.entityId === customerId);

  // UX-G02 — append the shared-source pre-check chip column right after the
  // status column. Data comes from the orders grid payload's
  // crossOrderSourceOrders allowlist field (see queries.ts orders case); the
  // chip is informational only and renders solely on open (draft/confirmed)
  // rows — the server's post-time refusals are unchanged.
  //
  // UX-G05: add a hidden derived `needsMarks` column whose valueGetter returns
  // true when the order is posted but has at least one closeout mark missing
  // (packed, inventoryPosted, or paymentFollowup). The "Needs marks" FilterPresetStrip
  // preset filters on `needsMarks:true`. The column is hidden by default since the
  // visual closeout columns (packed/inventoryPosted/paymentFollowup) already convey
  // the same information per-field; `needsMarks` provides a single compound token
  // for the preset filter since applyGridFilter only handles AND between fields.
  const ordersColumns = useMemo<ColDef<GridRow>[]>(() => {
    const base = columnsByView.orders ?? [];
    const statusIndex = base.findIndex((col) => col.field === 'status');
    const withSource = statusIndex === -1
      ? [...base, crossOrderSourceColumn]
      : [...base.slice(0, statusIndex + 1), crossOrderSourceColumn, ...base.slice(statusIndex + 1)];
    const needsMarksCol: ColDef<GridRow> = {
      field: 'needsMarks',
      headerName: 'Needs marks',
      hide: true,
      width: 120,
      valueGetter: (params) => {
        const d = params.data;
        if (!d || d.status !== 'posted') return false;
        const flag = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';
        return !flag(d.packed) || !flag(d.inventoryPosted) || !flag(d.paymentFollowup);
      }
    };
    return [...withSource, needsMarksCol];
  }, []);

  // Spec §10.4 — status-aware primary decision table for Orders. Every verb
  // from the former always-on cockpit (Ready, Post, Reprice, Fulfillment,
  // Pick list, Cancel) remains reachable: it is either the primary for its
  // status or lives in the tray; the catch-all rule keeps the full verb set
  // available for mixed/unknown selections (no functionality loss).
  const act = {
    // UX-D01: "View order" action on success toast deep-links back here.
    confirm: { key: 'confirm', label: 'Confirm', icon: <Check className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => {
      const orderId = String(rows[0].id ?? '');
      setNextSuccessActions?.([{ label: 'View order', onAction: () => openOrderDeepLink(orderId) }]);
      return runCommand('confirmSalesOrder', { orderId: rows[0].id }, 'Mark selected order Ready/Confirmed');
    }},
    post: { key: 'post', label: 'Post', icon: <Send className="h-4 w-4" aria-hidden="true" />, run: () => handlePostOrder() },
    reprice: { key: 'reprice', label: 'Reprice', icon: <FileDown className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => runCommand('repriceOrder', { orderId: rows[0].id, strategy: 'clearance' }, 'Reprice selected order') },
    fulfillment: { key: 'fulfillment', label: 'Allocate fulfillment', icon: <Truck className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => runCommand('allocateOrderToFulfillment', { orderId: rows[0].id }, 'Allocate order to fulfillment') },
    pickList: { key: 'pickList', label: 'Pick list', icon: <ListChecks className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => runCommand('createPickList', { orderId: rows[0].id }, 'Create pick list for selected order') },
    cancel: { key: 'cancel', label: 'Cancel order', icon: <Undo2 className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => runCommand('cancelSalesOrder', { orderId: rows[0].id }, 'Cancel selected order') },
    markCloseout: (field: 'packed' | 'inventoryPosted' | 'paymentFollowup', label: string) => ({
      key: `mark-${field}`,
      label,
      icon: <PackageCheck className="h-4 w-4" aria-hidden="true" />,
      run: (rows: GridRow[]) => runCommand('updateSalesOrderLine', { orderId: rows[0].id, [field]: true }, `Mark order ${label.toLowerCase()}`)
    })
  };
  const flag = (value: unknown) => value === true || value === 'true' || value === 1 || value === '1';
  const ordersActionTable: StatusActionTable = {
    rules: [
      { when: 'draft', primary: act.confirm, tray: [act.reprice, act.cancel] },
      { when: 'confirmed', primary: act.post, tray: [act.reprice, act.fulfillment, act.pickList, act.cancel] },
      { when: (row) => row.status === 'posted' && !flag(row.packed), primary: act.markCloseout('packed', 'Mark packed'), tray: [act.fulfillment, act.pickList, act.reprice] },
      { when: (row) => row.status === 'posted' && flag(row.packed) && !flag(row.inventoryPosted), primary: act.markCloseout('inventoryPosted', 'Mark inv-posted'), tray: [act.fulfillment, act.pickList] },
      { when: (row) => row.status === 'posted' && flag(row.packed) && flag(row.inventoryPosted) && !flag(row.paymentFollowup), primary: act.markCloseout('paymentFollowup', 'Mark pay/f-up'), tray: [act.pickList] },
      { when: 'posted', primary: null, tray: [act.pickList, act.fulfillment] },
      { when: 'fulfilled', primary: null, tray: [act.pickList] },
      // Catch-all: mixed or unrecognized statuses keep every verb reachable.
      { when: () => true, primary: null, tray: [act.confirm, act.post, act.reprice, act.fulfillment, act.pickList, act.cancel] }
    ]
  };

  return (
    <div className="view-stack">
      {canWrite && selectedOrder && customerRelationships.length > 0 ? (
        <div className="control-band subtle-band">
          <label className="field-inline">
            Referee credit (optional)
            <select className="select" value={refereeRelationshipId} onChange={(e) => setRefereeRelationshipId(e.target.value)}>
              <option value="">No referee credit</option>
              {customerRelationships.map((rel: any) => (
                <option key={rel.id} value={rel.id}>
                  {rel.refereeName} ({rel.feeType === 'percentage' ? `${rel.feePercentage}%` : rel.feeType === 'fixed' ? `$${rel.feeFixedAmount}` : `${rel.feePercentage}% + $${rel.feeFixedAmount}`})
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <OperatorGrid
        view="orders"
        title="Orders"
        rows={(grid.data ?? []) as GridRow[]}
        columns={ordersColumns}
        loading={grid.isLoading}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => setSelectedRows('orders', rows)}
        onCellCommit={canWrite ? onCellCommit : undefined}
        // UX-G04: invoice context tab in the row inspector (orders→payments direction).
        // Uses invoiceNo/invoiceStatus/total/amountPaid from the grid row payload
        // (already included in the orders grid query). No new tRPC procedure needed.
        inspectorTabs={(row) =>
          row.invoiceNo
            ? [
                {
                  key: 'invoice',
                  label: 'Invoice',
                  icon: <Receipt className="h-3.5 w-3.5" aria-hidden="true" />,
                  render: () => <OrderInvoiceTab row={row} />
                }
              ]
            : []
        }
        // UX-D03: tailored empty state names the producing verb + surface.
        emptyTitle="No orders — post a sale to create an order"
        emptyChildren="Confirmed sales orders appear here. Go to Sales to create a sale and confirm it."
        actions={canWrite ? (
          /* GH #354 presets, now via the shared template */
          <FilterPresetStrip
            view="orders"
            ariaLabel="Filter by status"
            presets={[
              { label: 'All Open', filter: 'status:draft,confirmed' },
              { label: 'Confirmed', filter: 'status:confirmed' },
              { key: 'today', label: 'Today', filter: () => `createdAt:${new Date().toISOString().slice(0, 10)}` },
              // UX-G05: "Needs marks" — posted orders with any closeout mark missing.
              // Uses the derived `needsMarks` column (hidden, valueGetter) so the
              // single-token applyGridFilter matches correctly.
              { label: 'Needs marks', filter: 'needsMarks:true', title: 'Posted orders with packed / inv-posted / pay-followup not yet marked' }
            ]}
          />
        ) : null}
        selectionActions={canWrite ? (rows) => (
          /* Spec §10.4 — status-aware primary + tray in the selection strip */
          <StatusActionBar rows={rows} table={ordersActionTable} busy={isRunning} />
        ) : undefined}
      />
    </div>
  );
}
