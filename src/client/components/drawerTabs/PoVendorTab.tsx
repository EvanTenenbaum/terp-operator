import { trpc } from '../../api/trpc';

/**
 * PoVendorTab — vendor context for the active purchase order.
 *
 * CAP-002 / TER-1474: Surfaces vendor profile, payment terms, open bills,
 * prior POs and recent payments for the PO's vendor so the operator can
 * judge counterparty health without leaving the PO grid.
 *
 * Uses `queries.relationshipSummary` keyed on vendorId — the same query
 * the drawer already runs for the Relationship tab, so RQ deduplicates
 * the network call when both tabs are visited.
 */

interface PoVendorTabProps {
  vendorId: string | null | undefined;
  vendorName?: string;
}

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

function dateish(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

export function PoVendorTab({ vendorId, vendorName }: PoVendorTabProps) {
  const enabled = Boolean(vendorId);
  const summary = trpc.queries.relationshipSummary.useQuery(
    { vendorId: vendorId ?? undefined, customerId: undefined },
    { enabled }
  );

  if (!enabled) {
    return (
      <div className="context-drawer-card">
        <h2 className="mt-1 text-base font-semibold text-ink">Vendor</h2>
        <div className="drawer-empty mt-3">
          No vendor on this PO yet. Assign a vendor from the PO row to see context here.
        </div>
      </div>
    );
  }

  const vendor = summary.data?.vendor as
    | { id?: string; name?: string; termsDays?: number | string; notes?: string }
    | null
    | undefined;
  const bills = summary.data?.bills ?? [];
  const vendorPayments = summary.data?.vendorPayments ?? [];
  const priorPos = summary.data?.purchaseOrders ?? [];

  const openBillTotal = bills.reduce(
    (sum, bill) => sum + Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0),
    0
  );
  const openBillCount = bills.filter(
    (bill) => Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0) > 0
  ).length;
  const lastPayment = vendorPayments[0];

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">
        {String(vendor?.name ?? vendorName ?? 'Vendor')}
      </h2>
      {vendor?.id ? (
        <p className="mt-1 text-xs text-zinc-500">
          Vendor <span className="font-mono">{String(vendor.id).slice(0, 8)}…</span>
        </p>
      ) : null}

      <div className="mt-3 grid gap-2">
        <div className="drawer-fact-row">
          <span>Terms</span>
          <strong>{vendor?.termsDays != null ? `Net ${vendor.termsDays} days` : '-'}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Open bills</span>
          <strong>
            {openBillCount}
            {openBillCount > 0 ? (
              <span className="ml-2 text-xs text-zinc-500">(${moneyish(openBillTotal)})</span>
            ) : null}
          </strong>
        </div>
        <div className="drawer-fact-row">
          <span>Prior POs</span>
          <strong>{priorPos.length}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Last payment</span>
          <strong>
            {lastPayment
              ? `$${moneyish(lastPayment.amount)} · ${dateish(lastPayment.createdAt)}`
              : '-'}
          </strong>
        </div>
      </div>

      {summary.isLoading ? (
        <div className="drawer-empty mt-4">Loading vendor context…</div>
      ) : null}

      {priorPos.length ? (
        <section className="mt-4">
          <h3 className="section-title">Recent POs ({priorPos.length})</h3>
          <div className="mt-2 grid gap-1 text-xs">
            {priorPos.slice(0, 8).map((po) => (
              <div key={String(po.id)} className="activity-row">
                <span className="font-medium text-ink">{String(po.poNo ?? po.id)}</span>
                <span className="text-zinc-500">{String(po.status ?? '-')}</span>
                <span className="text-zinc-600">${moneyish(po.total)}</span>
                <span className="text-zinc-400">{dateish(po.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {bills.length ? (
        <section className="mt-4">
          <h3 className="section-title">Open bills ({bills.length})</h3>
          <div className="mt-2 grid gap-1 text-xs">
            {bills.slice(0, 6).map((bill) => {
              const open = Math.max(0, Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0));
              return (
                <div key={String(bill.id)} className="activity-row">
                  <span className="font-medium text-ink">{String(bill.billNo ?? bill.id)}</span>
                  <span className="text-zinc-500">{String(bill.status ?? '-')}</span>
                  <span className="text-zinc-600">${moneyish(open)} open</span>
                  <span className="text-zinc-400">{dateish(bill.scheduledFor)}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {vendor?.notes ? (
        <section className="mt-4">
          <h3 className="section-title">Notes</h3>
          <div className="mt-2 whitespace-pre-wrap text-xs text-zinc-700">{vendor.notes}</div>
        </section>
      ) : null}
    </div>
  );
}
