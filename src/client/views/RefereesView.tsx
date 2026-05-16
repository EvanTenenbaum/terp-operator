import { Plus } from 'lucide-react';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import type { GridRow } from '../../shared/types';

const columns: ColDef<GridRow>[] = [
  { field: 'name', headerName: 'Referee Name', pinned: 'left', width: 200 },
  { field: 'email', width: 200 },
  { field: 'phone', width: 150 },
  { field: 'balance', type: 'numericColumn', width: 130, headerName: 'Balance' },
  { field: 'lifetimeEarned', type: 'numericColumn', width: 150, headerName: 'Lifetime Earned' },
  { field: 'paymentMethod', headerName: 'Payment Method', width: 150 },
  { field: 'active', width: 100 },
  { field: 'notes', editable: true, minWidth: 250 },
  { field: 'createdAt', width: 180 }
];

export function RefereesView() {
  const grid = trpc.queries.grid.useQuery({ view: 'referees' });
  const { runCommand } = useCommandRunner();

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
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-zinc-900">Referees</h1>
        <button
          onClick={handleCreateReferee}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Referee
        </button>
      </div>
      <div className="flex-1">
        <OperatorGrid
          view="referees"
          title="Referees"
          rows={grid.data ?? []}
          columns={columns}
        />
      </div>
    </div>
  );
}
