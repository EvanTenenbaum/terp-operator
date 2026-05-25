import { trpc } from '../../api/trpc';

/**
 * VendorBillTraceTab — linked chain trace for a vendor bill.
 *
 * CMD-VENDOR / TER-1517 (Phase 3 PR B): Shows the full lineage of a vendor
 * bill: linked PO, linked intake batches (from the PO's receipts), consignment
 * trigger indicator, and payment events.
 *
 * Data strategy:
 * - Linked PO / intake receipts: from grid row (poNo, purchaseOrderId) +
 *   `queries.vendorPayments` for payment events.
 * - Intake batches: TODO — no dedicated tRPC query exists yet. Shows stub UI
 *   with a "No data" fallback.
 * - Consignment trigger: from grid row `consignmentTriggered` field.
 * - Payment events: `queries.vendorPayments({ vendorBillId })`.
 *
 * TODO: add tRPC query `queries.vendorBillIntakeBatches` to return intake
 * batches linked to this bill's purchaseOrderId. Would join:
 *   purchase_receipts → batches → items for batch_code, item name,
 *   arrived_at, qty. When that query exists, replace the stub section below.
 */

interface VendorBillTraceTabProps {
  vendorBillId: string;
  /** Grid row for the selected vendor bill — pre-fetched by VendorPayablesView */
  row?: Record<string, unknown>;
}

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

function dateish(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

export function VendorBillTraceTab({ vendorBillId, row }: VendorBillTraceTabProps) {
  const paymentsQuery = trpc.queries.vendorPayments.useQuery(
    { vendorBillId },
    { enabled: Boolean(vendorBillId) }
  );

  const payments = paymentsQuery.data ?? [];

  const hasLinkedPo = Boolean(row?.poNo || row?.purchaseOrderId);
  const isConsignment = Boolean(row?.consignmentTriggered);

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Bill trace</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Linked chain for bill{' '}
        <span className="font-mono">{String(row?.billNo ?? vendorBillId.slice(0, 8))}…</span>
      </p>

      {/* Linked PO */}
      <section className="mt-4">
        <h3 className="section-title">Linked PO</h3>
        {hasLinkedPo ? (
          <div className="mt-2 grid gap-1 text-xs">
            <div className="activity-row">
              <span className="font-medium text-ink">{String(row?.poNo ?? '-')}</span>
              <span className="text-zinc-500">purchase order</span>
              <span className="font-mono text-zinc-400">
                {row?.purchaseOrderId ? String(row.purchaseOrderId).slice(0, 8) + '…' : ''}
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-400">No linked PO — bill was created directly.</p>
        )}
      </section>

      {/* Consignment trigger */}
      {isConsignment ? (
        <section className="mt-4">
          <h3 className="section-title">Consignment trigger</h3>
          <p className="mt-2 text-xs text-amber-700">
            This bill was triggered by consigned inventory depletion. The vendor's
            consigned lot was partially or fully sold, creating this payable
            automatically.
          </p>
        </section>
      ) : null}

      {/* Intake batches — stub (no query exists yet) */}
      <section className="mt-4">
        <h3 className="section-title">Linked intake batches</h3>
        {/* TODO: add tRPC query `queries.vendorBillIntakeBatches({ purchaseOrderId })`
            joining purchase_receipts → batches → items. When that query exists,
            fetch it here and replace this stub. */}
        {hasLinkedPo ? (
          <p className="mt-2 text-xs text-zinc-400">
            No data — intake batch detail query not yet available.{' '}
            <span className="text-zinc-300">
              (Stub: vendorBillIntakeBatches query pending.)
            </span>
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-400">No linked PO — no intake batches to trace.</p>
        )}
      </section>

      {/* Payment events */}
      <section className="mt-4">
        <h3 className="section-title">Payment events ({payments.length})</h3>
        {paymentsQuery.isLoading ? (
          <div className="drawer-empty mt-2">Loading payment events…</div>
        ) : payments.length ? (
          <div className="mt-2 grid gap-1 text-xs">
            {payments.map((payment) => (
              <div key={String(payment.id)} className="activity-row">
                <span className="font-medium text-ink">${moneyish(payment.amount)}</span>
                <span className="text-zinc-500">{String(payment.method ?? '-')}</span>
                {payment.reference ? (
                  <span className="font-mono text-zinc-400">
                    ref: {String(payment.reference)}
                  </span>
                ) : null}
                <span
                  className={
                    String(payment.status ?? '') === 'void'
                      ? 'text-red-500'
                      : 'text-green-700'
                  }
                >
                  {String(payment.status ?? 'recorded')}
                </span>
                <span className="text-zinc-400">{dateish(payment.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-400">No payments recorded yet.</p>
        )}
      </section>
    </div>
  );
}
