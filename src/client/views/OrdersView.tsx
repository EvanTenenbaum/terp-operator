import { Check, FileDown, ListChecks, PackageCheck, Send, Truck, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { CellValueChangedEvent } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { FilterPresetStrip, StatusActionBar, type StatusActionTable } from '../components/templates';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { columnsByView, EMPTY_ROWS } from './operations/shared';

export function OrdersView() {
  const grid = trpc.queries.grid.useQuery({ view: 'orders' });
  const reference = trpc.queries.reference.useQuery();
  const selectedRows = useUiStore((state) => state.selectedRows.orders);
  const selected = selectedRows ?? EMPTY_ROWS;
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const canWrite = me.data?.role !== 'viewer';
  const [refereeRelationshipId, setRefereeRelationshipId] = useState('');
  const selectedOrder = selected[0];
  const customerId = String(selectedOrder?.customerId ?? '');

  async function handlePostOrder() {
    if (!selectedOrder) return;
    const payload: Record<string, unknown> = { orderId: selectedOrder.id };
    if (refereeRelationshipId) {
      payload.refereeRelationshipId = refereeRelationshipId;
      payload.logRefereeCredit = true;
    }
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

  // Spec §10.4 — status-aware primary decision table for Orders. Every verb
  // from the former always-on cockpit (Ready, Post, Reprice, Fulfillment,
  // Pick list, Cancel) remains reachable: it is either the primary for its
  // status or lives in the tray; the catch-all rule keeps the full verb set
  // available for mixed/unknown selections (no functionality loss).
  const act = {
    confirm: { key: 'confirm', label: 'Confirm', icon: <Check className="h-4 w-4" aria-hidden="true" />, run: (rows: GridRow[]) => runCommand('confirmSalesOrder', { orderId: rows[0].id }, 'Mark selected order Ready/Confirmed') },
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
        columns={columnsByView.orders ?? []}
        loading={grid.isLoading}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => setSelectedRows('orders', rows)}
        onCellCommit={canWrite ? onCellCommit : undefined}
        actions={canWrite ? (
          /* GH #354 presets, now via the shared template */
          <FilterPresetStrip
            view="orders"
            ariaLabel="Filter by status"
            presets={[
              { label: 'All Open', filter: 'status:draft,confirmed' },
              { label: 'Confirmed', filter: 'status:confirmed' },
              { key: 'today', label: 'Today', filter: () => `createdAt:${new Date().toISOString().slice(0, 10)}` }
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
