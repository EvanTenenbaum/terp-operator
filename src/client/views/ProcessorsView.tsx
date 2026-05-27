import { FolderOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColDef } from 'ag-grid-community';
import { trpc } from '../api/trpc';
import { OperatorGrid } from '../components/OperatorGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { ProcessorDetailPanel } from '../components/ProcessorDetailPanel';
import type { GridRow } from '../../shared/types';
import { formatMoney } from '../utils/format';

export function ProcessorsView() {
  const navigate = useNavigate();
  const grid = trpc.queries.grid.useQuery({ view: 'processors' });
  const activeProcessors = trpc.queries.activeProcessors.useQuery();
  const { runCommand } = useCommandRunner();
  const [detailFor, setDetailFor] = useState<{ id: string; name: string } | null>(null);

  const columns: ColDef<GridRow>[] = [
    {
      field: 'name',
      headerName: 'Processor Name',
      pinned: 'left',
      width: 200,
      cellRenderer: (params: { data: GridRow; value: string }) =>
        params.data?.contactId ? (
          <button
            className="text-button font-medium text-left"
            onClick={() => navigate(`/contacts/${String(params.data.contactId)}`)}
            type="button"
          >
            {params.value}
          </button>
        ) : (
          <span>{params.value}</span>
        )
    },
    { field: 'processorType', headerName: 'Type', width: 120 },
    {
      field: 'feeFormula',
      headerName: 'Fee Formula',
      width: 180,
      valueGetter: (params) => {
        const row = params.data;
        if (!row) return '';
        if (row.feeType === 'percentage') return `${row.feePercentage}%`;
        if (row.feeType === 'fixed') return formatMoney(Number(row.feeFixedAmount));
        return `${row.feePercentage}% + ${formatMoney(Number(row.feeFixedAmount))}`;
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

  const activeCount = activeProcessors.data?.length ?? 0;

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
    }, 'Create payment processor from processors view');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-zinc-900">Payment Processors</h1>
          <span
            className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
            title="Number of active processors (from queries.activeProcessors)"
          >
            {activeCount} active
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCreateProcessor}
            className="btn-primary"
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
          selectionActions={(rows) => {
            const first = rows[0];
            return (
              <button
                className="secondary-button compact-action"
                disabled={!first}
                onClick={() => first && setDetailFor({ id: String(first.id), name: String(first.name) })}
                type="button"
              >
                <FolderOpen className="h-4 w-4" />
                Open Details
              </button>
            );
          }}
        />
      </div>

      {detailFor && (
        <ProcessorDetailPanel
          processorId={detailFor.id}
          processorName={detailFor.name}
          onClose={() => setDetailFor(null)}
        />
      )}
    </div>
  );
}
