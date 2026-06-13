import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trpc } from '../../api/trpc';
import { WorkspacePanel } from '../WorkspacePanel';
import type { ContactProfileData } from './types';
import { formatMoney } from '../../utils/format';

const PAGE_SIZE = 50;

interface LedgerRow {
  id: string;
  kind: string;
  amount: string | number;
  method: string | null;
  reference: string | null;
  note: string | null;
  created_at: string;
  running_balance: string | number;
}

interface Props { data: ContactProfileData; }

export function ContactMoneyPanel({ data }: Props) {
  const contact = data.contact as Record<string, unknown>;
  const customer = data.customer as Record<string, unknown> | null;
  const vendor = data.vendor as Record<string, unknown> | null;
  const contactId = contact.id as string;

  const isContractorOrEmployee = Boolean(contact.is_contractor || contact.is_employee);

  // --- Pagination state (cursor-based) ---
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const cursor = cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : undefined;

  // --- Filter state ---
  const [kindFilter, setKindFilter] = useState('');

  const { data: ledger, isLoading } = trpc.queries.contactLedger.useQuery(
    {
      contactId,
      limit: PAGE_SIZE,
      cursor: cursor ?? undefined,
      kind: kindFilter || undefined,
    },
    { enabled: isContractorOrEmployee }
  );

  const rows = (ledger?.rows ?? []) as LedgerRow[];
  const total = ledger?.total ?? 0;
  const nextCursor = ledger?.nextCursor ?? null;
  const hasPrev = cursorStack.length > 0;
  const startIndex = cursorStack.length * PAGE_SIZE + (rows.length > 0 ? 1 : 0);
  const endIndex = startIndex + rows.length - 1;

  function goNext() {
    if (nextCursor) {
      setCursorStack((prev) => [...prev, nextCursor]);
    }
  }

  function goPrev() {
    setCursorStack((prev) => prev.slice(0, -1));
  }

  // Reset pagination when filter changes.
  function handleKindChange(value: string) {
    setKindFilter(value);
    setCursorStack([]);
  }

  // --- Summary data ---
  const receivable = Number(customer?.balance ?? 0);
  const payable    = Number(vendor?.open_bills_amount ?? 0);
  const net        = receivable - payable;
  const isDualRole = Boolean(contact.is_customer) && Boolean(contact.is_vendor);

  // --- Derived: distinct kind values for filter dropdown (from currently visible rows + known kinds) ---
  const kindOptions = useMemo(() => {
    const seen = new Set<string>(['payment_out', 'adjustment']);
    for (const row of rows) {
      if (row.kind) seen.add(row.kind);
    }
    return Array.from(seen).sort();
  }, [rows]);

  return (
    <div className="space-y-4">
      {isDualRole && (
        <div className="subtle-band flex items-center gap-6 px-4 py-2 text-sm">
          <span>Receivable (owed to you): <strong>{formatMoney(receivable)}</strong></span>
          <span>Payable (owed to them): <strong>{formatMoney(payable)}</strong></span>
          <span className={`selection-pill ${net < 0 ? 'warning' : ''}`}>
            Net: {formatMoney(net)} {net >= 0 ? '(favorable)' : '(unfavorable)'}
          </span>
        </div>
      )}

      {Boolean(contact.is_customer) && customer && (
        <WorkspacePanel panelId="contact-money-receivables" title="Customer Balances">
          <div className="p-3 text-sm space-y-1">
            <div>
              Open orders: <strong>{String(customer.open_invoices_count ?? 0)}</strong>{' '}
              totaling <strong>{formatMoney(Number(customer.open_invoices_amount ?? 0))}</strong>
            </div>
            <div>Balance: <strong>{formatMoney(Number(customer.balance ?? 0))}</strong></div>
          </div>
        </WorkspacePanel>
      )}

      {Boolean(contact.is_vendor) && vendor && (
        <WorkspacePanel panelId="contact-money-payables" title="Vendor Balances">
          <div className="p-3 text-sm space-y-1">
            <div>
              Open bills: <strong>{String(vendor.open_bills_count ?? 0)}</strong>{' '}
              totaling <strong>{formatMoney(Number(vendor.open_bills_amount ?? 0))}</strong>
            </div>
          </div>
        </WorkspacePanel>
      )}

      {isContractorOrEmployee && (
        <WorkspacePanel
          panelId="contact-money-direct"
          title="Payment Ledger"
          subtitle={total > 0
            ? `Showing ${startIndex}–${endIndex} of ${total} entries`
            : 'No ledger entries found'}
        >
          {/* Filter bar */}
          <div className="control-band flex items-center gap-3 px-3 py-2">
            <label className="text-xs text-zinc-500 font-medium">
              Kind
              <select
                className="select ml-1"
                value={kindFilter}
                onChange={(e) => handleKindChange(e.target.value)}
              >
                <option value="">All</option>
                {kindOptions.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Ledger table */}
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500 w-28">Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Kind</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500 w-28">Amount</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-zinc-500 w-32">Running Balance</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Method</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Reference</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Note</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-sm text-zinc-400 text-center">
                      Loading ledger entries...
                    </td>
                  </tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-sm text-zinc-400 text-center">
                      {kindFilter ? 'No entries matching the selected kind.' : 'No payments recorded.'}
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-3 py-2 text-xs text-zinc-500 font-mono whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString('en-US')}
                    </td>
                    <td className="px-3 py-2">
                      <span className="finder-chip">{row.kind}</span>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${Number(row.amount) < 0 ? 'text-danger' : ''}`}>
                      {formatMoney(Math.abs(Number(row.amount)))}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${Number(row.running_balance) < 0 ? 'text-danger' : ''}`}>
                      {formatMoney(Number(row.running_balance))}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{row.method ?? '—'}</td>
                    <td className="px-3 py-2 text-zinc-500 max-w-48 truncate">{row.reference ?? '—'}</td>
                    <td className="px-3 py-2 text-zinc-500 max-w-56 truncate">{row.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {total > 0 && (
            <div className="subtle-band flex items-center justify-between px-3 py-2 text-xs text-zinc-500">
              <span>
                {startIndex}–{endIndex} of {total}
              </span>
              <div className="flex items-center gap-1">
                <button
                  className="text-button compact-action"
                  type="button"
                  disabled={!hasPrev || isLoading}
                  onClick={goPrev}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </button>
                <button
                  className="text-button compact-action"
                  type="button"
                  disabled={!nextCursor || isLoading}
                  onClick={goNext}
                >
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </WorkspacePanel>
      )}
    </div>
  );
}
