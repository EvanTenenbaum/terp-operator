import { useState } from 'react';
import { useCommandRunner } from './useCommandRunner';
import { FormDialog, FormField } from './templates';
import { formatMoney } from '../utils/format';

interface RecordPrepaymentDialogProps {
  purchaseOrderId: string;
  poNo: string;
  maxAmount: number;
  onClose: () => void;
}

export function RecordPrepaymentDialog({ purchaseOrderId, poNo, maxAmount, onClose }: RecordPrepaymentDialogProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const [amount, setAmount] = useState(maxAmount > 0 ? maxAmount.toFixed(2) : '');
  // TER-1661: payment methods simplified to cash, check, other.
  const [method, setMethod] = useState<'cash' | 'check' | 'other'>('check');
  const [reference, setReference] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      setErrorMsg('Prepayment amount must be greater than zero.');
      return;
    }
    if (numericAmount > maxAmount) {
      setErrorMsg(`Prepayment cannot exceed ${formatMoney(maxAmount)} (PO prepayment limit).`);
      return;
    }
    setErrorMsg(null);
    const result = await runCommand('recordVendorPrepayment', {
      purchaseOrderId,
      amount: numericAmount,
      method,
      reference: reference || null
    }, 'Record vendor prepayment for purchase order');
    if (result.ok) onClose();
  }

  return (
    <FormDialog
      title="Record Prepayment"
      titleId="rp-title"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Record Prepayment"
      pendingLabel="Recording..."
      pending={isRunning}
      error={errorMsg}
      description={
        <>
          PO <strong>{poNo}</strong> — prepayment limit: <strong>{formatMoney(maxAmount)}</strong>
        </>
      }
    >
      <FormField id="rp-amount" label="Amount ($)">
        <input
          id="rp-amount"
          type="number"
          step="0.01"
          min="0.01"
          max={maxAmount}
          value={amount}
          onChange={(e) => { setAmount(e.target.value); if (errorMsg) setErrorMsg(null); }}
          className={`w-full rounded border border-zinc-300 px-3 py-2${errorMsg ? ' input-error' : ''}`}
          required
        />
      </FormField>
      <FormField id="rp-method" label="Method">
        <select
          id="rp-method"
          value={method}
          onChange={(e) => setMethod(e.target.value as typeof method)}
          className="w-full rounded border border-zinc-300 px-3 py-2"
        >
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="other">Other</option>
        </select>
      </FormField>
      <FormField id="rp-reference" label="Reference (optional)">
        <input
          id="rp-reference"
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2"
          placeholder="Wire ID, check number, etc."
        />
      </FormField>
    </FormDialog>
  );
}
