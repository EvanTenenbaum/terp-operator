import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import type { GridRow, ViewKey } from '../../shared/types';
import { useCommandRunner } from './useCommandRunner';
import { InspectorDrawer } from './templates';

/**
 * Issue / credit / refund actions for a selected row.
 *
 * The body is exported separately so it can render as a tab of the unified
 * RowInspector; the standalone drawer wrapper is kept for any direct callers.
 */
export function IssueActionsBody({ row, view, onDone }: { row: GridRow; view: ViewKey; onDone: () => void }) {
  const [action, setAction] = useState<'dispute' | 'refund' | 'credit' | 'correction'>('correction');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const { runCommand, isRunning } = useCommandRunner();

  async function submit() {
    if (!reason.trim()) return;
    if (action === 'refund' && view === 'payments') {
      await runCommand('refundPayment', { paymentId: row.id, reason }, 'Issue sidecar: refund payment');
      onDone();
      return;
    }
    if (action === 'credit') {
      const customerId = String(row.customerId ?? (view === 'clients' ? row.id : ''));
      if (!customerId || !amount) return;
      await runCommand('applyClientCredit', { customerId, amount: Number(amount), reason }, 'Issue sidecar: apply client credit');
      onDone();
      return;
    }
    await runCommand(
      'createCorrectionJournalEntry',
      {
        period: new Date().toISOString().slice(0, 7),
        amount: Number(amount || 0),
        memo: reason,
        invoiceId: action === 'dispute' && row.invoiceId ? row.invoiceId : undefined,
        reason
      },
      action === 'dispute' ? 'Issue sidecar: invoice dispute' : 'Issue sidecar: correction'
    );
    onDone();
  }

  const canRefund = view === 'payments';
  const canCredit = Boolean(row.customerId || view === 'clients');
  const canDispute = Boolean(row.invoiceId);

  return (
    <>
      <div className="selection-pill warning">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Selected row: {issueRowLabel(row)}
      </div>
      <div className="mt-4 grid gap-3">
        <label className="field-inline">
          Action
          <select className="select" value={action} onChange={(event) => setAction(event.target.value as typeof action)}>
            <option value="correction">Manual correction</option>
            <option value="dispute" disabled={!canDispute}>Dispute</option>
            <option value="refund" disabled={!canRefund}>Refund payment</option>
            <option value="credit" disabled={!canCredit}>Buyer credit</option>
          </select>
        </label>
        <label className="field-inline">
          Amount
          <input className="input" value={amount} inputMode="decimal" placeholder={action === 'refund' ? 'Refund uses payment row' : '0.00'} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Reason
          <textarea className="mt-1 h-28 w-full resize-none border border-line p-2 text-sm outline-none focus:shadow-focus" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="inline-panel text-sm">
          Impact preview: {impactPreview(action, amount, row, view)}
        </div>
        <button className="primary-button w-fit" type="button" disabled={!reason.trim() || isRunning || (action === 'credit' && !amount)} onClick={submit}>
          Post audited issue action
        </button>
      </div>
    </>
  );
}

interface IssueSidecarProps {
  row: GridRow | null;
  view: ViewKey;
  onClose: () => void;
}

/** Standalone wrapper (legacy callers) — single-tab inspector. */
export function IssueSidecar({ row, view, onClose }: IssueSidecarProps) {
  if (!row) return null;
  return (
    <InspectorDrawer
      open
      title="Issue / Credit / Refund"
      subtitle={issueRowLabel(row)}
      ariaLabel="Issue sidecar"
      tabs={[{ key: 'issue', label: 'Issue', render: () => <IssueActionsBody row={row} view={view} onDone={onClose} /> }]}
      activeTab="issue"
      onTabChange={() => {}}
      onClose={onClose}
    />
  );
}

function impactPreview(action: string, amount: string, row: GridRow, view: ViewKey) {
  if (action === 'refund') return `Marks payment ${issueRowLabel(row)} refunded and clears unapplied amount.`;
  if (action === 'credit') return `Applies $${money(Number(amount || 0))} credit to ${String(row.customer ?? row.name ?? issueRowLabel(row))}.`;
  if (action === 'dispute') return `Creates an open dispute entry for order ${String(row.invoiceNo ?? row.invoiceId)} plus manual correction trace.`;
  return `Posts a manual correction from ${view} for $${money(Number(amount || 0))}.`;
}

export function issueRowLabel(row: GridRow) {
  return String(row.orderNo ?? row.invoiceNo ?? row.reference ?? row.customer ?? row.name ?? row.vendor ?? row.billNo ?? row.batchCode ?? row.pickNo ?? 'selected row');
}

function money(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
