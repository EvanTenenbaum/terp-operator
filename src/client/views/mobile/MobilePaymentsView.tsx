import { useMemo, useState } from 'react';
import { trpc } from '../../api/trpc';
import { useCommandRunner } from '../../components/useCommandRunner';
import { MobileConfirmSheet } from '../../components/mobile/MobileConfirmSheet';
import { MobileEmptyState } from '../../components/mobile/MobileEmptyState';
import { useMobileToast } from '../../components/mobile/MobileToast';

type Tab = 'receive' | 'pay';
// TER-1661: payment methods simplified to cash, check, other.
type MethodId = 'cash' | 'check' | 'other';

const METHODS: readonly { id: MethodId; label: string }[] = [
  { id: 'cash',  label: 'Cash' },
  { id: 'check', label: 'Check' },
  { id: 'other', label: 'Other' },
];

const CONFIRM_THRESHOLD = 20_000;

/**
 * Canonical confirm-sheet trigger table (mobile views design spec, 2026-05-24):
 *   - Receive Payment, amount >= $20,000          → confirm required
 *   - Receive Payment, amount !== invoice total   → confirm required
 *   - Pay Vendor, always                          → confirm required
 *
 * `invoiceTotal` may be null when no canonical total is known (treated as no
 * mismatch trigger; the amount threshold still applies).
 */
export function shouldConfirm(tab: Tab, amount: number, invoiceTotal: number | null): boolean {
  if (tab === 'pay') return true;
  if (amount >= CONFIRM_THRESHOLD) return true;
  if (invoiceTotal !== null && Number.isFinite(invoiceTotal) && amount !== invoiceTotal) return true;
  return false;
}

interface InvoiceRow {
  id: string;
  customer: string;
  customerId: string;
  invoiceNo: string;
  unappliedAmount: number;
  total: number;
  status: string;
  createdAt: string;
}

interface BillRow {
  id: string;
  vendor: string;
  billNo: string;
  amount: number;
  amountPaid: number;
  status: string;
  dueDate: string;
}

