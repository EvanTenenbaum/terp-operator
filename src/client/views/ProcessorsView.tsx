import { Plus } from 'lucide-react';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import type { GridRow } from '../../shared/types';

const columns: ColDef<GridRow>[] = [
  { field: 'name', headerName: 'Processor Name', pinned: 'left', width: 200 },
  { field: 'processorType', headerName: 'Type', width: 120 },
  {
    field: 'feeFormula',
    headerName: 'Fee Formula',
    width: 180,
    valueGetter: (params) => {
      const row = params.data;
      if (!row) return '';

      if (row.feeType === 'percentage') {
        return `${row.feePercentage}%`;
      } else if (row.feeType === 'fixed') {
        return `$${Number(row.feeFixedAmount).toFixed(2)}`;
      } else {
        return `${row.feePercentage}% + $${Number(row.feeFixedAmount).toFixed(2)}`;
      }
    }
  },
  {
    field: 'defaultSplit',
    headerName: 'Default Split',
    width: 180,
    valueGetter: (params) => {
      const row = params.data;
      if (!row) return '';
      return `User ${row.defaultUserSplit}% / Proc ${row.defaultProcessorSplit}%`;
    }
  },
  { field: 'totalFeesProcessed', headerName: 'Total Fees', type: 'numericColumn', width: 130 },
  { field: 'userFeesCollectible', headerName: 'User Collectible', type: 'numericColumn', width: 150 },
  { field: 'userFeesCollected', headerName: 'User Collected', type: 'numericColumn', width: 150 },
  { field: 'processorFeesUnpaid', headerName: 'Proc Unpaid', type: 'numericColumn', width: 130 },
  { field: 'active', width: 100 },
  { field: 'createdAt', width: 180 }
];

export function ProcessorsView() {
  const grid = trpc.queries.grid.useQuery({ view: 'processors' });
  const { runCommand } = useCommandRunner();

  async function handleCreateProcessor() {
    const name = prompt('Processor name:');
    if (!name) return;

    const processorType = prompt('Processor type (crypto/check/wire):');
    if (!processorType) return;

    const feeType = prompt('Fee type (percentage/fixed/hybrid):');
    if (!feeType) return;

    let feePercentage = null;
    let feeFixedAmount = null;

    if (feeType === 'percentage' || feeType === 'hybrid') {
      feePercentage = Number(prompt('Fee percentage (e.g., 3.5):'));
    }

    if (feeType === 'fixed' || feeType === 'hybrid') {
      feeFixedAmount = Number(prompt('Fixed fee amount (e.g., 0.30):'));
    }

    const defaultUserSplit = Number(prompt('Default user split % (e.g., 25):'));
    const defaultProcessorSplit = 100 - defaultUserSplit;

    await runCommand('createPaymentProcessor', {
      name,
      processorType,
      feeType,
      feePercentage,
      feeFixedAmount,
      defaultUserSplit,
      defaultProcessorSplit
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-zinc-900">Payment Processors</h1>
        <div className="flex gap-2">
          <button
            onClick={handleCreateProcessor}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Processor
          </button>
        </div>
      </div>
      <div className="flex-1">
        <OperatorGrid
          view="processors"
          title="Payment Processors"
          rows={grid.data ?? []}
          columns={columns}
        />
      </div>
    </div>
  );
}
