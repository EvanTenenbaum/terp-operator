import { Clipboard, X } from 'lucide-react';
import { trpc } from '../api/trpc';
import type { GridRow, ViewKey } from '../../shared/types';

interface RelationshipDrawerProps {
  row: GridRow | null;
  view: ViewKey;
  onClose: () => void;
}

export function RelationshipDrawer({ row, view, onClose }: RelationshipDrawerProps) {
  const customerId = inferCustomerId(row, view);
  const vendorId = inferVendorId(row, view);
  const summary = trpc.queries.relationshipSummary.useQuery({ customerId, vendorId }, { enabled: Boolean(row && (customerId || vendorId)) });
  if (!row || (!customerId && !vendorId)) return null;
  const data = summary.data;
  const customerOpen = (data?.invoices ?? []).reduce((sum, invoice) => sum + Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0), 0);
  const vendorOpen = (data?.bills ?? []).reduce((sum, bill) => sum + Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0), 0);

  function copySafeStatus() {
    const text = [
      data?.customer?.name || data?.vendor?.name || String(row?.customer ?? row?.vendor ?? 'Relationship'),
      `Open receivables: $${money(customerOpen)}`,
      `Open payables: $${money(vendorOpen)}`,
      `Recent orders: ${(data?.orders ?? []).slice(0, 3).map((order) => `${order.orderNo} ${order.status}`).join(', ') || 'none'}`,
      `Recent bills: ${(data?.bills ?? []).slice(0, 3).map((bill) => `${bill.billNo} ${bill.status}`).join(', ') || 'none'}`
    ].join('\n');
    void navigator.clipboard?.writeText(text);
  }

  return (
    <>
      <button className="row-history-backdrop" type="button" aria-label="Close relationship drawer" onClick={onClose} />
      <aside className="row-history-drawer" role="dialog" aria-modal="true" aria-label="Relationship summary">
        <div className="row-history-header">
          <div>
            <h2 className="text-lg font-semibold text-ink">Relationship Summary</h2>
            <p className="text-sm text-zinc-600">AR, AP, orders, bills, payments, and recent commands in one place.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close relationship summary">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="row-history-list">
          <div className="definition-list">
            <div className="definition-item">
              <strong>Owes us</strong>
              <div>${money(customerOpen)}</div>
            </div>
            <div className="definition-item">
              <strong>We owe them</strong>
              <div>${money(vendorOpen)}</div>
            </div>
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
            Copy safe status
          </button>
          <RelationshipSection title="Invoices" rows={data?.invoices ?? []} columns={['invoiceNo', 'status', 'total', 'amountPaid']} />
          <RelationshipSection title="Client ledger" rows={data?.ledger ?? []} columns={['kind', 'amount', 'balanceAfter', 'note']} />
          <RelationshipSection title="Credit overrides" rows={data?.creditOverrides ?? []} columns={['status', 'amount', 'reason', 'createdAt']} />
          <RelationshipSection title="Invoice disputes" rows={data?.disputes ?? []} columns={['invoiceNo', 'status', 'reason', 'resolution']} />
          <RelationshipSection title="Payments" rows={data?.payments ?? []} columns={['method', 'amount', 'unappliedAmount', 'category']} />
          <RelationshipSection title="Orders" rows={data?.orders ?? []} columns={['orderNo', 'status', 'total', 'createdAt']} />
          <RelationshipSection title="Purchase receipts" rows={data?.receipts ?? []} columns={['receiptNo', 'status', 'total', 'createdAt']} />
          <RelationshipSection title="Vendor bills" rows={data?.bills ?? []} columns={['billNo', 'status', 'amount', 'amountPaid', 'dueReason']} />
          <RelationshipSection title="Vendor payments" rows={data?.vendorPayments ?? []} columns={['billNo', 'amount', 'method', 'reference']} />
          <RelationshipSection title="Recent commands" rows={data?.commands ?? []} columns={['commandName', 'actorName', 'status', 'createdAt']} />
        </div>
      </aside>
    </>
  );
}

function RelationshipSection({ title, rows, columns }: { title: string; rows: GridRow[]; columns: string[] }) {
  return (
    <section className="mt-4">
      <h3 className="section-title">{title}</h3>
      <div className="mt-2 grid gap-1 text-xs">
        {rows.length ? rows.slice(0, 8).map((row) => (
          <div className="activity-row" key={row.id}>
            {columns.slice(0, 4).map((column) => <span key={column}>{format(row[column])}</span>)}
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
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function money(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
