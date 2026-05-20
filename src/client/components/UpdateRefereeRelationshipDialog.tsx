import { useState } from 'react';
import { X } from 'lucide-react';
import { useCommandRunner } from './useCommandRunner';
import { useFocusTrap } from '../hooks/useFocusTrap';

type FeeType = 'percentage' | 'fixed' | 'hybrid';

interface UpdateRefereeRelationshipDialogProps {
  relationshipId: string;
  initialFeeType: FeeType;
  initialFeePercentage?: number | null;
  initialFeeFixedAmount?: number | null;
  initialApplyByDefault: boolean;
  initialNotes?: string | null;
  onClose: () => void;
}

export function UpdateRefereeRelationshipDialog({
  relationshipId,
  initialFeeType,
  initialFeePercentage,
  initialFeeFixedAmount,
  initialApplyByDefault,
  initialNotes,
  onClose
}: UpdateRefereeRelationshipDialogProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);

  const [feeType, setFeeType] = useState<FeeType>(initialFeeType);
  const [feePercentage, setFeePercentage] = useState(
    initialFeePercentage != null ? String(initialFeePercentage) : ''
  );
  const [feeFixedAmount, setFeeFixedAmount] = useState(
    initialFeeFixedAmount != null ? String(initialFeeFixedAmount) : ''
  );
  const [applyByDefault, setApplyByDefault] = useState(initialApplyByDefault);
  const [notes, setNotes] = useState(initialNotes ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: Record<string, unknown> = {
      relationshipId,
      feeType,
      applyByDefault,
      notes: notes.trim() || null
    };

    if (feeType === 'percentage' || feeType === 'hybrid') {
      const pct = parseFloat(feePercentage);
      if (isNaN(pct) || pct <= 0 || pct > 100) {
        alert('Percentage must be between 0 and 100');
        return;
      }
      payload.feePercentage = pct;
    }

    if (feeType === 'fixed' || feeType === 'hybrid') {
      const amt = parseFloat(feeFixedAmount);
      if (isNaN(amt) || amt <= 0) {
        alert('Fixed amount must be greater than 0');
        return;
      }
      payload.feeFixedAmount = amt;
    }

    const result = await runCommand('updateRefereeRelationship', payload, 'Update referee relationship');
    if (result.ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Update Referee Relationship</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="urr-fee-type">Fee Structure</label>
            <select
              id="urr-fee-type"
              value={feeType}
              onChange={(e) => setFeeType(e.target.value as FeeType)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="percentage">Percentage of transaction</option>
              <option value="fixed">Fixed amount per transaction</option>
              <option value="hybrid">Both percentage + fixed</option>
            </select>
          </div>

          {(feeType === 'percentage' || feeType === 'hybrid') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="urr-percentage">Percentage (%)</label>
              <input
                id="urr-percentage"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={feePercentage}
                onChange={(e) => setFeePercentage(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-2"
                placeholder="5.0"
              />
            </div>
          )}

          {(feeType === 'fixed' || feeType === 'hybrid') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="urr-fixed">Fixed Amount ($)</label>
              <input
                id="urr-fixed"
                type="number"
                step="0.01"
                min="0"
                value={feeFixedAmount}
                onChange={(e) => setFeeFixedAmount(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-2"
                placeholder="25.00"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="urr-apply-default"
              checked={applyByDefault}
              onChange={(e) => setApplyByDefault(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <label htmlFor="urr-apply-default" className="text-sm text-zinc-700">
              Apply by default to transactions
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="urr-notes">Notes (optional)</label>
            <textarea
              id="urr-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button type="submit" disabled={isRunning} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {isRunning ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
