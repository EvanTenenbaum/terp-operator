import { trpc } from '../../api/trpc';

/**
 * VendorBillTraceTab — linked chain trace for a vendor bill.
 *
 * CMD-VENDOR / TER-1517 (Phase 3 PR B): Shows the full lineage of a vendor
 * bill: linked PO, linked purchase receipt, consignment trigger indicator,
 * and payment events.
 *
 * Data strategy:
 * - Linked PO: grid row fields (poNo, purchaseOrderId).
 * - Linked receipt (UX-K03): grid row fields (receiptNo, receiptId) — derived
 *   by extending the vendors grid SQL to join purchase_receipts on the bill's
 *   purchase_order_id. Extends an existing query field set (no new procedure).
 * - Consignment trigger: grid row `consignmentTriggered` field.
 * - Payment events: `queries.vendorPayments({ vendorBillId })`.
 *
 * Tracked deviation: intake-batch detail (per-batch received items joining
 * purchase_receipt_lines → batches) requires a new tRPC procedure
 * (vendorBillIntakeBatches). Shipping the partial (PO + receipt links) now;
 * the intake-batch section is stubbed with a tracked TODO.
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
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-US');
}

export function VendorBillTraceTab({ vendorBillId, row }: VendorBillTraceTabProps) {
  const paymentsQuery = trpc.queries.vendorPayments.useQuery(
    { vendorBillId },
    { enabled: Boolean(vendorBillId) }
  );

  const payments = paymentsQuery.data ?? [];

  const hasLinkedPo = Boolean(row?.poNo || row?.purchaseOrderId);
  // UX-K03: receiptNo / receiptId are now returned by the vendors grid query
  // (lateral join on purchase_receipts.purchase_order_id — no new procedure).
  const hasLinkedReceipt = Boolean(row?.receiptNo || row?.receiptId);
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

      {/* Linked purchase receipt (UX-K03): receiptNo + receiptId derived from
          the vendors grid query's lateral join on purchase_receipts.purchase_order_id.
          Shows the first receipt posted against this bill's PO. */}
      <section className="mt-4">
        <h3 className="section-title">Linked receipt</h3>
        {hasLinkedReceipt ? (
          <div className="mt-2 grid gap-1 text-xs">
            <div className="activity-row">
              <span className="font-medium text-ink">{String(row?.receiptNo ?? '-')}</span>
              <span className="text-zinc-500">purchase receipt</span>
              <span className="font-mono text-zinc-400">
                {row?.receiptId ? String(row.receiptId).slice(0, 8) + '…' : ''}
              </span>
            </div>
          </div>
        ) : hasLinkedPo ? (
          <p className="mt-2 text-xs text-zinc-400">
            No receipt posted against this PO yet.
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-400">No linked PO — no receipt to trace.</p>
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

      {/* Intake batches — stub (new procedure required, shipping partial).
          UX-K03 deviation: intake-batch detail (joining purchase_receipt_lines
          → batches → items for batch_code, item name, qty) requires a new tRPC
          procedure `queries.vendorBillIntakeBatches`. Tracked as remainder;
          PO + receipt source links above are derivable from existing query fields. */}
      <section className="mt-4">
        <h3 className="section-title">Intake batches</h3>
        {hasLinkedPo ? (
          <p className="mt-2 text-xs text-zinc-400">
            Batch-level detail pending (requires{' '}
            <span className="font-mono">vendorBillIntakeBatches</span> query).
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
