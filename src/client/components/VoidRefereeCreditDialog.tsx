import { useState } from 'react';
import { useCommandRunner } from './useCommandRunner';
import { FormDialog, FormField } from './templates';
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
    <FormDialog
      title="Void Referee Credit"
      titleId="vrc-title"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Void Credit"
      pendingLabel="Voiding..."
      pending={isRunning}
      error={errorMsg}
      maxWidthClass="max-w-md"
      tone="danger"
      description={
        <>
          Void credit for transaction <strong>{transactionNo}</strong> in the amount of <strong>{formatMoney(creditAmount)}</strong>?
        </>
      }
    >
      <FormField id="vrc-reason" label="Reason">
        <textarea
          id="vrc-reason"
          value={reason}
          onChange={(e) => { setReason(e.target.value); if (errorMsg) setErrorMsg(null); }}
          className={`w-full rounded border border-zinc-300 px-3 py-2${errorMsg ? ' input-error' : ''}`}
          rows={3}
          placeholder="Why is this credit being voided?"
        />
      </FormField>
    </FormDialog>
  );
}
