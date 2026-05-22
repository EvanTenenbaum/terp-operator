// CAP-030 / TER-1513 — Pick list detail mobile screen
// TODO: depends on CAP-030 backend merge (TER-1498)
import type { PickLine, PickListWithLines } from './pickTypes';

interface Props {
  pickList: PickListWithLines | null;
  loading: boolean;
  onBack: () => void;
  onSelectLine: (line: PickLine) => void;
}

function statusColor(status: string) {
  if (status === 'packed') return 'bg-green-100 text-green-800';
  if (status === 'picking') return 'bg-blue-100 text-blue-800';
  if (status === 'hold') return 'bg-amber-100 text-amber-800';
  if (status === 'cancelled') return 'bg-red-100 text-red-800';
  return 'bg-zinc-100 text-zinc-600';
}

export function PickListScreen({ pickList, loading, onBack, onSelectLine }: Props) {
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
          {/* TODO: depends on CAP-030 backend merge (TER-1498) */}
          {pickList ? `${pickList.lines.filter((l) => l.status === 'packed').length}/${pickList.lines.length} packed` : ''}
        </span>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-zinc-400">Loading…</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {(pickList?.lines ?? []).map((line) => (
            <li key={line.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-1 px-4 py-4 text-left hover:bg-zinc-50 active:bg-zinc-100"
                style={{ minHeight: 64 }}
                onClick={() => onSelectLine(line)}
                disabled={line.status === 'cancelled'}
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
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
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
      )}
    </div>
  );
}
