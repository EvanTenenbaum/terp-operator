import { X } from 'lucide-react';
import { trpc } from '../api/trpc';
import { ProcessorFeesGrid } from './ProcessorFeesGrid';
import { formatMoney } from '../utils/format';

interface ProcessorDetailPanelProps {
  processorId: string;
  processorName: string;
  onClose: () => void;
}

interface ProcessorTotals {
  id: string;
  name: string;
  totalFeesProcessed: string;
  userFeesCollectible: string;
  userFeesCollected: string;
  processorFeesUnpaid: string;
  feeType: string;
  feePercentage: string | null;
  feeFixedAmount: string | null;
}

export function ProcessorDetailPanel({ processorId, processorName, onClose }: ProcessorDetailPanelProps) {
  const totals = trpc.queries.processorWithTotals.useQuery({ processorId });
  const data = totals.data as unknown as ProcessorTotals | null | undefined;

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-[560px] flex-col border-l border-zinc-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div>
          <div className="text-xs font-medium uppercase text-zinc-500">Processor</div>
          <h2 className="text-base font-semibold text-zinc-900">{processorName}</h2>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-zinc-100" aria-label="Close panel">
          <X className="h-5 w-5" />
        </button>
      </header>

      <section className="grid grid-cols-2 gap-px bg-zinc-200 text-sm">
        <div className="bg-white p-3">
          <div className="text-xs text-zinc-500">Total Fees Processed</div>
          <div className="text-lg font-semibold tabular-nums">
            {data ? formatMoney(Number(data.totalFeesProcessed)) : '—'}
          </div>
        </div>
        <div className="bg-white p-3">
          <div className="text-xs text-zinc-500">User Fees Collectible</div>
          <div className="text-lg font-semibold tabular-nums text-amber-700">
            {data ? formatMoney(Number(data.userFeesCollectible)) : '—'}
          </div>
        </div>
        <div className="bg-white p-3">
          <div className="text-xs text-zinc-500">User Fees Collected</div>
          <div className="text-lg font-semibold tabular-nums text-emerald-700">
            {data ? formatMoney(Number(data.userFeesCollected)) : '—'}
          </div>
        </div>
        <div className="bg-white p-3">
          <div className="text-xs text-zinc-500">Processor Fees Unpaid</div>
          <div className="text-lg font-semibold tabular-nums text-amber-700">
            {data ? formatMoney(Number(data.processorFeesUnpaid)) : '—'}
          </div>
        </div>
      </section>

      <div className="border-t border-zinc-200 px-4 py-2 text-xs font-medium uppercase text-zinc-500">Fees</div>
      <div className="flex-1 overflow-auto">
        <ProcessorFeesGrid processorId={processorId} />
      </div>
    </aside>
  );
}
