import { useState } from 'react';
import { Ban } from 'lucide-react';
import { trpc } from '../api/trpc';
import { VoidRefereeCreditDialog } from './VoidRefereeCreditDialog';

interface RefereeCreditsListProps {
  refereeId: string;
}

// Shape returned by `refereeCredits` query (queries.ts:796-820).
interface CreditRow {
  id: string;
  transactionType: string;
  transactionNo: string;
  transactionTotal: string;
  creditAmount: string;
  amountPaid: string;
  status: string;
  voidedAt: string | null;
  voidedReason: string | null;
  createdAt: string;
}

export function RefereeCreditsList({ refereeId }: RefereeCreditsListProps) {
  const credits = trpc.queries.refereeCredits.useQuery({ refereeId });
  const [voiding, setVoiding] = useState<CreditRow | null>(null);

  const rows = (credits.data ?? []) as unknown as CreditRow[];

  if (credits.isLoading) {
    return <div className="p-4 text-sm text-zinc-500">Loading credits...</div>;
  }
  if (rows.length === 0) {
    return <div className="p-4 text-sm text-zinc-500">No credits accrued yet.</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">Transaction</th>
            <th className="px-3 py-2">Credit</th>
            <th className="px-3 py-2">Paid</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Created</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const isVoided = !!c.voidedAt;
            return (
              <tr key={c.id} className={`border-t border-zinc-100 ${isVoided ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2">
                  <div className="font-medium">{c.transactionNo}</div>
                  <div className="text-xs text-zinc-500">{c.transactionType}</div>
                </td>
                <td className="px-3 py-2">${Number(c.creditAmount).toFixed(2)}</td>
                <td className="px-3 py-2">${Number(c.amountPaid).toFixed(2)}</td>
                <td className="px-3 py-2">
                  {isVoided ? (
                    <span className="text-amber-700" title={c.voidedReason ?? undefined}>
                      Voided
                    </span>
                  ) : (
                    <span>{c.status}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-500">{c.createdAt}</td>
                <td className="px-3 py-2 text-right">
                  {!isVoided && c.status === 'accrued' && (
                    <button
                      onClick={() => setVoiding(c)}
                      className="secondary-button compact-action"
                      title="Void credit"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Void
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {voiding && (
        <VoidRefereeCreditDialog
          creditId={voiding.id}
          transactionNo={voiding.transactionNo}
          creditAmount={Number(voiding.creditAmount)}
          onClose={() => setVoiding(null)}
        />
      )}
    </div>
  );
}
