import { Clipboard } from 'lucide-react';
import { trpc } from '../api/trpc';
import { CustomerPricingPanel } from './PricingPanel';
import { commandLabelFor } from '../../shared/commandCatalog';
import { buildCustomerSafeRelationshipStatus, buildVendorSafeRelationshipStatus } from '../../shared/customerSafeStatus';
import type { GridRow, ViewKey } from '../../shared/types';
import { InspectorDrawer } from './templates';

/**
 * Relationship summary — money position, recent activity, and pricing for
 * the customer/vendor behind a selected row.
 *
 * The body is exported separately so it can render as a tab of the unified
 * RowInspector; the standalone drawer wrapper is kept for any direct callers.
 */
export function relationshipAvailable(row: GridRow | null, view: ViewKey) {
  return Boolean(inferCustomerId(row, view) || inferVendorId(row, view));
}

export function RelationshipSummaryBody({ row, view }: { row: GridRow; view: ViewKey }) {
  const customerId = inferCustomerId(row, view);
  const vendorId = inferVendorId(row, view);
  const summary = trpc.context.relationshipSummary.useQuery({ customerId, vendorId }, { enabled: Boolean(customerId || vendorId) });
  const data = summary.data;
  const customerOpen = (data?.invoices ?? []).reduce((sum, invoice) => sum + Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0), 0);
  const vendorOpen = (data?.bills ?? []).reduce((sum, bill) => sum + Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0), 0);
  const isDualRole = Boolean(data?.customer && data?.vendor);
  // UX-N03: netPosition intentionally removed — see JY-07 "do not net" comment below.

  // UX-N02 convergence: the external-safe text is built by the shared
  // customerSafeStatus util (same gating used by the order Timeline tab's
  // "Copy status summary (customer-safe)"). Output format is unchanged.
  function copySafeStatus() {
    const isVendorOnly = Boolean(data?.vendor) && !data?.customer;
    const text = isVendorOnly
      ? buildVendorSafeRelationshipStatus({
          name: String(data?.vendor?.name || String(row?.vendor ?? 'Vendor')),
          openPayables: vendorOpen,
          scheduledPayoutCount: (data?.vendorPayments ?? []).filter((payment) => payment.status === 'scheduled').length,
          bills: (data?.bills ?? []).map((bill) => ({ refNo: String(bill.billNo), status: String(bill.status) }))
        })
      : buildCustomerSafeRelationshipStatus({
          name: String(data?.customer?.name || String(row?.customer ?? 'Customer')),
          openBalance: customerOpen,
          orders: (data?.orders ?? []).map((order) => ({ refNo: String(order.orderNo), status: String(order.status) })),
          invoices: (data?.invoices ?? []).map((invoice) => ({ refNo: String(invoice.invoiceNo), status: String(invoice.status) }))
        });
    void navigator.clipboard?.writeText(text);
  }

  return (
    <>
      {isDualRole ? (
        <div className="mb-2">
          <span className="selection-pill" title="Both a customer and a vendor">Dual-role</span>
        </div>
      ) : null}
      <div className="definition-list">
        <div className="definition-item">
          <strong>Owes us</strong>
          <div>${money(customerOpen)}</div>
        </div>
        <div className="definition-item">
          <strong>We owe them</strong>
          <div>${money(vendorOpen)}</div>
        </div>
        {/* UX-N03 / JY-07 "do not net": Net position row is intentionally
            removed for dual-role counterparties. Showing a single netted number
            silently conceals the gross AR and AP obligations on each side.
            AR ("Owes us") and AP ("We owe them") are already rendered above as
            separate directional figures — that is the correct presentation. */}
        <div className="definition-item">
          <strong>Scheduled payables</strong>
          <div>{(data?.bills ?? []).filter((bill) => bill.status === 'scheduled').length}</div>
        </div>
        <div className="definition-item">
          <strong>Recent commands</strong>
          <div>{data?.commands?.length ?? 0}</div>
        </div>
      </div>
      <button className="secondary-button mt-3" type="button" onClick={copySafeStatus}>
        <Clipboard className="h-4 w-4" aria-hidden="true" />
        Copy external-safe status
      </button>
      <RelationshipSection title="Orders" rows={data?.invoices ?? []} columns={['invoiceNo', 'status', 'total', 'amountPaid']} />
      <RelationshipSection title="Client balances" rows={data?.ledger ?? []} columns={['kind', 'amount', 'balanceAfter', 'note']} />
      <RelationshipSection title="Credit overrides" rows={data?.creditOverrides ?? []} columns={['status', 'amount', 'reason', 'createdAt']} />
      <RelationshipSection title="Disputes" rows={data?.disputes ?? []} columns={['invoiceNo', 'status', 'reason', 'resolution']} />
      <RelationshipSection title="Payments" rows={data?.payments ?? []} columns={['method', 'amount', 'unappliedAmount', 'category']} />
      <RelationshipSection title="Orders" rows={data?.orders ?? []} columns={['orderNo', 'status', 'total', 'createdAt']} />
      <RelationshipSection title="Purchase receipts" rows={data?.receipts ?? []} columns={['receiptNo', 'status', 'total', 'createdAt']} />
      <RelationshipSection title="Vendor bills" rows={data?.bills ?? []} columns={['billNo', 'status', 'amount', 'amountPaid', 'dueReason']} />
      <RelationshipSection title="Vendor payments" rows={data?.vendorPayments ?? []} columns={['billNo', 'amount', 'method', 'reference']} />
      <RelationshipSection title="Recent commands" rows={data?.commands ?? []} columns={['commandName', 'actorName', 'status', 'createdAt']} />
      {customerId ? <CustomerPricingPanel customerId={customerId} /> : null}
    </>
  );
}

