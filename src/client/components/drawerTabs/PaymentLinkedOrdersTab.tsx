import { useNavigate } from 'react-router-dom';
import { trpc } from '../../api/trpc';
import { useUiStore } from '../../store/uiStore';

/**
 * UX-J06: Payment inspector "Linked Orders" tab.
 *
 * Surfaces invoice→order cross-links from the payment's allocations so the
 * accounting operator can jump from a payment row directly to the originating
 * sales order without leaving context.
 *
 * Data: reuses the existing `queries.paymentAllocations` tRPC procedure (same
 * call as PaymentAllocationTools in PaymentsView) — tRPC deduplicates the
 * request when the allocations panel is already mounted.
 *
 * Navigation: uses the setGridFilter / setDrawerEntity / navigate pattern
 * (CountPill / TER-1624 lineage, decision 5 sanctioned cross-module refs).
 *
 * Money-path conservatism: this tab is read-only — it shows existing
 * allocations and navigates; it never triggers a command.
 */

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

interface PaymentLinkedOrdersTabProps {
  paymentId: string;
}

export function PaymentLinkedOrdersTab({ paymentId }: PaymentLinkedOrdersTabProps) {
  const navigate = useNavigate();
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const setActiveView = useUiStore((state) => state.setActiveView);

  // Reuses the same query as PaymentAllocationTools — deduplicated by tRPC.
  const allocations = trpc.queries.paymentAllocations.useQuery(
    { paymentId },
    { enabled: Boolean(paymentId) }
  );

  function openOrder(orderId: string, invoiceNo: string) {
    // Navigate to Orders view, pre-filter to the order row, and open its drawer.
    // Uses orderId (sales_order.id) for the canonical deep-link pattern so the
    // drawer state key resolves correctly when the row is selected (UX-B03/J06 fix).
    setGridFilter('orders', `id:${orderId}`);
    setDrawerEntity('orders', 'order', orderId);
    setDrawerState('orders', 'standard');
    setActiveView('orders');
    navigate('/orders');
  }

  if (allocations.isLoading) {
    return <p className="page-subtitle">Loading linked orders…</p>;
  }

  const rows = allocations.data ?? [];

  return (
    <section className="view-stack" aria-label="Linked orders">
      <p className="text-xs text-zinc-500">
        Orders this payment has been applied to. Click "Open order" to navigate
        to the sales order in the Orders view.
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-400 mt-2">
          No allocations yet — this payment has not been applied to any orders.
        </p>
      ) : (
        <div className="mt-2 grid gap-1 text-xs">
          {rows.map((row) => {
            const orderId = String(row.orderId ?? '');
            const invoiceNo = String(row.invoiceNo ?? '—');
            const amount = moneyish(row.amount);
            return (
              <div key={String(row.id)} className="activity-row">
                <span className="font-medium text-ink">{invoiceNo}</span>
                <span className="text-zinc-500">${amount} applied</span>
                {orderId ? (
                  <button
                    type="button"
                    className="secondary-button compact-action"
                    title={`Open order for invoice ${invoiceNo}`}
                    onClick={() => openOrder(orderId, invoiceNo)}
                  >
                    Open order
                  </button>
                ) : (
                  <span className="text-zinc-300">No order linked</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
