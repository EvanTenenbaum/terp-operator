import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { GridView } from '../templates/GridView';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';
import { EMPTY_ROWS, moneyish } from './operations/shared';

const purchaseReceiptLineColumns: ColDef<GridRow>[] = [
  { field: 'itemName', headerName: 'Product', pinned: 'left', minWidth: 190 },
  { field: 'batchCode', width: 140 },
  { field: 'qty', headerName: 'Qty', type: 'numericColumn', width: 120 },
  { field: 'unitCost', headerName: 'Unit cost', type: 'numericColumn', width: 120 },
  { field: 'subtotal', headerName: 'Subtotal', type: 'numericColumn', width: 120 }
];

/** Preserved ref to keep TS happy with unused but retained domain-specific import. */
void (OperatorGrid as unknown);

export function PurchaseReceiptsView() {
  const selectedRows = useUiStore((state) => state.selectedRows.purchaseReceipts);
  const selected = selectedRows ?? EMPTY_ROWS;
  const selectedReceipt = selected[0];
  const lines = trpc.queries.purchaseReceiptLines.useQuery(
    { purchaseReceiptId: String(selectedReceipt?.id ?? '00000000-0000-0000-0000-000000000000') },
    { enabled: Boolean(selectedReceipt?.id) }
  );

  return (
    <div className="h-full flex flex-col">
      {/* UX-D03: tailored empty state names the producing verb + surface. */}
      <GridView viewKey="purchaseReceipts" entityType="purchaseReceipt" />
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
