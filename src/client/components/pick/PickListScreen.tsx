// CAP-030 / TER-1513 — Pick list detail mobile screen
// TODO: depends on CAP-030 backend merge (TER-1498)
import { useNavigate } from 'react-router-dom';
import type { PickLine, PickListWithLines } from './pickTypes';
import { useUiStore } from '../../store/uiStore';

interface Props {
  pickList: PickListWithLines | null;
  loading: boolean;
  onBack: () => void;
  onSelectLine: (line: PickLine) => void;
  // GH #347: callback fired when operator taps 'Complete Order' after all lines are packed
  onCompleteOrder?: () => void;
  isCompletingOrder?: boolean;
}

function statusColor(status: string) {
  if (status === 'packed') return 'bg-green-100 text-green-800';
  if (status === 'picking') return 'bg-blue-100 text-blue-800';
  if (status === 'hold') return 'bg-amber-100 text-amber-800';
  if (status === 'cancelled') return 'bg-red-100 text-red-800';
  return 'bg-zinc-100 text-zinc-600';
}

export function PickListScreen({ pickList, loading, onBack, onSelectLine, onCompleteOrder, isCompletingOrder }: Props) {
  const navigate = useNavigate();
  const setGridFilter = useUiStore((state) => state.setGridFilter);

  // UX-M01: deep-link to Recovery prefiltered by the pick list id
  function handlePickListHistory() {
    if (!pickList?.pickListId) return;
    setGridFilter('recovery', pickList.pickListId);
    navigate('/recovery');
  }

  // GH #347: show 'Complete Order' when all lines are packed or cancelled
  const lines = pickList?.lines ?? [];
  const allPacked = !loading && lines.length > 0 && lines.every((l) => l.status === 'packed' || l.status === 'cancelled');

  if (!pickList && !loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-8">
        <p className="text-zinc-500">No pick list loaded.</p>
        <button type="button" className="secondary-button mt-4" onClick={onBack}>Back</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-panel">
      <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
        <button
          type="button"
          className="icon-button"
          onClick={onBack}
          aria-label="Back to queue"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          ←
        </button>
        <div>
          <h1 className="text-base font-semibold text-ink">{pickList?.customer ?? '…'}</h1>
          <p className="text-xs text-zinc-500">{pickList?.pickNo ?? ''}</p>
        </div>
        <span className="ml-auto text-sm text-zinc-500">
          {pickList ? `${lines.filter((l) => l.status === 'packed').length}/${lines.length} packed` : ''}
        </span>
        {/* UX-M01: recovery affordance for pick list */}
        {pickList ? (
          <button
            type="button"
            className="secondary-button ml-2 text-xs"
            style={{ minHeight: 32, padding: '0 8px' }}
            data-testid="pick-list-recovery-link"
            onClick={handlePickListHistory}
            title="View command history for this pick list in Recovery"
          >
            History
          </button>
        ) : null}
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-zinc-400">Loading…</p>
        </div>
      ) : (
        <>
            {/* Scenario C — amber banner when any line has unacknowledged alerts */}
            {lines.some((l) => l.alertCount > 0) ? (
              <div
                className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                role="alert"
              >
                <span className="text-base">⚠️</span>
                <span>Sales updated this order — check flagged lines.</span>
              </div>
            ) : null}
          <ul className="divide-y divide-line">
            {lines.map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 px-4 py-4 text-left hover:bg-zinc-50 active:bg-zinc-100"
                  style={{ minHeight: 64 }}
                  onClick={() => onSelectLine(line)}
                  disabled={line.status === 'cancelled' || line.status === 'packed'}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-base font-medium text-ink">{line.itemName}</p>
                      <p className="text-xs text-zinc-500">{line.batchCode}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusColor(line.status)}`}>
                        {line.status}
                      </span>
                      {line.alertCount > 0 ? (
                        <span
                          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"
                          aria-label={`${line.alertCount} alert${line.alertCount !== 1 ? 's' : ''}`}
                        >
                          {line.alertCount}⚠
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-zinc-700">
                    Exp {line.expectedQty} {line.actualQty != null ? `· Got ${line.actualQty}` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {/* GH #347: Complete Order CTA — sticky, shown only when all lines are packed/cancelled */}
          {allPacked && onCompleteOrder ? (
            <div className="sticky bottom-0 border-t border-line bg-white px-4 py-4">
              <p className="mb-2 text-center text-sm font-medium text-green-700">
                ✓ All lines packed — ready to complete
              </p>
              <button
                type="button"
                className="primary-button w-full"
                style={{ minHeight: 56, fontSize: 18 }}
                disabled={isCompletingOrder}
                onClick={onCompleteOrder}
              >
                {isCompletingOrder ? 'Completing…' : '🚚 Complete Order'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
