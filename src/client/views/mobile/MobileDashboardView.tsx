import { trpc } from '../../api/trpc';
import type { KpiMetric } from '../../../shared/types';

function Skeleton() {
  return (
    <div
      data-testid="skeleton"
      className="h-4 animate-pulse rounded-md"
      style={{ background: 'var(--m-line)' }}
    />
  );
}

function severityDotColor(severity: KpiMetric['severity']) {
  if (severity === 'good')    return '#10b981';
  if (severity === 'watch')   return 'var(--m-amber)';
  if (severity === 'bad')     return 'var(--m-danger)';
  return '#c4cac3';
}

function severitySubColor(severity: KpiMetric['severity']) {
  if (severity === 'good')    return '#1f5a3f';
  if (severity === 'watch')   return 'var(--m-amber)';
  if (severity === 'bad')     return 'var(--m-danger)';
  return 'var(--m-muted)';
}

export function MobileDashboardView() {
  const dashboard = trpc.queries.dashboard.useQuery(undefined, { refetchInterval: 30_000 });
  const workQueue  = trpc.queries.workQueue.useQuery(undefined,  { refetchInterval: 30_000 });

  const metrics  = dashboard.data?.metrics ?? [];
  const queues   = dashboard.data?.pendingQueues ?? [];
  const activity = dashboard.data?.recentActivity ?? [];
  const health   = dashboard.data?.health;
  const loading  = dashboard.isLoading;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr  = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // workQueue is loaded — suppress unused variable warning
  void workQueue;

  return (
    <div className="pb-6">
      {/* Hero card */}
      <div
        className="mx-4 mt-4 rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, var(--m-accent) 0%, var(--m-accent-deep) 100%)' }}
      >
        <p className="text-sm opacity-80">{greeting}</p>
        <p className="mt-0.5 text-xl font-bold">{dateStr}</p>
        {queues.length > 0 && (
          <p className="mt-2 text-xs opacity-70">{queues.length} queues need attention</p>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2.5 px-4 py-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="m-card p-4" style={{ minHeight: 88 }}>
                <Skeleton /><div className="mt-2"><Skeleton /></div>
              </div>
            ))
          : metrics.map((m) => (
              <button
                key={m.key}
                type="button"
                className="m-card relative p-4 text-left"
                style={{ minHeight: 88 }}
                aria-label={`${m.label}: ${m.value}`}
              >
                <span
                  aria-hidden="true"
                  className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full"
                  style={{ background: severityDotColor(m.severity) }}
                />
                <p className="m-section-header p-0" style={{ padding: 0 }}>{m.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: 'var(--m-ink)' }}>{m.value}</p>
                <p className="mt-1 text-xs" style={{ color: severitySubColor(m.severity) }}>{m.definition}</p>
              </button>
            ))}
      </div>

      {/* Work queue */}
      <p className="m-section-header">Work Queue</p>
      <div className="px-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="py-4"><Skeleton /></div>)
          : queues.map((q) => (
              <div
                key={q.key}
                className="flex min-h-14 items-center justify-between border-b py-4 last:border-0"
                style={{ borderColor: 'var(--m-line)' }}
              >
                <span className="text-sm font-medium" style={{ color: 'var(--m-ink)' }}>{q.label}</span>
                <span
                  className="ml-3 inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold text-white"
                  style={{ background: 'var(--m-accent)' }}
                >
                  {q.count}
                </span>
              </div>
            ))}
      </div>

      {/* Recent activity */}
      <p className="m-section-header">Recent Activity</p>
      <div className="mx-4 m-card overflow-hidden p-0">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="p-4"><Skeleton /></div>)
          : activity.slice(0, 3).map((a, i) => (
              <div
                key={a.id}
                className="flex flex-col gap-0.5 px-4 py-3"
                style={{ borderBottom: i < 2 ? `1px solid var(--m-line)` : 'none' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--m-ink)' }}>{a.toast ?? a.commandName}</p>
                <p className="text-xs" style={{ color: 'var(--m-muted-2)' }}>
                  {a.actorName} · {new Date(a.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            ))}
      </div>

      {/* Health strip */}
      {!loading && health && (
        <div
          className="mx-4 mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
          style={health.ok
            ? { background: 'var(--m-success-soft)', color: '#1f5a3f' }
            : { background: 'var(--m-amber-soft)', color: 'var(--m-amber)' }}
        >
          <span aria-hidden="true">{health.ok ? '✓' : '⚠'}</span>
          <span>{health.ok ? 'All systems healthy' : health.warnings.join(' · ')}</span>
        </div>
      )}
    </div>
  );
}
