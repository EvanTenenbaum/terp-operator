import { useState } from 'react';
import { X } from 'lucide-react';
import { useCommandRunner } from './useCommandRunner';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface RecordPrepaymentDialogProps {
  purchaseOrderId: string;
  poNo: string;
  maxAmount: number;
  onClose: () => void;
}

export function RecordPrepaymentDialog({ purchaseOrderId, poNo, maxAmount, onClose }: RecordPrepaymentDialogProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [amount, setAmount] = useState(maxAmount > 0 ? maxAmount.toFixed(2) : '');
  const [method, setMethod] = useState<'cash' | 'check' | 'wire' | 'ach' | 'crypto'>('wire');
  const [reference, setReference] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) {
      alert('Prepayment amount must be greater than zero.');
      return;
    }
    if (numericAmount > maxAmount) {
      alert(`Prepayment cannot exceed $${maxAmount.toFixed(2)} (PO prepayment limit).`);
      return;
    }
    const result = await runCommand('recordVendorPrepayment', {
      purchaseOrderId,
      amount: numericAmount,
      method,
      reference: reference || null
    }, 'Record vendor prepayment for purchase order');
    if (result.ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rp-title"
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="rp-title" className="text-lg font-semibold text-zinc-900">Record Prepayment</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-zinc-600">
          PO <strong>{poNo}</strong> — prepayment limit: <strong>${maxAmount.toFixed(2)}</strong>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="rp-amount">Amount ($)</label>
            <input
              id="rp-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={maxAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="rp-method">Method</label>
            <select
              id="rp-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="wire">Wire</option>
              <option value="check">Check</option>
              <option value="ach">ACH</option>
              <option value="cash">Cash</option>
              <option value="crypto">Crypto</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="rp-reference">Reference (optional)</label>
            <input
              id="rp-reference"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
              placeholder="Wire ID, check number, etc."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRunning}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {isRunning ? 'Recording...' : 'Record Prepayment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
