import { useState } from 'react';
import { useCommandRunner } from './useCommandRunner';
import { FormDialog, FormField } from './templates';

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

  const [feeType, setFeeType] = useState<FeeType>(initialFeeType);
  const [feePercentage, setFeePercentage] = useState(
    initialFeePercentage != null ? String(initialFeePercentage) : ''
  );
  const [feeFixedAmount, setFeeFixedAmount] = useState(
    initialFeeFixedAmount != null ? String(initialFeeFixedAmount) : ''
  );
  const [applyByDefault, setApplyByDefault] = useState(initialApplyByDefault);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        setErrorMsg('Percentage must be between 0 and 100');
        return;
      }
      payload.feePercentage = pct;
    }

    if (feeType === 'fixed' || feeType === 'hybrid') {
      const amt = parseFloat(feeFixedAmount);
      if (isNaN(amt) || amt <= 0) {
        setErrorMsg('Fixed amount must be greater than 0');
        return;
      }
      payload.feeFixedAmount = amt;
    }

    setErrorMsg(null);
    const result = await runCommand('updateRefereeRelationship', payload, 'Update referee relationship');
    if (result.ok) onClose();
  }

  return (
    <FormDialog
      title="Update Referee Relationship"
      titleId="urr-title"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Save Changes"
      pendingLabel="Saving..."
      pending={isRunning}
      error={errorMsg}
    >
      <FormField id="urr-fee-type" label="Fee Structure">
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
      </FormField>

      {(feeType === 'percentage' || feeType === 'hybrid') && (
        <FormField id="urr-percentage" label="Percentage (%)">
          <input
            id="urr-percentage"
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={feePercentage}
            onChange={(e) => { setFeePercentage(e.target.value); if (errorMsg) setErrorMsg(null); }}
            className={`w-full rounded border border-zinc-300 px-3 py-2${errorMsg ? ' input-error' : ''}`}
            placeholder="5.0"
          />
        </FormField>
      )}

      {(feeType === 'fixed' || feeType === 'hybrid') && (
        <FormField id="urr-fixed" label="Fixed Amount ($)">
          <input
            id="urr-fixed"
            type="number"
            step="0.01"
            min="0"
            value={feeFixedAmount}
            onChange={(e) => { setFeeFixedAmount(e.target.value); if (errorMsg) setErrorMsg(null); }}
            className={`w-full rounded border border-zinc-300 px-3 py-2${errorMsg ? ' input-error' : ''}`}
            placeholder="25.00"
          />
        </FormField>
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

      <FormField id="urr-notes" label="Notes (optional)">
        <textarea
          id="urr-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2"
          rows={2}
        />
      </FormField>
    </FormDialog>
  );
}
