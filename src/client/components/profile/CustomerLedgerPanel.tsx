/**
 * TER-1653: Dedicated, browsable, paginated, filterable client ledger view.
 *
 * Replaces the tiny 8-row subset in RelationshipDrawer. Shows full
 * transaction history with date, type, amount, balance, and notes.
 * Supports date-range and kind filtering with cursor-based pagination.
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { trpc } from '../../api/trpc';
import { formatMoney } from '../../utils/format';

const LEDGER_KINDS = [
  { value: '',            label: 'All types' },
  { value: 'invoice',    label: 'Invoice' },
  { value: 'credit',     label: 'Credit' },
  { value: 'down_payment', label: 'Down Payment' },
  { value: 'payment_allocation', label: 'Payment Allocation' },
  { value: 'payment_refund', label: 'Payment Refund' },
] as const;

interface LedgerRow {
  id: string;
  kind: string;
  amount: string | number;
  balanceAfter: string | number;
  note: string | null;
  createdAt: string;
}

interface LedgerPage {
  rows: LedgerRow[];
  nextCursor: string | null;
}

function kindLabel(kind: string): string {
  return kind
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '0.00';
}

interface CustomerLedgerPanelProps {
  customerId: string;
}

export function CustomerLedgerPanel({ customerId }: CustomerLedgerPanelProps) {
  const [open, setOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination state — cursor stack for back-navigation.
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const currentCursor = cursorStack.length > 0 ? cursorStack[cursorStack.length - 1] : undefined;

  const query = trpc.queries.customerLedgerEntries.useQuery(
    {
      customerId: customerId || '00000000-0000-0000-0000-000000000000',
      kind: kindFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      cursor: currentCursor,
      limit: 50,
    },
    { enabled: open && Boolean(customerId), keepPreviousData: true }
  );

  const data = query.data as LedgerPage | undefined;
  const rows = (data?.rows ?? []) as LedgerRow[];
  const hasNext = Boolean(data?.nextCursor);
  const hasPrev = cursorStack.length > 0;
  const pageNum = cursorStack.length + 1;

  function goNext() {
    if (data?.nextCursor) {
      setCursorStack((s) => [...s, data.nextCursor!]);
    }
  }

  function goPrev() {
    setCursorStack((s) => s.slice(0, -1));
  }

  // Reset cursor stack when filters change.
  function updateKind(value: string) { setKindFilter(value); setCursorStack([]); }
  function updateDateFrom(value: string) { setDateFrom(value); setCursorStack([]); }
  function updateDateTo(value: string) { setDateTo(value); setCursorStack([]); }

  return (
    <section className="workspace-panel customer-ledger-panel" aria-label="Client ledger entries">
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
              Client Ledger
            </span>
            <span className="block text-xs font-normal text-zinc-600">
              Full transaction history with balance tracking
            </span>
          </span>
        </button>
        {open ? (
          <div className="workspace-panel-actions">
            <div className="flex items-center gap-2">
              <select
                className="select text-xs"
                value={kindFilter}
                onChange={(e) => updateKind(e.target.value)}
                aria-label="Filter by transaction type"
              >
                {LEDGER_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
              <label className="text-xs text-zinc-500 flex items-center gap-1">
                From
                <input
                  type="date"
                  className="input text-xs w-32"
                  value={dateFrom}
                  onChange={(e) => updateDateFrom(e.target.value)}
                  aria-label="Date from"
                />
              </label>
              <label className="text-xs text-zinc-500 flex items-center gap-1">
                To
                <input
                  type="date"
                  className="input text-xs w-32"
                  value={dateTo}
                  onChange={(e) => updateDateTo(e.target.value)}
                  aria-label="Date to"
                />
              </label>
              <span className="text-xs font-medium text-zinc-600">
                {rows.length} row{rows.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="workspace-panel-content p-3">
          {query.isLoading ? (
            <div className="text-sm text-zinc-600">Loading ledger entries…</div>
          ) : query.error ? (
            <div className="text-sm text-red-600">Error loading ledger entries.</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-zinc-600">No ledger entries for this customer.</div>
          ) : (
            <>
              <div className="finder-table-wrap">
                <table className="finder-table" data-testid="customer-ledger-table">
                  <caption className="sr-only">Client ledger entries</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Type</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Balance After</th>
                      <th scope="col">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{dateLabel(row.createdAt)}</td>
                        <td>
                          <span className="finder-chip">{kindLabel(row.kind)}</span>
                        </td>
                        <td className={`font-mono text-right ${Number(row.amount) >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                          {Number(row.amount) >= 0 ? '+' : ''}{formatMoney(Number(row.amount))}
                        </td>
                        <td className="font-mono text-right">
                          {moneyish(row.balanceAfter)}
                        </td>
                        <td className="text-zinc-600 max-w-xs truncate" title={row.note ?? ''}>
                          {row.note || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-600">
                <span>
                  Page {pageNum}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="secondary-button compact-action"
                    disabled={!hasPrev || query.isFetching}
                    onClick={goPrev}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact-action"
                    disabled={!hasNext || query.isFetching}
                    onClick={goNext}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
