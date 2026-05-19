import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useCommandRunner } from './useCommandRunner';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface DeactivateRefereeRelationshipDialogProps {
  relationshipId: string;
  entityName: string;
  onClose: () => void;
}

export function DeactivateRefereeRelationshipDialog({
  relationshipId,
  entityName,
  onClose
}: DeactivateRefereeRelationshipDialogProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [reason, setReason] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      alert('A reason is required to deactivate a relationship.');
      return;
    }
    const result = await runCommand('deactivateRefereeRelationship', { relationshipId }, reason.trim());
    if (result.ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-zinc-900">Deactivate Relationship</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-zinc-600">
          Deactivate referee relationship with <strong>{entityName}</strong>? This will prevent new fees from accruing under this relationship.
        </p>
        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="drr-reason">Reason</label>
            <textarea
              id="drr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
              rows={3}
              placeholder="Why is this relationship being deactivated?"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Cancel</button>
            <button type="submit" disabled={isRunning} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {isRunning ? 'Deactivating...' : 'Deactivate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
