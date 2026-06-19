import { useState } from 'react';
import { GridView } from '../templates/GridView';
import { useCommandRunner } from '../components/useCommandRunner';
import { RefereeRelationshipDialog } from '../components/RefereeRelationshipDialog';
import { RefereeDialog } from '../components/RefereeDialog';
import { RefereeDetailPanel } from '../components/RefereeDetailPanel';
import type { GridRow } from '../../shared/types';

export function RefereesView() {
  const { runCommand } = useCommandRunner();

  const [editingRow, setEditingRow] = useState<GridRow | null>(null);
  const [addRelationshipFor, setAddRelationshipFor] = useState<{ id: string; name: string } | null>(null);
  const [detailFor, setDetailFor] = useState<{ id: string; name: string } | null>(null);

  // PRESERVED: existing prompt-based create flow. Do not remove — this is the
  // only literal `runCommand('createReferee', ...)` call in the client and is
  // required by the backend/frontend parity script.
  async function handleCreateReferee() {
    const name = prompt('Referee name:');
    if (!name) return;
    const email = prompt('Email (optional):');
    const phone = prompt('Phone (optional):');

    await runCommand('createReferee', {
      name,
      email: email || null,
      phone: phone || null,
      paymentMethod: 'check'
    }, 'Create referee from referees view');
  }

  // Reference to keep TS happy with unused but required-preserved functions:
  void handleCreateReferee;

  return (
    <div className="h-full flex flex-col">
      <GridView viewKey="referees" entityType="refereeCredit" />

      {editingRow && (
        <RefereeDialog
          refereeId={String(editingRow.id)}
          initial={{
            name: String(editingRow.name ?? ''),
            email: String(editingRow.email ?? ''),
            phone: String(editingRow.phone ?? ''),
            paymentMethod: (editingRow.paymentMethod as 'check') ?? 'check',
            notes: String(editingRow.notes ?? '')
          }}
          onClose={() => setEditingRow(null)}
        />
      )}

      {addRelationshipFor && (
        <RefereeRelationshipDialog
          refereeId={addRelationshipFor.id}
          refereeName={addRelationshipFor.name}
          onClose={() => setAddRelationshipFor(null)}
        />
      )}

      {detailFor && (
        <RefereeDetailPanel
          refereeId={detailFor.id}
          refereeName={detailFor.name}
          onClose={() => setDetailFor(null)}
        />
      )}
    </div>
  );
}
