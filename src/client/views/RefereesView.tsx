import { FolderOpen, Pencil, Plus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { RefereeRelationshipDialog } from '../components/RefereeRelationshipDialog';
import { RefereeDialog } from '../components/RefereeDialog';
import { RefereeDetailPanel } from '../components/RefereeDetailPanel';
import type { GridRow } from '../../shared/types';

const columns: ColDef<GridRow>[] = [
  { field: 'name', headerName: 'Referee Name', pinned: 'left', width: 200 },
  { field: 'email', width: 200 },
  { field: 'phone', width: 150 },
  { field: 'balance', type: 'numericColumn', width: 130, headerName: 'Balance' },
  { field: 'lifetimeEarned', type: 'numericColumn', width: 150, headerName: 'Lifetime Earned' },
  { field: 'relationshipsCount', headerName: 'Relationships', type: 'numericColumn', width: 140 },
  { field: 'paymentMethod', headerName: 'Payment Method', width: 150 },
  { field: 'active', width: 100 },
  { field: 'notes', editable: true, minWidth: 250 },
  { field: 'createdAt', width: 180 }
];

export function RefereesView() {
  const grid = trpc.queries.grid.useQuery({ view: 'referees' });
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-zinc-900">Referees</h1>
        <div className="flex gap-2">
          <button
            onClick={handleCreateReferee}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Referee
          </button>
        </div>
      </div>
      <div className="flex-1">
        <OperatorGrid
          view="referees"
          title="Referees"
          rows={grid.data ?? []}
          columns={columns}
          selectionActions={(rows) => {
            const first = rows[0];
            const refereeId = first ? String(first.id) : '';
            const refereeName = first ? String(first.name) : '';
            return (
              <>
                <button
                  className="secondary-button compact-action"
                  disabled={!first}
                  onClick={() => first && setEditingRow(first)}
                  type="button"
                >
                  <Pencil className="h-4 w-4" />
                  Edit Referee
                </button>
                <button
                  className="secondary-button compact-action"
                  disabled={!first}
                  onClick={() => first && setAddRelationshipFor({ id: refereeId, name: refereeName })}
                  type="button"
                >
                  <UserPlus className="h-4 w-4" />
                  Add Relationship
                </button>
                <button
                  className="secondary-button compact-action"
                  disabled={!first}
                  onClick={() => first && setDetailFor({ id: refereeId, name: refereeName })}
                  type="button"
                >
                  <FolderOpen className="h-4 w-4" />
                  Open Details
                </button>
              </>
            );
          }}
        />
      </div>

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
