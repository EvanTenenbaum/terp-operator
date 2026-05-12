import { Check, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { GridRow, QuickLaunchMode } from '../../shared/types';
import { useCommandRunner } from './useCommandRunner';
import { WorkspacePanel } from './WorkspacePanel';

type LedgerDirection = 'money_in' | 'money_out' | 'transfer' | 'adjustment';
type LedgerCategory = 'client_payment' | 'vendor_payout' | 'buyer_credit' | 'correction' | 'transfer';
type AllocationIntent = 'fifo' | 'selected' | 'unapplied';

interface LedgerDraft {
  id: string;
  date: string;
  direction: LedgerDirection;
  method: string;
  bucket: string;
  category: LedgerCategory;
  counterpartyId: string;
  documentId: string;
  amount: string;
  reference: string;
  notes: string;
  allocationIntent: AllocationIntent;
  status: 'draft' | 'posted' | 'needs_fix';
  issue?: string;
}

const methods = ['cash', 'check', 'card', 'crypto', 'wire'];
const buckets = ['cash-file-a', 'cash-file-b', 'office', 'accounting', 'crypto-wallet', 'wire-clearing'];

export function QuickLedgerGrid() {
  const reference = trpc.queries.reference.useQuery();
  const vendorBills = trpc.queries.grid.useQuery({ view: 'vendors' });
  const activeQuickLaunch = useUiStore((state) => state.activeQuickLaunch);
  const launchMode = activeQuickLaunch ?? 'moneyIn';
  const [rows, setRows] = useState<LedgerDraft[]>(() => [makeRow(launchMode)]);
  const [previewRowId, setPreviewRowId] = useState(rows[0]?.id ?? '');
  const activeRow = rows.find((row) => row.id === previewRowId);
  const preview = trpc.queries.paymentAllocationPreview.useQuery(
    {
      customerId: activeRow?.counterpartyId || '00000000-0000-0000-0000-000000000000',
      amount: Number(activeRow?.amount || 0),
      invoiceId: activeRow?.allocationIntent === 'selected' && activeRow.documentId ? activeRow.documentId : undefined,
      allocationIntent: activeRow?.allocationIntent
    },
    { enabled: Boolean(activeRow?.counterpartyId && activeRow.direction === 'money_in') }
  );
  const { runCommand, isRunning } = useCommandRunner();

  const bills = (vendorBills.data ?? []) as GridRow[];
  const openBills = useMemo(() => bills.filter((bill) => Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0) > 0), [bills]);

  function addRow(mode: QuickLaunchMode = launchMode) {
    setRows((current) => [...current, makeRow(mode)]);
  }

  function updateRow(id: string, patch: Partial<LedgerDraft>) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch, issue: undefined, status: row.status === 'posted' ? row.status : 'draft' as const };
        if (patch.direction) {
          next.category = defaultCategory(patch.direction);
          next.documentId = '';
          next.counterpartyId = '';
          if (patch.direction === 'money_out') next.allocationIntent = 'selected';
          if (patch.direction === 'money_in') next.allocationIntent = 'fifo';
        }
        if (patch.amount && Number(patch.amount) < 0) {
          next.category = 'buyer_credit';
          next.allocationIntent = 'unapplied';
        }
        return next;
      })
    );
    setPreviewRowId(id);
  }

  async function commit(row: LedgerDraft) {
    const amount = Number(row.amount);
    const issue = validate(row);
    if (issue) {
      mark(row.id, { status: 'needs_fix', issue });
      return;
    }
    if (row.direction === 'money_in') {
      const impactPreview = activeRow?.id === row.id && preview.data ? preview.data.label : clientImpact(row, reference.data?.openInvoices ?? [], openBills);
      const result = await runCommand(
        'logPayment',
        {
          customerId: row.counterpartyId,
          amount,
          method: row.method,
          reference: row.reference,
          locationBucket: row.bucket,
          notes: row.notes,
          direction: row.direction,
          category: row.category,
          allocationIntent: row.allocationIntent,
          impactPreview
        },
        'Quick Ledger: log money-in row'
      );
      if (result.ok && amount > 0 && row.allocationIntent !== 'unapplied') {
        await runCommand('allocatePayment', { paymentId: result.affectedIds[0], invoiceId: row.allocationIntent === 'selected' ? row.documentId || undefined : undefined }, 'Quick Ledger: allocation from row');
      }
      mark(row.id, { status: result.ok ? 'posted' : 'needs_fix', issue: result.ok ? undefined : result.toast });
      return;
    }

    if (row.direction === 'money_out' && row.category === 'vendor_payout') {
      const bill = openBills.find((candidate) => candidate.id === row.documentId);
      if (!bill) {
        mark(row.id, { status: 'needs_fix', issue: 'Choose a vendor bill before paying out.' });
        return;
      }
      if (bill.status !== 'scheduled') {
        const scheduled = await runCommand('scheduleVendorPayment', { vendorBillId: bill.id, scheduledFor: new Date(row.date).toISOString() }, 'Quick Ledger: schedule vendor payout');
        if (!scheduled.ok) {
          mark(row.id, { status: 'needs_fix', issue: scheduled.toast });
          return;
        }
      }
      const paid = await runCommand('recordVendorPayment', { vendorBillId: bill.id, amount, method: row.method, reference: row.reference }, 'Quick Ledger: record vendor payout');
      mark(row.id, { status: paid.ok ? 'posted' : 'needs_fix', issue: paid.ok ? undefined : paid.toast });
      return;
    }

    const journaled = await runCommand(
      'createCorrectionJournalEntry',
      { period: row.date.slice(0, 7), amount, memo: row.notes || row.reference || `${row.direction} ${row.category}` },
      'Quick Ledger: correction/transfer row'
    );
    mark(row.id, { status: journaled.ok ? 'posted' : 'needs_fix', issue: journaled.ok ? undefined : journaled.toast });
  }

  function mark(id: string, patch: Partial<LedgerDraft>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  return (
    <WorkspacePanel
      panelId="payments:quick-ledger"
      title="Quick Ledger"
      subtitle="Append Money In or Money Out rows, preview allocation impact, then commit audited commands without modal workflows."
      contentClassName="p-3"
      actions={
        <>
        <button className="primary-button compact-action" type="button" onClick={() => addRow('moneyIn')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Money In
        </button>
        <button className="secondary-button compact-action" type="button" onClick={() => addRow('moneyOut')}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Money Out
        </button>
        <button className="secondary-button compact-action" type="button" onClick={() => addRow()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Row
        </button>
        </>
      }
    >
      <div className="quick-ledger-grid">
        <table className="quick-ledger-table">
          <caption className="sr-only">Draft ledger rows</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Direction</th>
              <th>Method</th>
              <th>Bucket</th>
              <th>Category</th>
              <th>Counterparty</th>
              <th>Invoice / bill</th>
              <th>Amount</th>
              <th>Reference</th>
              <th>Notes</th>
              <th>Allocation</th>
              <th>Impact</th>
              <th>Trace</th>
              <th>Status</th>
              <th>Commit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const counterpartyOptions = row.direction === 'money_out' ? reference.data?.vendors ?? [] : reference.data?.customers ?? [];
              const documentOptions = row.direction === 'money_out'
                ? openBills.filter((bill) => !row.counterpartyId || bill.vendorId === row.counterpartyId)
                : (reference.data?.openInvoices ?? []).filter((invoice) => !row.counterpartyId || invoice.customerId === row.counterpartyId);
              const impact = row.id === previewRowId && preview.data ? `${preview.data.label}; unapplied ${preview.data.unapplied}` : clientImpact(row, reference.data?.openInvoices ?? [], openBills);
              const trace = ledgerTrace(row, documentOptions);
              return (
                <tr key={row.id}>
                  <td><input type="date" value={row.date} onChange={(event) => updateRow(row.id, { date: event.target.value })} onFocus={() => setPreviewRowId(row.id)} /></td>
                  <td>
                    <select value={row.direction} onChange={(event) => updateRow(row.id, { direction: event.target.value as LedgerDirection })} onFocus={() => setPreviewRowId(row.id)}>
                      <option value="money_in">Money in</option>
                      <option value="money_out">Money out</option>
                      <option value="transfer">Transfer</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </td>
                  <td>
                    <select value={row.method} onChange={(event) => updateRow(row.id, { method: event.target.value })}>
                      {methods.map((method) => <option key={method}>{method}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={row.bucket} onChange={(event) => updateRow(row.id, { bucket: event.target.value })}>
                      {buckets.map((bucket) => <option key={bucket}>{bucket}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={row.category} onChange={(event) => updateRow(row.id, { category: event.target.value as LedgerCategory })}>
                      <option value="client_payment">Client payment</option>
                      <option value="vendor_payout">Vendor payout</option>
                      <option value="buyer_credit">Buyer credit</option>
                      <option value="correction">Correction</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  </td>
                  <td>
                    <select value={row.counterpartyId} onChange={(event) => updateRow(row.id, { counterpartyId: event.target.value, documentId: '' })} onFocus={() => setPreviewRowId(row.id)}>
                      <option value="">Choose</option>
                      {counterpartyOptions.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={row.documentId} onChange={(event) => updateRow(row.id, { documentId: event.target.value, allocationIntent: event.target.value ? 'selected' : row.allocationIntent })} onFocus={() => setPreviewRowId(row.id)}>
                      <option value="">{row.direction === 'money_out' ? 'Choose bill' : 'FIFO / none'}</option>
                      {documentOptions.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {String(doc.invoiceNo ?? doc.billNo ?? 'Document')} / ${money(Number(doc.total ?? doc.amount ?? 0) - Number(doc.amountPaid ?? 0))}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td><input value={row.amount} inputMode="decimal" onChange={(event) => updateRow(row.id, { amount: event.target.value })} onFocus={() => setPreviewRowId(row.id)} /></td>
                  <td><input value={row.reference} onChange={(event) => updateRow(row.id, { reference: event.target.value })} /></td>
                  <td><input value={row.notes} onChange={(event) => updateRow(row.id, { notes: event.target.value })} /></td>
                  <td>
                    <select value={row.allocationIntent} onChange={(event) => updateRow(row.id, { allocationIntent: event.target.value as AllocationIntent })} disabled={row.direction !== 'money_in'}>
                      <option value="fifo">FIFO</option>
                      <option value="selected">Selected</option>
                      <option value="unapplied">Unapplied</option>
                    </select>
                  </td>
                  <td className="quick-ledger-impact">{row.issue ?? impact}</td>
                  <td className="quick-ledger-impact">{trace}</td>
                  <td><span className={row.status === 'posted' ? 'finder-chip success' : row.status === 'needs_fix' ? 'finder-chip warning' : 'finder-chip'}>{row.status}</span></td>
                  <td>
                    <button className="icon-button" type="button" disabled={isRunning || row.status === 'posted'} onClick={() => void commit(row)} title="Commit ledger row">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Commit ledger row</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </WorkspacePanel>
  );
}

function makeRow(mode: QuickLaunchMode): LedgerDraft {
  const direction: LedgerDirection = mode === 'moneyOut' ? 'money_out' : mode === 'moneyIn' ? 'money_in' : 'money_in';
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    direction,
    method: 'cash',
    bucket: direction === 'money_out' ? 'accounting' : 'cash-file-a',
    category: defaultCategory(direction),
    counterpartyId: '',
    documentId: '',
    amount: '',
    reference: '',
    notes: '',
    allocationIntent: direction === 'money_out' ? 'selected' : 'fifo',
    status: 'draft'
  };
}

function defaultCategory(direction: LedgerDirection): LedgerCategory {
  if (direction === 'money_out') return 'vendor_payout';
  if (direction === 'transfer') return 'transfer';
  if (direction === 'adjustment') return 'correction';
  return 'client_payment';
}

function validate(row: LedgerDraft) {
  const amount = Number(row.amount);
  if (!Number.isFinite(amount) || amount === 0) return 'Amount must be non-zero.';
  if (row.direction === 'money_in' && !row.counterpartyId) return 'Choose the client for this money-in row.';
  if (row.direction === 'money_out' && row.category === 'vendor_payout' && !row.documentId) return 'Choose the vendor bill before paying out.';
  if ((row.direction === 'adjustment' || row.direction === 'transfer') && !row.notes && !row.reference) return 'Add a note or reference before posting a correction/transfer row.';
  return null;
}

function clientImpact(row: LedgerDraft, invoices: Array<{ id: string; customerId: string; invoiceNo: string; total: unknown; amountPaid: unknown }>, bills: GridRow[]) {
  const amount = Number(row.amount || 0);
  if (row.direction === 'money_in' && amount < 0) return `Buyer credit / down payment ${money(Math.abs(amount))}`;
  if (row.direction === 'money_in') {
    const open = invoices.filter((invoice) => invoice.customerId === row.counterpartyId).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0)), 0);
    if (row.allocationIntent === 'unapplied') return `Leaves ${money(Math.abs(amount))} unapplied`;
    return `Applies up to ${money(Math.min(open, Math.max(0, amount)))}; ${money(Math.max(0, amount - open))} unapplied`;
  }
  if (row.direction === 'money_out') {
    const bill = bills.find((candidate) => candidate.id === row.documentId);
    const open = bill ? Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0) : 0;
    return bill ? `Pays ${money(Math.min(open, Math.abs(amount)))} on ${String(bill.billNo ?? 'vendor bill')}` : 'Choose bill to preview payout';
  }
  return `${row.direction} journal entry ${money(amount)}`;
}

function ledgerTrace(row: LedgerDraft, documents: Array<GridRow | { id: string; invoiceNo?: string; billNo?: string }>) {
  const document = documents.find((candidate) => candidate.id === row.documentId);
  const documentLabel = String(document && 'invoiceNo' in document ? document.invoiceNo ?? document.billNo ?? document.id : document?.id ?? 'unapplied');
  if (row.direction === 'money_in' && Number(row.amount || 0) < 0) return `client -> buyer credit -> ${row.bucket}`;
  if (row.direction === 'money_in') return `client -> ${row.allocationIntent === 'selected' ? documentLabel : row.allocationIntent} -> ${row.bucket}`;
  if (row.direction === 'money_out') return `${row.bucket} -> vendor bill -> ${documentLabel}`;
  return `${row.bucket} -> journal`;
}

function money(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
