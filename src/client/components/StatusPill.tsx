import clsx from 'clsx';

const toneByStatus: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-800 border-slate-300',
  ready: 'bg-amber/10 text-amber border-amber',
  posted: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  confirmed: 'bg-blue-50 text-blue-900 border-blue-300',
  fulfilled: 'bg-emerald-100 text-emerald-950 border-emerald-400',
  needs_fix: 'bg-red-50 text-red-900 border-red-300',
  reversed: 'bg-zinc-100 text-zinc-700 border-zinc-400',
  open: 'bg-sky-50 text-sky-900 border-sky-300',
  scheduled: 'bg-violet-50 text-violet-900 border-violet-300',
  matched: 'bg-blue-50 text-blue-900 border-blue-300',
  accepted: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  held_for_match: 'bg-blue-50 text-blue-900 border-blue-300',
  dismissed: 'bg-zinc-100 text-zinc-700 border-zinc-400',
  paid: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  failed: 'bg-red-100 text-red-950 border-red-400',
  rejected: 'bg-red-50 text-red-900 border-red-300',
  routed: 'bg-indigo-50 text-indigo-900 border-indigo-300',
  archived: 'bg-stone-100 text-stone-800 border-stone-300'
};

const labelByStatus: Record<string, string> = {
  routed: 'in progress'
};

export function StatusPill({ status }: { status?: string | null }) {
  const label = status ?? 'unknown';
  const displayLabel = labelByStatus[label] ?? label.replaceAll('_', ' ');
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-normal border', toneByStatus[label] ?? 'bg-zinc-50 text-zinc-800 border-zinc-300')}>
      <span className="h-2 w-2 rounded-sm bg-current" aria-hidden="true" />
      {displayLabel}
    </span>
  );
}
