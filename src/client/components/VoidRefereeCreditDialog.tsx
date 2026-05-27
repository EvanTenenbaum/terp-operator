import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useCommandRunner } from './useCommandRunner';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { formatMoney } from '../utils/format';

interface VoidRefereeCreditDialogProps {
  creditId: string;
  transactionNo: string;
  creditAmount: number;
  onClose: () => void;
}

export function VoidRefereeCreditDialog({
  creditId,
  transactionNo,
  creditAmount,
  onClose
}: VoidRefereeCreditDialogProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('A reason is required to void a referee credit.');
      return;
    }
    setErrorMsg(null);
    const result = await runCommand(
      'voidRefereeCredit',
      { creditId, reason: reason.trim() },
      reason.trim()
    );
    if (result.ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vrc-title"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 id="vrc-title" className="text-lg font-semibold text-zinc-900">Void Referee Credit</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-zinc-600">
          Void credit for transaction <strong>{transactionNo}</strong> in the amount of <strong>{formatMoney(creditAmount)}</strong>?
        </p>
        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="vrc-reason">Reason</label>
            <textarea
              id="vrc-reason"
              value={reason}
              onChange={(e) => { setReason(e.target.value); if (errorMsg) setErrorMsg(null); }}
              className={`w-full rounded border border-zinc-300 px-3 py-2${errorMsg ? ' input-error' : ''}`}
              rows={3}
              placeholder="Why is this credit being voided?"
            />
          </div>
          {errorMsg && <div className="field-error" role="alert">{errorMsg}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button type="submit" disabled={isRunning} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {isRunning ? 'Voiding...' : 'Void Credit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
