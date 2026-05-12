import clsx from 'clsx';
import type { KpiMetric } from '../../shared/types';

export function KpiCard({ metric, onOpen }: { metric: KpiMetric; onOpen: (key: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(metric.key)}
      className="group min-h-28 border border-line bg-white p-3 text-left transition hover:border-accent hover:shadow-focus focus:outline-none focus-visible:shadow-focus"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase text-zinc-600">{metric.label}</span>
        <span
          className={clsx('h-3 w-3 border', {
            'bg-emerald-500 border-emerald-700': metric.severity === 'good',
            'bg-amber border-amber': metric.severity === 'watch',
            'bg-red-500 border-red-700': metric.severity === 'bad',
            'bg-zinc-300 border-zinc-500': metric.severity === 'neutral'
          })}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 text-xl font-bold text-ink">{metric.value}</div>
      <p className="mt-2 line-clamp-2 text-xs text-zinc-600">{metric.definition}</p>
    </button>
  );
}
