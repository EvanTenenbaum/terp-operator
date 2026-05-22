import { X } from 'lucide-react';
import { trpc } from '../api/trpc';
import type { IntakeOrderRow } from '../views/IntakeView.types';

interface ReceiptPreviewDrawerProps {
  order: IntakeOrderRow | null;
  onClose: () => void;
}

export function ReceiptPreviewDrawer({ order, onClose }: ReceiptPreviewDrawerProps) {
  const previewBatchIds = order
    ? order.batches
        .filter((batch) => ['draft', 'ready', 'needs_fix'].includes(batch.status))
        .map((batch) => batch.id)
    : [];

  const receiptPreview = trpc.queries.receiptPreview.useQuery(
    { batchIds: previewBatchIds },
    { enabled: previewBatchIds.length > 0 }
  );

  if (!order) return null;

  return (
    <aside className="context-drawer context-drawer-standard" aria-label="Receipt preview">
      <div className="context-drawer-header">
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close receipt preview"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">Receipt preview</div>
          <div className="truncate text-[11px] uppercase text-zinc-500">{order.poNo}</div>
        </div>
      </div>
      <div className="context-drawer-body">
        <div className="context-drawer-card">
          {receiptPreview.data ? (
            <div className="grid gap-3">
              <div className="grid gap-2 text-sm md:grid-cols-2">
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
              <div className="finder-table-wrap max-h-96">
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
          ) : receiptPreview.isError ? (
            <div className="drawer-empty text-red-700">Failed to load receipt preview. Check server logs.</div>
          ) : previewBatchIds.length === 0 ? (
            <div className="drawer-empty">No pending batches to preview.</div>
          ) : (
            <div className="drawer-empty">Loading preview…</div>
          )}
        </div>
      </div>
    </aside>
  );
}
