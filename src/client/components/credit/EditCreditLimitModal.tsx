import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useCommandRunner } from '../useCommandRunner';
import { formatMoney } from './creditPanelUtils';

export interface EditCreditLimitModalProps {
  customerId: string;
  currentLimit: number;
  engineRecommendation: number | null;
  ownerElevationThreshold: number | null;
  source: 'engine' | 'manual';
  open: boolean;
  onClose: () => void;
}

export function EditCreditLimitModal({
  customerId,
  currentLimit,
  engineRecommendation,
  ownerElevationThreshold,
  source,
  open,
  onClose
}: EditCreditLimitModalProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const [amount, setAmount] = useState(String(currentLimit));
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(String(currentLimit));
      setReason('');
      setSubmitError(null);
    }
  }, [currentLimit, open]);

  const parsedAmount = useMemo(() => Number(amount), [amount]);
  const amountError = amount.trim().length === 0
    ? 'Enter a credit limit amount.'
    : !Number.isFinite(parsedAmount)
      ? 'Credit limit must be a number.'
      : parsedAmount < 0
        ? 'Credit limit must be greater than or equal to zero.'
        : null;
  const reasonError = reason.trim().length > 0 && reason.trim().length < 4
    ? 'Reason must be at least 4 characters.'
    : null;
  const canSubmit = amountError === null && reason.trim().length >= 4 && !isRunning;
  const needsOwner = ownerElevationThreshold !== null && Number.isFinite(parsedAmount) && parsedAmount > ownerElevationThreshold;

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    if (!canSubmit) {
      setSubmitError('Fix the highlighted fields before saving.');
      return;
    }
    try {
      await runCommand('setCustomerCreditLimit', {
        customerId,
        amount: parsedAmount,
        reason: reason.trim()
      });
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save credit limit.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="edit-credit-limit-title">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Customer credit</p>
            <h2 id="edit-credit-limit-title" className="mt-1 text-lg font-semibold text-ink">Edit credit limit</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Saving this value switches the customer to a manual credit limit. The engine will keep computing recommendations, but it will not apply them automatically until you revert to engine control.
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Current source: <strong>{source === 'engine' ? 'Engine' : 'Manual'}</strong>
            {engineRecommendation !== null ? <> · Engine recommends <strong>{formatMoney(engineRecommendation)}</strong></> : <> · No engine recommendation yet</>}
          </div>

          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            New credit limit
            <input className="input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={amountError !== null} />
            {amountError ? <span className="text-xs text-red-600">{amountError}</span> : null}
          </label>

          <label className="grid gap-1 text-sm font-medium text-zinc-700">
            Reason
            <textarea className="input min-h-24" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why should this manual limit be used?" aria-invalid={reasonError !== null} />
            {reasonError ? <span className="text-xs text-red-600">{reasonError}</span> : <span className="text-xs text-zinc-500">Minimum 4 characters. This is recorded in the command journal.</span>}
          </label>

          {needsOwner ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Amounts above 1.5× the engine recommendation require <strong>owner</strong> role. Save will be rejected if you are not an owner.
            </div>
          ) : null}

          {submitError ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div> : null}

          <div className="flex justify-end gap-2">
            <button type="button" className="secondary-button" onClick={onClose} disabled={isRunning}>Cancel</button>
            <button type="submit" className="primary-button" disabled={!canSubmit}>{isRunning ? 'Saving…' : 'Save manual limit'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
