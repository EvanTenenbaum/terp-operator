import { useState } from 'react';
import { Check, ToggleLeft, ToggleRight } from 'lucide-react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';

interface ProcessorFeesGridProps {
  processorId: string;
}

interface FeeRow {
  id: string;
  processorId: string;
  saleId: string | null;
  paymentId: string | null;
  processingFeeTotal: string;
  userFeeShare: string;
  processorFeeShare: string;
  userFeeStatus: 'collectible' | 'collected';
  processorFeeStatus: 'paid' | 'unpaid';
  createdAt: string;
}

const PAGE_LIMIT = 200;

export function ProcessorFeesGrid({ processorId }: ProcessorFeesGridProps) {
  const [userFilter, setUserFilter] = useState<'all' | 'collectible' | 'collected'>('all');
  const [procFilter, setProcFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const { runCommand, isRunning } = useCommandRunner();

  const query = trpc.queries.processorFees.useQuery({
    processorId,
    userFeeStatus: userFilter === 'all' ? undefined : userFilter,
    processorFeeStatus: procFilter === 'all' ? undefined : procFilter
  });

  const rows = (query.data ?? []) as unknown as FeeRow[];
  const truncated = rows.length === PAGE_LIMIT;

  async function handleMarkCollected(feeId: string) {
    await runCommand('markUserFeeCollected', { processorFeeId: feeId });
  }

  async function handleToggleProcStatus(feeId: string, current: 'paid' | 'unpaid') {
    const next: 'paid' | 'unpaid' = current === 'paid' ? 'unpaid' : 'paid';
    await runCommand('updateProcessorFeeStatus', { processorFeeId: feeId, status: next });
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-zinc-600">User:</span>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value as typeof userFilter)}
            className="rounded border border-zinc-300 px-2 py-1"
          >
            <option value="all">All</option>
            <option value="collectible">Collectible</option>
            <option value="collected">Collected</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-zinc-600">Processor:</span>
          <select
            value={procFilter}
            onChange={(e) => setProcFilter(e.target.value as typeof procFilter)}
            className="rounded border border-zinc-300 px-2 py-1"
          >
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </label>
      </div>

      {truncated && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Showing first {PAGE_LIMIT} fees — apply filters to narrow.
        </div>
      )}

      {query.isLoading ? (
        <div className="p-4 text-sm text-zinc-500">Loading fees...</div>
      ) : rows.length === 0 ? (
        <div className="p-4 text-sm text-zinc-500">No fees match the current filters.</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">User Share</th>
                <th className="px-3 py-2">User Status</th>
                <th className="px-3 py-2">Proc Share</th>
                <th className="px-3 py-2">Proc Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-xs text-zinc-600">{new Date(f.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2 tabular-nums">${Number(f.processingFeeTotal).toFixed(2)}</td>
                  <td className="px-3 py-2 tabular-nums">${Number(f.userFeeShare).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    {f.userFeeStatus === 'collected' ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Collected</span>
                    ) : (
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">Collectible</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">${Number(f.processorFeeShare).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    {f.processorFeeStatus === 'paid' ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Paid</span>
                    ) : (
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Unpaid</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      {f.userFeeStatus === 'collectible' && (
                        <button
                          className="secondary-button compact-action"
                          disabled={isRunning}
                          onClick={() => handleMarkCollected(f.id)}
                          title="Mark user fee collected"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Mark Collected
                        </button>
                      )}
                      <button
                        className="secondary-button compact-action"
                        disabled={isRunning}
                        onClick={() => handleToggleProcStatus(f.id, f.processorFeeStatus)}
                        title={`Toggle to ${f.processorFeeStatus === 'paid' ? 'unpaid' : 'paid'}`}
                      >
                        {f.processorFeeStatus === 'paid' ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                        Toggle
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