interface PendingPayload {
  kind: Tab;
  summary: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function daysFromNow(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.floor(ms / 86_400_000);
}

function daysAgo(iso: string): number {
  return -daysFromNow(iso);
}

function methodLabel(id: MethodId | null): string {
  if (!id) return '';
  return METHODS.find(m => m.id === id)?.label ?? '';
}

export function MobilePaymentsView() {
  const [tab, setTab] = useState<Tab>('receive');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<MethodId | null>(null);
  const [reference, setReference] = useState<string>('');
  const [pending, setPending] = useState<PendingPayload | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const me = trpc.auth.me.useQuery();
  const { runCommand } = useCommandRunner();
  const { addToast } = useMobileToast();

  // SX-K08: this query returns payment records, not open invoices.
  const invoicesQuery = trpc.queries.grid.useQuery({ view: 'payments' });
  const billsQuery    = trpc.queries.grid.useQuery({ view: 'vendors' });

  const role: string = (me.data as { role?: string } | undefined)?.role ?? 'viewer';
  const canPayVendor = role === 'owner' || role === 'manager';

  const invoices: InvoiceRow[] = useMemo(() => {
    const raw = ((invoicesQuery.data ?? []) as any[]).map((row: any) => ({
      ...row,
      customerId: row.customerId ?? row.customer_id ?? row.id,
    })) as InvoiceRow[];
    return raw
      .filter(r => !dismissedIds.has(r.id))
      .slice()
      // Oldest createdAt first (most overdue / most urgent at top)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [invoicesQuery.data, dismissedIds]);

  const bills: BillRow[] = useMemo(() => {
    const raw = (billsQuery.data ?? []) as BillRow[];
    return raw
      .filter(r => !dismissedIds.has(r.id))
      .slice()
      // Earliest dueDate first (most overdue / soonest due at top)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [billsQuery.data, dismissedIds]);

  function resetForm() {
    setAmount('');
    setMethod(null);
    setReference('');
  }

  function selectTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setExpandedId(null);
    resetForm();
  }

  function expandInvoice(row: InvoiceRow) {
    const next = expandedId === row.id ? null : row.id;
    setExpandedId(next);
    if (next === null) {
      resetForm();
    } else {
      setAmount(String(row.unappliedAmount ?? 0));
      setMethod(null);
      setReference('');
    }
  }

  function expandBill(row: BillRow) {
    const balance = Math.max(0, Number(row.amount ?? 0) - Number(row.amountPaid ?? 0));
    const next = expandedId === row.id ? null : row.id;
    setExpandedId(next);
    if (next === null) {
      resetForm();
    } else {
      setAmount(String(balance));
      setMethod(null);
      setReference('');
    }
  }

  const numericAmount = Number(amount);
  const amountValid = Number.isFinite(numericAmount) && numericAmount > 0;
  const formValid = amountValid && method !== null;

  function buildSummary(name: string, ref: string, amt: number, mlabel: string, kind: Tab): string {
    const verb = kind === 'receive' ? 'Receiving' : 'Paying';
    const direction = kind === 'receive' ? 'from' : 'to';
    const refText = ref.trim() ? ` (ref ${ref.trim()})` : '';
    return `${verb} ${formatMoney(amt)} ${direction} ${name} via ${mlabel}${refText}`;
  }

  async function submitReceive(row: InvoiceRow) {
    if (!formValid || method === null) return;
    const mlabel = methodLabel(method);
    const amt = numericAmount;
    const summary = buildSummary(row.customer, reference, amt, mlabel, 'receive');

    const run = async () => {
      try {
        await runCommand('logPayment', {
          customerId: row.customerId,
          amount: amt,
          method: method,
          reference: reference.trim(),
          direction: 'inbound',
          category: 'receivable',
        });
        addToast(`Receipt logged from ${row.customer}`, 'success');
        setDismissedIds(prev => {
          const next = new Set(prev);
          next.add(row.id);
          return next;
        });
        setExpandedId(null);
        resetForm();
      } catch {
        // useCommandRunner surfaces command errors via its own toast pipeline.
      }
    };

    if (shouldConfirm('receive', amt, row.total != null ? Number(row.total) : null)) {
      setPending({ kind: 'receive', summary, confirmLabel: 'Record Receipt', run });
    } else {
      await run();
    }
  }

  async function submitPay(row: BillRow) {
    if (!formValid || method === null || !canPayVendor) return;
    const mlabel = methodLabel(method);
    const amt = numericAmount;
    const summary = buildSummary(row.vendor, reference, amt, mlabel, 'pay');

    const run = async () => {
      try {
        await runCommand('recordVendorPayment', {
          vendorBillId: row.id,
          amount: amt,
          method: method,
          reference: reference.trim(),
        });
        addToast(`Payment sent to ${row.vendor}`, 'success');
        setDismissedIds(prev => {
          const next = new Set(prev);
          next.add(row.id);
          return next;
        });
        setExpandedId(null);
        resetForm();
      } catch {
        // surfaced by useCommandRunner
      }
    };

    // Pay Vendor → always confirm.
    setPending({ kind: 'pay', summary, confirmLabel: 'Send Payment', run });
  }

  return (
    <div>
      {/* Tab strip */}
      <div
        className="sticky top-0 z-10 border-b"
        style={{ background: 'var(--m-field)', borderColor: 'var(--m-line)' }}
      >
        <div className="flex" aria-label="Payments mode">
          <TabButton active={tab === 'receive'} onClick={() => selectTab('receive')} label="Receive Payment" />
          <TabButton active={tab === 'pay'}     onClick={() => selectTab('pay')}     label="Pay Vendor" />
        </div>
      </div>

      {tab === 'receive' ? (
        invoices.length === 0 ? (
          <MobileEmptyState icon="💰" headline="No recent payments" body="Payment records will appear here once logged." />
        ) : (
          <div className="divide-y px-4" style={{ borderColor: 'var(--m-line)' }}>
            {invoices.map(row => {
              const isExpanded = expandedId === row.id;
              const age = daysAgo(row.createdAt);
              const isOverdue = age > 7;
              return (
                <div key={row.id}>
                  <button
                    type="button"
                    onClick={() => expandInvoice(row)}
                    aria-label={row.customer}
                    aria-expanded={isExpanded}
                    className="flex w-full min-h-[64px] flex-col gap-1 py-4 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold" style={{ color: 'var(--m-ink)' }}>
                        {row.customer}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: 'var(--m-ink)' }}>
                        {formatMoney(row.unappliedAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs" style={{ color: 'var(--m-muted-2)' }}>
                      <span className="font-mono">{row.invoiceNo}</span>
                      <span style={{ color: isOverdue ? 'var(--m-amber)' : 'var(--m-muted-2)' }}>
                        {isOverdue ? `⚠ ${age}d overdue` : `${age}d ago`}
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <PaymentForm
                      kind="receive"
                      amount={amount}
                      onAmount={setAmount}
                      method={method}
                      onMethod={setMethod}
                      reference={reference}
                      onReference={setReference}
                      onSubmit={() => submitReceive(row)}
                      submitLabel="Record Receipt"
                      submitDisabled={!formValid}
                      contextLine={`Invoice total ${formatMoney(row.total)} · Unapplied ${formatMoney(row.unappliedAmount)}`}
                      summaryLine={method && amountValid
                        ? buildSummary(row.customer, reference, numericAmount, methodLabel(method), 'receive')
                        : null}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        bills.length === 0 ? (
          <MobileEmptyState icon="📤" headline="No open payables" body="Nothing due right now." />
        ) : (
          <div className="divide-y px-4" style={{ borderColor: 'var(--m-line)' }}>
            {bills.map(row => {
              const isExpanded = expandedId === row.id;
              const dueIn = daysFromNow(row.dueDate);
              const isOverdue = dueIn < 0;
              const balance = Math.max(0, Number(row.amount ?? 0) - Number(row.amountPaid ?? 0));
              return (
                <div key={row.id}>
                  <button
                    type="button"
                    onClick={() => expandBill(row)}
                    aria-label={row.vendor}
                    aria-expanded={isExpanded}
                    className="flex w-full min-h-[64px] flex-col gap-1 py-4 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold" style={{ color: 'var(--m-ink)' }}>
                        {row.vendor}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: 'var(--m-ink)' }}>
                        {formatMoney(balance)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs" style={{ color: 'var(--m-muted-2)' }}>
                      <span className="font-mono">{row.billNo}</span>
                      <span style={{ color: isOverdue ? 'var(--m-amber)' : 'var(--m-muted-2)' }}>
                        {isOverdue ? `⚠ ${Math.abs(dueIn)}d overdue` : `due in ${dueIn}d`}
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <PaymentForm
                      kind="pay"
                      amount={amount}
                      onAmount={setAmount}
                      method={method}
                      onMethod={setMethod}
                      reference={reference}
                      onReference={setReference}
                      onSubmit={() => submitPay(row)}
                      submitLabel="Record Payment"
                      submitDisabled={!formValid || !canPayVendor}
                      submitTooltip={!canPayVendor ? 'Manager role required.' : undefined}
                      contextLine={`Bill total ${formatMoney(row.amount)} · Paid ${formatMoney(row.amountPaid)} · Balance ${formatMoney(balance)}`}
                      summaryLine={method && amountValid
                        ? buildSummary(row.vendor, reference, numericAmount, methodLabel(method), 'pay')
                        : null}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      <MobileConfirmSheet
        open={pending !== null}
        summary={pending?.summary ?? ''}
        confirmLabel={pending?.confirmLabel ?? 'Confirm'}
        onConfirm={async () => {
          const p = pending;
          setPending(null);
          if (p) await p.run();
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="flex-1 py-3 text-sm font-semibold"
      style={{
        color: active ? 'var(--m-ink)' : 'var(--m-muted)',
        borderBottom: active ? '2px solid var(--m-accent)' : '2px solid transparent',
        background: 'transparent',
      }}
    >
      {label}
    </button>
  );
}

interface PaymentFormProps {
  kind: Tab;
  amount: string;
  onAmount: (v: string) => void;
  method: MethodId | null;
  onMethod: (m: MethodId) => void;
  reference: string;
  onReference: (v: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  submitDisabled: boolean;
  submitTooltip?: string;
  contextLine: string;
  summaryLine: string | null;
}

function PaymentForm(props: PaymentFormProps) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 40,
    borderRadius: 12,
    border: '1px solid var(--m-line)',
    padding: '0 12px',
    background: 'var(--m-field)',
    color: 'var(--m-ink)',
    fontSize: 14,
  };

  return (
    <div className="mb-3 rounded-xl p-3" style={{ background: '#f1f3ee' }}>
      <p className="mb-2 text-xs" style={{ color: 'var(--m-muted-2)' }}>{props.contextLine}</p>

      <label className="mb-2 block">
        <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--m-muted)' }}>Amount</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          aria-label="Amount"
          value={props.amount}
          onChange={e => props.onAmount(e.target.value)}
          style={inputStyle}
        />
      </label>

      <div className="mb-2">
        <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--m-muted)' }}>Method</span>
        <div className="flex flex-wrap gap-2">
          {METHODS.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => props.onMethod(m.id)}
              aria-pressed={props.method === m.id}
              className={`m-chip ${props.method === m.id ? 'm-chip-active' : ''}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-medium" style={{ color: 'var(--m-muted)' }}>Reference</span>
        <input
          type="text"
          aria-label="Reference"
          value={props.reference}
          onChange={e => props.onReference(e.target.value)}
          placeholder={props.kind === 'receive' ? 'Check #, wire ref…' : 'Vendor ref / bill #'}
          style={inputStyle}
        />
      </label>

      {props.summaryLine && (
        <p className="mb-3 text-xs" style={{ color: 'var(--m-muted-2)' }}>
          {props.summaryLine}
        </p>
      )}

      <button
        type="button"
        onClick={props.onSubmit}
        disabled={props.submitDisabled}
        title={props.submitTooltip}
        aria-label={props.submitLabel}
        className="m-btn-primary"
      >
        {props.submitLabel}
      </button>
    </div>
  );
}
