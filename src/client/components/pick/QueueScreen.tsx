// CAP-030 / TER-1513 — Pick queue mobile screen
// TODO: depends on CAP-030 backend merge (TER-1498)
import type { PickQueueItem } from './pickTypes';

interface Props {
  // TODO: replace with trpc.queries.pickQueue.useQuery() when backend merges
  items: PickQueueItem[];
  loading: boolean;
  onRefresh: () => void;
  onSelect: (item: PickQueueItem) => void;
}

export function QueueScreen({ items, loading, onRefresh, onSelect }: Props) {
  // Sort oldest released first
  const sorted = [...items].sort((a, b) => {
    if (!a.oldestReleasedAt && !b.oldestReleasedAt) return 0;
    if (!a.oldestReleasedAt) return 1;
    if (!b.oldestReleasedAt) return -1;
    return new Date(a.oldestReleasedAt).getTime() - new Date(b.oldestReleasedAt).getTime();
  });

  return (
    <div className="flex min-h-screen flex-col bg-panel">
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-ink">Pick Queue</h1>
        <button
          type="button"
          className="secondary-button compact-action"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh pick queue"
        >
          {loading ? '…' : '↻ Refresh'}
        </button>
      </header>

      {/* TODO: depends on CAP-030 backend merge (TER-1498) — items will come from trpc.queries.pickQueue */}
      {sorted.length === 0 && !loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-base font-medium text-zinc-600">No pick lists in queue</p>
          <p className="text-sm text-zinc-400">Pull down to refresh or check back later.</p>
          <button type="button" className="secondary-button mt-2" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-1 px-4 py-4 text-left hover:bg-zinc-50 active:bg-zinc-100"
                style={{ minHeight: 64 }} // ≥44pt tap target per spec
                onClick={() => onSelect(item)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold text-ink">{item.customer}</span>
                  {item.alertCount > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                      {item.alertCount} alert{item.alertCount !== 1 ? 's' : ''}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-500">
                  <span>{item.pickNo}</span>
                  <span>
                    {item.linesPicked}/{item.lineCount} to pick
                  </span>
                  <span className={
                    item.status === 'ready_to_close' ? 'text-green-700 font-medium' :
                    item.status === 'has_alerts' ? 'text-amber-700 font-medium' :
                    item.status === 'in_progress' ? 'text-blue-700 font-medium' :
                    'text-zinc-400'
                  }>
                    {item.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
