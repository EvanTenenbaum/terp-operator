import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import type { GridRow, ViewKey } from '../../shared/types';
import { useCommandRunner } from './useCommandRunner';

interface IssueSidecarProps {
  row: GridRow | null;
  view: ViewKey;
  onClose: () => void;
}

export function IssueSidecar({ row, view, onClose }: IssueSidecarProps) {
  const [action, setAction] = useState<'dispute' | 'refund' | 'credit' | 'correction'>('correction');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const { runCommand, isRunning } = useCommandRunner();
  if (!row) return null;

  async function submit() {
    if (!row || !reason.trim()) return;
    if (action === 'refund' && view === 'payments') {
      await runCommand('refundPayment', { paymentId: row.id, reason }, 'Issue sidecar: refund payment');
      onClose();
      return;
    }
    if (action === 'credit') {
      const customerId = String(row.customerId ?? (view === 'clients' ? row.id : ''));
      if (!customerId || !amount) return;
      await runCommand('applyClientCredit', { customerId, amount: Number(amount), reason }, 'Issue sidecar: apply client credit');
      onClose();
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
    onClose();
  }

  const canRefund = view === 'payments';
  const canCredit = Boolean(row.customerId || view === 'clients');
  const canDispute = Boolean(row.invoiceId);

  return (
    <>
      <button className="row-history-backdrop" type="button" aria-label="Close issue sidecar" onClick={onClose} />
      <aside className="row-history-drawer" role="dialog" aria-modal="true" aria-label="Issue sidecar">
        <div className="row-history-header">
          <div>
            <h2 className="text-lg font-semibold text-ink">Issue / Credit / Refund</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close issue sidecar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="row-history-list">
          <div className="selection-pill warning">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Selected row: {rowLabel(row)}
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
        </div>
      </aside>
    </>
  );
}

function impactPreview(action: string, amount: string, row: GridRow, view: ViewKey) {
  if (action === 'refund') return `Marks payment ${rowLabel(row)} refunded and clears unapplied amount.`;
  if (action === 'credit') return `Applies $${money(Number(amount || 0))} credit to ${String(row.customer ?? row.name ?? rowLabel(row))}.`;
  if (action === 'dispute') return `Creates an open dispute entry for order ${String(row.invoiceNo ?? row.invoiceId)} plus manual correction trace.`;
  return `Posts a manual correction from ${view} for $${money(Number(amount || 0))}.`;
}

function rowLabel(row: GridRow) {
  return String(row.orderNo ?? row.invoiceNo ?? row.reference ?? row.customer ?? row.name ?? row.vendor ?? row.billNo ?? row.batchCode ?? row.pickNo ?? 'selected row');
}

function money(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '0.00';
}
