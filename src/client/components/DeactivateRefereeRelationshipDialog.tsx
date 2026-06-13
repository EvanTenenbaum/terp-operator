import { useState } from 'react';
import { useCommandRunner } from './useCommandRunner';
import { FormDialog, FormField } from './templates';

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
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMsg('A reason is required to deactivate a relationship.');
      return;
    }
    setErrorMsg(null);
    const result = await runCommand('deactivateRefereeRelationship', { relationshipId }, reason.trim());
    if (result.ok) onClose();
  }

  return (
    <FormDialog
      title="Deactivate Relationship"
      titleId="drr-title"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Deactivate"
      pendingLabel="Deactivating..."
      pending={isRunning}
      error={errorMsg}
      maxWidthClass="max-w-md"
      description={
        <>
          Deactivate referee relationship with <strong>{entityName}</strong>? This will prevent new fees from accruing under this relationship.
        </>
      }
    >
      <FormField id="drr-reason" label="Reason">
        <textarea
          id="drr-reason"
          value={reason}
          onChange={(e) => { setReason(e.target.value); if (errorMsg) setErrorMsg(null); }}
          className={`w-full rounded border border-zinc-300 px-3 py-2${errorMsg ? ' input-error' : ''}`}
          rows={3}
          placeholder="Why is this relationship being deactivated?"
        />
      </FormField>
    </FormDialog>
  );
}
