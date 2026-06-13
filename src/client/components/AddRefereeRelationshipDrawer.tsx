import type React from 'react';
import { useEffect, useState } from 'react';
import { useCommandRunner } from './useCommandRunner';
import { FormDialog } from './templates';

interface AddRefereeRelationshipDrawerProps {
  isOpen: boolean;
  vendorId: string;
  vendorName: string;
  referees: Array<{ id: string; name: string }>;
  onSuccess: (newRelationshipId: string) => void;
  onClose: () => void;
}

type Mode = 'existing' | 'new';
type FeeType = 'percentage' | 'fixed' | 'hybrid';

export function AddRefereeRelationshipDrawer({
  isOpen,
  vendorId,
  vendorName,
  referees,
  onSuccess,
  onClose,
}: AddRefereeRelationshipDrawerProps): React.ReactElement | null {
  const { runCommand, isRunning } = useCommandRunner();

  // Local referee list — starts from prop, grows when a new referee is created
  // mid-flow so it appears in the existing select immediately.
  const [localReferees, setLocalReferees] = useState<Array<{ id: string; name: string }>>(referees);

  // After a createReferee succeeds but addRefereeRelationship fails, this
  // holds the already-created referee ID so we can skip step 1 on retry.
  const [pendingRefereeId, setPendingRefereeId] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>(() =>
    referees.length > 0 ? 'existing' : 'new'
  );

  // Existing mode fields
  const [selectedRefereeId, setSelectedRefereeId] = useState('');

  // New referee fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Fee fields (common)
  const [feeType, setFeeType] = useState<FeeType>('percentage');
  const [feePercentage, setFeePercentage] = useState('');
  const [feeFixedAmount, setFeeFixedAmount] = useState('');

  // Sync localReferees when parent refetches and passes a fresh list (e.g.
  // after onSuccess triggers reference.refetch()).
  useEffect(() => {
    setLocalReferees((prev) => {
      // Merge: keep any locally-added pending referee not yet in the prop list.
      const incomingIds = new Set(referees.map((r) => r.id));
      const pendingEntries = prev.filter((r) => !incomingIds.has(r.id));
      return [...referees, ...pendingEntries];
    });
  }, [referees]);

  const showPercentage = feeType === 'percentage' || feeType === 'hybrid';
  const showFixed = feeType === 'fixed' || feeType === 'hybrid';

  const isSubmitDisabled =
    (mode === 'existing' && !selectedRefereeId) ||
    (mode === 'new' && !name.trim()) ||
    (showPercentage && (!feePercentage || Number(feePercentage) <= 0)) ||
    (showFixed && (!feeFixedAmount || Number(feeFixedAmount) <= 0));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitDisabled || isRunning) return;

    let refereeId = selectedRefereeId;

    if (mode === 'new') {
      if (pendingRefereeId) {
        // Step 1 already succeeded in a previous attempt — skip createReferee.
        refereeId = pendingRefereeId;
      } else {
        const result = await runCommand(
          'createReferee',
          {
            name: name.trim(),
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
          },
          'Create new referee for PO credit'
        );
        if (!result.ok || !result.affectedIds[0]) return;
        refereeId = result.affectedIds[0];

        // Step 1 done — preserve ID so retry skips creation, and surface
        // the new referee in the existing-select so the user can see it.
        setPendingRefereeId(refereeId);
        setLocalReferees((prev) => [
          ...prev,
          { id: refereeId, name: name.trim() },
        ]);
        setSelectedRefereeId(refereeId);
        setMode('existing');
        // Fall through to step 2.
      }
    }

    const payload: Record<string, unknown> = {
      refereeId,
      entityType: 'vendor',
      entityId: vendorId,
      feeType,
      applyByDefault: true,
    };
    if (showPercentage) payload.feePercentage = Number(feePercentage);
    if (showFixed) payload.feeFixedAmount = Number(feeFixedAmount);

    const relResult = await runCommand(
      'addRefereeRelationship',
      payload,
      'Add referee relationship to vendor'
    );
    if (!relResult.ok || !relResult.affectedIds[0]) return;

    // Both steps succeeded — clear pending state and notify parent.
    setPendingRefereeId(null);
    try { onSuccess(relResult.affectedIds[0]); } catch { /* parent refetch failed; no action needed */ }
  }

  if (!isOpen) return null;

  return (
    <FormDialog
      title="Add referee credit"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={pendingRefereeId ? 'Complete setup' : 'Add referee credit'}
      pendingLabel="Saving…"
      pending={isRunning}
      submitDisabled={isSubmitDisabled}
      maxWidthClass="max-w-md"
      description={vendorName ? <>Vendor: {vendorName}</> : undefined}
    >
      {/* Mode toggle */}
      <div className="flex border-b border-gray-200 gap-2 pb-0">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === 'existing'
              ? 'border-accent text-accent'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
          onClick={() => setMode('existing')}
          disabled={localReferees.length === 0}
          title={localReferees.length === 0 ? 'No existing referees yet' : undefined}
        >
          Use existing referee
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === 'new'
              ? 'border-accent text-accent'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          onClick={() => setMode('new')}
          disabled={pendingRefereeId !== null}
          title={pendingRefereeId ? 'Referee already created — complete the fee setup above and save' : undefined}
        >
          Create new referee
        </button>
      </div>

      {/* Recovery banner — shown when step 1 succeeded but step 2 failed */}
      {pendingRefereeId && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          Referee saved. The fee link step failed — adjust the fee below and try again. No duplicate referee will be created.
        </div>
      )}

      {/* Existing referee select */}
      {mode === 'existing' && (
        <label className="field-inline">
          Referee
          <select
            className="select"
            value={selectedRefereeId}
            onChange={(e) => setSelectedRefereeId(e.target.value)}
            required
          >
            <option value="">Choose referee</option>
            {localReferees.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* New referee fields */}
      {mode === 'new' && (
        <>
          <label className="field-inline">
            Name
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Referee name"
              required
            />
          </label>
          <label className="field-inline">
            Email (optional)
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="referee@example.com"
            />
          </label>
          <label className="field-inline">
            Phone (optional)
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="555-000-0000"
            />
          </label>
        </>
      )}

      {/* Fee structure — common to both modes */}
      <div className="border-t border-gray-200 pt-4 space-y-3">
        <div className="text-sm font-semibold text-gray-700">Fee structure</div>
        <p className="text-xs text-gray-500 mt-0.5">Calculated on the total order amount, not per line item.</p>

        <label className="field-inline">
          Fee type
          <select
            className="select"
            value={feeType}
            onChange={(e) => setFeeType(e.target.value as FeeType)}
          >
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
            <option value="hybrid">Hybrid (% + fixed)</option>
          </select>
        </label>

        {showPercentage && (
          <label className="field-inline">
            Fee %
            <input
              className="input compact"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={feePercentage}
              onChange={(e) => setFeePercentage(e.target.value)}
              placeholder="e.g. 5"
              required
            />
          </label>
        )}

        {showFixed && (
          <label className="field-inline">
            Fixed amount $
            <input
              className="input compact"
              type="number"
              min="0"
              step="0.01"
              value={feeFixedAmount}
              onChange={(e) => setFeeFixedAmount(e.target.value)}
              placeholder="e.g. 50"
              required
            />
          </label>
        )}
      </div>
    </FormDialog>
  );
}
