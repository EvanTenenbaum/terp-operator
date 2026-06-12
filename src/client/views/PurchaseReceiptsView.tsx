import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { columnsByView, EMPTY_ROWS, moneyish } from './operations/shared';

const purchaseReceiptLineColumns: ColDef<GridRow>[] = [
  { field: 'itemName', headerName: 'Product', pinned: 'left', minWidth: 190 },
  { field: 'batchCode', width: 140 },
  { field: 'qty', headerName: 'Qty', type: 'numericColumn', width: 120 },
  { field: 'unitCost', headerName: 'Unit cost', type: 'numericColumn', width: 120 },
  { field: 'subtotal', headerName: 'Subtotal', type: 'numericColumn', width: 120 }
];

export function PurchaseReceiptsView() {
  const grid = trpc.queries.grid.useQuery({ view: 'purchaseReceipts' });
  const selectedRows = useUiStore((state) => state.selectedRows.purchaseReceipts);
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedReceipt = selected[0];
  const lines = trpc.queries.purchaseReceiptLines.useQuery(
    { purchaseReceiptId: String(selectedReceipt?.id ?? '00000000-0000-0000-0000-000000000000') },
    { enabled: Boolean(selectedReceipt?.id) }
  );
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);

  return (
    <div className="view-stack">
      {/* UX-D03: tailored empty state names the producing verb + surface. */}
      <OperatorGrid
        view="purchaseReceipts"
        title="Purchase Receipts"
        rows={(grid.data ?? []) as GridRow[]}
        columns={columnsByView.purchaseReceipts ?? []}
        loading={grid.isLoading}
        isError={grid.isError}
        onRetry={() => grid.refetch()}
        onSelectionChange={(rows) => setSelectedRows('purchaseReceipts', rows)}
        emptyTitle="No purchase receipts — post an intake batch to create a receipt"
        emptyChildren="Receipts are created when you post an intake batch in the Intake view. Each posted batch generates a receipt linked to its purchase order."
      />
      {selectedReceipt ? (
        <>
          <section className="po-header-strip" aria-label="Selected receipt summary">
            <div>
              <div className="text-xs font-bold uppercase text-zinc-500">Selected Receipt</div>
              <div className="text-base font-semibold text-ink">{String(selectedReceipt.receiptNo ?? 'Purchase receipt')}</div>
            </div>
            <div className="po-header-facts">
              <span>{String(selectedReceipt.vendor ?? 'Vendor')}</span>
              <span>PO {String(selectedReceipt.poNo ?? '-')}</span>
              <span>{String(selectedReceipt.status ?? 'posted')}</span>
              <span>${moneyish(selectedReceipt.total)}</span>
            </div>
          </section>
          <OperatorGrid
            view="purchaseReceipts"
            title={`Receipt ${String(selectedReceipt.receiptNo ?? '')} Lines`}
            subtitle="Received line items"
            rows={(lines.data ?? []) as GridRow[]}
            columns={purchaseReceiptLineColumns}
            loading={lines.isLoading}
          />
        </>
      ) : null}
    </div>
  );
}
