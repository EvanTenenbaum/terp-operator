import { useState } from 'react';
import { X } from 'lucide-react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';

interface RefereeRelationshipDialogProps {
  refereeId: string;
  refereeName: string;
  onClose: () => void;
}

export function RefereeRelationshipDialog({ refereeId, refereeName, onClose }: RefereeRelationshipDialogProps) {
  const reference = trpc.queries.reference.useQuery();
  const { runCommand, isRunning } = useCommandRunner();

  const [entityType, setEntityType] = useState<'customer' | 'vendor'>('customer');
  const [entityId, setEntityId] = useState('');
  const [feeType, setFeeType] = useState<'percentage' | 'fixed' | 'hybrid'>('percentage');
  const [feePercentage, setFeePercentage] = useState('5.0');
  const [feeFixedAmount, setFeeFixedAmount] = useState('');
  const [applyByDefault, setApplyByDefault] = useState(true);
  const [notes, setNotes] = useState('');

  const entities = entityType === 'customer'
    ? (reference.data?.customers ?? [])
    : (reference.data?.vendors ?? []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!entityId) {
      alert(`Please select a ${entityType}`);
      return;
    }

    const payload: Record<string, unknown> = {
      refereeId,
      entityType,
      entityId,
      feeType,
      applyByDefault,
      notes: notes || null
    };

    if (feeType === 'percentage' || feeType === 'hybrid') {
      const pct = parseFloat(feePercentage);
      if (!pct || pct <= 0 || pct > 100) {
        alert('Percentage must be between 0 and 100');
        return;
      }
      payload.feePercentage = pct;
    }

    if (feeType === 'fixed' || feeType === 'hybrid') {
      const amt = parseFloat(feeFixedAmount);
      if (!amt || amt <= 0) {
        alert('Fixed amount must be greater than 0');
        return;
      }
      payload.feeFixedAmount = amt;
    }

    const result = await runCommand('addRefereeRelationship', payload);
    if (result.ok) {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            Add Referee Relationship
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-zinc-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-zinc-600">
          Link <strong>{refereeName}</strong> to a customer or vendor
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Entity Type
            </label>
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value as 'customer' | 'vendor');
                setEntityId('');
              }}
              className="w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="customer">Customer</option>
              <option value="vendor">Vendor</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              {entityType === 'customer' ? 'Customer' : 'Vendor'}
            </label>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
              required
            >
              <option value="">Choose {entityType}</option>
              {entities.map((entity: any) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Fee Structure
            </label>
            <select
              value={feeType}
              onChange={(e) => setFeeType(e.target.value as 'percentage' | 'fixed' | 'hybrid')}
              className="w-full rounded border border-zinc-300 px-3 py-2"
            >
              <option value="percentage">Percentage of transaction</option>
              <option value="fixed">Fixed amount per transaction</option>
              <option value="hybrid">Both percentage + fixed</option>
            </select>
          </div>

          {(feeType === 'percentage' || feeType === 'hybrid') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Percentage (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={feePercentage}
                onChange={(e) => setFeePercentage(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-2"
                placeholder="5.0"
                required
              />
            </div>
          )}

          {(feeType === 'fixed' || feeType === 'hybrid') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Fixed Amount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={feeFixedAmount}
                onChange={(e) => setFeeFixedAmount(e.target.value)}
                className="w-full rounded border border-zinc-300 px-3 py-2"
                placeholder="25.00"
                required
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="applyByDefault"
              checked={applyByDefault}
              onChange={(e) => setApplyByDefault(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <label htmlFor="applyByDefault" className="text-sm text-zinc-700">
              Apply by default to transactions
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
              rows={2}
              placeholder="Additional notes about this relationship"
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
              {isRunning ? 'Creating...' : 'Create Relationship'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
