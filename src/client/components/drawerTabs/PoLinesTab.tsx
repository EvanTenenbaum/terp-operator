import { trpc } from '../../api/trpc';

/**
 * PoLinesTab — purchase order lines context for the active PO.
 *
 * CAP-002 / TER-1474: Renders the lines on the selected purchase order
 * with receive progress (received vs. ordered) so the operator can see
 * fulfillment state without leaving the PO grid.
 *
 * Uses `queries.purchaseOrderLines` which already returns `qty`,
 * `receivedQty`, `unitCost`, `productName`, `category`, `uom`, etc.
 */

interface PoLinesTabProps {
  poId: string | null | undefined;
}

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

function qtyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 3 }) : '0';
}

export function PoLinesTab({ poId }: PoLinesTabProps) {
  const enabled = Boolean(poId);
  const lines = trpc.purchaseOrders.purchaseOrderLines.useQuery(
    { purchaseOrderId: poId ?? '00000000-0000-0000-0000-000000000000' },
    { enabled }
  );

  if (!enabled) {
    return (
      <div className="context-drawer-card">
        <h2 className="mt-1 text-base font-semibold text-ink">Lines</h2>
        <div className="drawer-empty mt-3">Select a purchase order to view its lines.</div>
      </div>
    );
  }

  const rows = lines.data ?? [];
  const totalOrdered = rows.reduce((sum, row) => sum + Number(row.qty ?? 0), 0);
  const totalReceived = rows.reduce((sum, row) => sum + Number(row.receivedQty ?? 0), 0);
  const totalCost = rows.reduce(
    (sum, row) => sum + Number(row.qty ?? 0) * Number(row.unitCost ?? 0),
    0
  );
  const overallProgress = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Lines</h2>
      <p className="mt-1 text-xs text-zinc-500">
        PO <span className="font-mono">{poId!.slice(0, 8)}…</span>
      </p>

      <div className="mt-3 grid gap-2">
        <div className="drawer-fact-row">
          <span>Lines</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Ordered qty</span>
          <strong>{qtyish(totalOrdered)}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Received qty</span>
          <strong>
            {qtyish(totalReceived)}
            <span className="ml-2 text-xs text-zinc-500">({overallProgress}%)</span>
          </strong>
        </div>
        <div className="drawer-fact-row">
          <span>PO total cost</span>
          <strong>${moneyish(totalCost)}</strong>
        </div>
      </div>

      {lines.isLoading ? (
        <div className="drawer-empty mt-4">Loading lines…</div>
      ) : rows.length ? (
        <div className="mt-4">
          <h3 className="section-title">Line detail ({rows.length})</h3>
          <div className="mt-2 grid gap-1 text-xs">
            {rows.map((row) => {
              const ordered = Number(row.qty ?? 0);
              const received = Number(row.receivedQty ?? 0);
              const progress = ordered > 0 ? Math.round((received / ordered) * 100) : 0;
              const lineTotal = ordered * Number(row.unitCost ?? 0);
              const isComplete = ordered > 0 && received >= ordered;
              return (
                <div key={String(row.id)} className="activity-row">
                  <span className="font-medium text-ink">
                    {String(row.productName ?? row.sku ?? row.id)}
                  </span>
                  <span className="text-zinc-500">{String(row.category ?? '-')}</span>
                  <span className={isComplete ? 'text-green-700' : 'text-zinc-700'}>
                    {qtyish(received)}/{qtyish(ordered)} {String(row.uom ?? '')}
                    <span className="ml-1 text-zinc-400">({progress}%)</span>
                  </span>
                  <span className="text-zinc-500">${moneyish(row.unitCost)}</span>
                  <span className="text-zinc-500">${moneyish(lineTotal)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="drawer-empty mt-4">No lines on this PO yet.</div>
      )}
    </div>
  );
}
