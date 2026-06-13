/**
 * Customer Purchase History disclosure (#61).
 *
 * Default-closed disclosure that sits above the Sales workspace. When the
 * operator expands it, it lazy-loads line-level prior sales for the selected
 * customer and renders a table with product alias, vendor, sale price, qty,
 * payment terms, and payment status. A free-text filter narrows by alias /
 * canonical product / vendor / payment terms / payment status.
 */
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trpc } from '../api/trpc';
import {
  filterPurchaseHistory,
  type PurchaseHistoryRow
} from '../utils/purchaseHistoryFilter';

interface CustomerPurchaseHistoryPanelProps {
  customerId: string;
  customerName?: string;
}

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '0';
}

function qtyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 3 }) : '0';
}

function statusLabel(status: string | null | undefined): string {
  if (!status) return 'unbilled';
  return status;
}

export function CustomerPurchaseHistoryPanel({ customerId, customerName }: CustomerPurchaseHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Lazy load: only fetch when the disclosure is open AND a customer is selected.
  const history = trpc.queries.customerPurchaseHistory.useQuery(
    { customerId: customerId || '00000000-0000-0000-0000-000000000000', limit: 200 },
    { enabled: open && Boolean(customerId) }
  );

  const rows = (history.data ?? []) as PurchaseHistoryRow[];
  const filtered = useMemo(() => filterPurchaseHistory(rows, query), [rows, query]);

  return (
    <section
      className="workspace-panel customer-purchase-history"
      aria-label="Customer purchase history"
    >
      <div className="workspace-panel-header">
        <button
          type="button"
          className="workspace-panel-title-button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
          <span>
            <span className="block text-base font-semibold text-ink">
              Customer purchase history
            </span>
            <span className="block text-xs font-normal text-zinc-600">
              {customerName ? `Prior sales for ${customerName}` : 'Prior sales for the selected customer'}
            </span>
          </span>
        </button>
        {open ? (
          <div className="workspace-panel-actions">
            <label className="finder-search" aria-label="Filter customer purchase history">
              <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              <input
                type="search"
                role="searchbox"
                aria-label="Search customer purchase history"
                placeholder="Filter by alias, product, vendor, terms, status"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <span className="text-xs font-medium text-zinc-600">
              {filtered.length} / {rows.length}
            </span>
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="workspace-panel-content p-3">
          {history.isLoading ? (
            <div className="text-sm text-zinc-600">Loading purchase history…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-zinc-600">No prior purchases for the selected customer.</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-zinc-600">
              No prior purchases match this filter. Try clearing the search.
            </div>
          ) : (
            <div className="finder-table-wrap">
              <table className="finder-table" data-testid="customer-purchase-history-table">
                <caption className="sr-only">Customer line-level purchase history</caption>
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Date</th>
                    <th scope="col">Product name</th>
                    <th scope="col">Canonical</th>
                    <th scope="col">Vendor</th>
                    <th scope="col">Sale price</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Payment terms</th>
                    <th scope="col">Payment status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id}>
                      <td className="font-medium">{row.orderNo ?? '-'}</td>
                      <td>{row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-US') : '-'}</td>
                      <td>{row.itemAlias ?? '-'}</td>
                      <td>{row.itemName ?? '-'}</td>
                      <td>{row.vendor ?? '-'}</td>
                      <td>${moneyish(row.unitPrice)}</td>
                      <td>{qtyish(row.qty)}</td>
                      <td>{row.paymentTerms ?? 'TBD'}</td>
                      <td>{statusLabel(row.paymentStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
