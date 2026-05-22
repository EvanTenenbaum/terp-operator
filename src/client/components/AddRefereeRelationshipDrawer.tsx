import { X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useCommandRunner } from './useCommandRunner';

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

  const drawerRef = useFocusTrap<HTMLElement>(isOpen, onClose);

  const showPercentage = feeType === 'percentage' || feeType === 'hybrid';
  const showFixed = feeType === 'fixed' || feeType === 'hybrid';

  const isSubmitDisabled =
    isRunning ||
    (mode === 'existing' && !selectedRefereeId) ||
    (mode === 'new' && !name.trim()) ||
    (showPercentage && !feePercentage) ||
    (showFixed && !feeFixedAmount);

  async function handleSubmit() {
    let refereeId = selectedRefereeId;

    if (mode === 'new') {
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

    onSuccess(relResult.affectedIds[0]);
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        ref={drawerRef}
        className="fixed top-0 right-0 h-screen w-[440px] bg-white shadow-2xl z-50 flex flex-col overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Add referee relationship"
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add referee credit</h2>
            {vendorName && (
              <p className="text-sm text-gray-500 mt-0.5">Vendor: {vendorName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="Close"
            type="button"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </header>

        {/* Mode toggle */}
        <div className="flex border-b border-gray-200 px-6 pt-4 gap-2 pb-0">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'existing'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setMode('existing')}
            disabled={referees.length === 0}
            title={referees.length === 0 ? 'No existing referees for this vendor' : undefined}
          >
            Use existing referee
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'new'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setMode('new')}
          >
            Create new referee
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 px-6 py-4 space-y-4">
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
                {referees.map((r) => (
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

          {/* Submit */}
          <div className="pt-2">
            <button
              type="button"
              className="primary-button w-full"
              disabled={isSubmitDisabled}
              onClick={() => void handleSubmit()}
            >
              {isRunning ? 'Saving…' : 'Add referee credit'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