interface RelationshipDrawerProps {
  row: GridRow | null;
  view: ViewKey;
  onClose: () => void;
}

/** Standalone wrapper (legacy callers) — single-tab inspector. */
export function RelationshipDrawer({ row, view, onClose }: RelationshipDrawerProps) {
  if (!row || !relationshipAvailable(row, view)) return null;
  return (
    <InspectorDrawer
      open
      title="Relationship Summary"
      ariaLabel="Relationship summary"
      tabs={[{ key: 'relationship', label: 'Relationship', render: () => <RelationshipSummaryBody row={row} view={view} /> }]}
      activeTab="relationship"
      onTabChange={() => {}}
      onClose={onClose}
    />
  );
}

function RelationshipSection({ title, rows, columns }: { title: string; rows: GridRow[]; columns: string[] }) {
  return (
    <section className="mt-4">
      <h3 className="section-title">{title}</h3>
      <div className="mt-2 grid gap-1 text-xs">
        {rows.length ? rows.slice(0, 8).map((row) => (
          <div className="activity-row" key={row.id}>
            {columns.slice(0, 4).map((column) => <span key={column}>{formatRelationshipValue(column, row[column])}</span>)}
          </div>
        )) : <div className="border border-line bg-panel p-2 text-zinc-600">No rows.</div>}
      </div>
    </section>
  );
}

function inferCustomerId(row: GridRow | null, view: ViewKey) {
  if (!row) return undefined;
  if (typeof row.customerId === 'string') return row.customerId;
  if (view === 'clients') return row.id;
  return undefined;
}

function inferVendorId(row: GridRow | null, view: ViewKey) {
  if (!row) return undefined;
  if (typeof row.vendorId === 'string') return row.vendorId;
  if (view === 'vendors') return row.vendorId ? String(row.vendorId) : row.id;
  return undefined;
}

function format(value: unknown) {
  if (value == null) return '-';
  if (typeof value === 'number') return money(value);
  if (Array.isArray(value)) return value.length ? value.map((entry) => String(entry)).join(', ') : '-';
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 3);
    return entries.length ? entries.map(([key, entry]) => `${key}: ${String(entry ?? '-')}`).join(' / ') : '-';
  }
  return String(value);
}

function formatRelationshipValue(column: string, value: unknown) {
  if (column === 'commandName') return commandLabelFor(value);
  return format(value);
}

function money(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
