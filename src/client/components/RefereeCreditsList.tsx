import { useState } from 'react';
import { Ban, DollarSign } from 'lucide-react';
import { trpc } from '../api/trpc';
import { VoidRefereeCreditDialog } from './VoidRefereeCreditDialog';
import { formatMoney } from '../utils/format';

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

// UX-Q06(c) — payout command check: the backend has `processRefereePayout` in
// refereeCommands.ts / commandBus.ts but it is NOT in the commandCatalog.
// Per spec: ship a disabled-with-reason action citing the tracked ticket (CAP-039).

export function RefereeCreditsList({ refereeId }: RefereeCreditsListProps) {
  const credits = trpc.payments.refereeCredits.useQuery({ refereeId });
  const [voiding, setVoiding] = useState<CreditRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const rows = (credits.data ?? []) as unknown as CreditRow[];

  // UX-Q06(a) — credit-ledger totals strip: accrued / paid / void totals
  const accrued = rows.filter((r) => !r.voidedAt && r.status === 'accrued');
  const paid = rows.filter((r) => r.amountPaid && Number(r.amountPaid) > 0 && !r.voidedAt);
  const voided = rows.filter((r) => !!r.voidedAt);
  const totalAccrued = accrued.reduce((sum, r) => sum + Number(r.creditAmount ?? 0), 0);
  const totalPaid = paid.reduce((sum, r) => sum + Number(r.amountPaid ?? 0), 0);
  const totalVoid = voided.reduce((sum, r) => sum + Number(r.creditAmount ?? 0), 0);

  // UX-Q06(c) — selected accrued credits for bulk pay totals strip
  const selectedAccruedRows = accrued.filter((r) => selectedIds.has(r.id));
  const selectedAccruedTotal = selectedAccruedRows.reduce((sum, r) => sum + Number(r.creditAmount ?? 0), 0);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (credits.isLoading) {
    return <div className="p-4 text-sm text-zinc-500">Loading credits...</div>;
  }
  if (rows.length === 0) {
    return <div className="p-4 text-sm text-zinc-500">No credits accrued yet.</div>;
  }

  return (
    <div className="overflow-auto">
      {/* UX-Q06(a) — credit-ledger totals strip */}
      <div className="flex gap-4 border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-xs" data-testid="credits-totals-strip">
        <span className="flex items-center gap-1 text-zinc-700">
          <DollarSign className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
          <span className="font-medium text-amber-700" data-testid="credits-total-accrued">{formatMoney(totalAccrued)}</span>
          <span className="text-zinc-500">accrued</span>
        </span>
        <span className="flex items-center gap-1 text-zinc-700">
          <DollarSign className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
          <span className="font-medium text-green-700" data-testid="credits-total-paid">{formatMoney(totalPaid)}</span>
          <span className="text-zinc-500">paid</span>
        </span>
        <span className="flex items-center gap-1 text-zinc-700">
          <DollarSign className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
          <span className="font-medium text-zinc-500" data-testid="credits-total-void">{formatMoney(totalVoid)}</span>
          <span className="text-zinc-500">void</span>
        </span>
      </div>
<table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
          <tr>
            {/* UX-Q06(c): checkbox column for bulk pay selection */}
            <th className="w-8 px-2 py-2"></th>
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
            const isAccrued = !isVoided && c.status === 'accrued';
            return (
              <tr key={c.id} className={`border-t border-zinc-100 ${isVoided ? 'opacity-50' : ''}`}>
                <td className="w-8 px-2 py-2">
                  {isAccrued ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelected(c.id)}
                      aria-label={`Select credit ${c.transactionNo}`}
                      data-testid={`credit-checkbox-${c.id}`}
                    />
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{c.transactionNo}</div>
                  <div className="text-xs text-zinc-500">{c.transactionType}</div>
                </td>
                <td className="px-3 py-2">{formatMoney(Number(c.creditAmount))}</td>
                <td className="px-3 py-2">{formatMoney(Number(c.amountPaid))}</td>
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
                  {isAccrued && (
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
