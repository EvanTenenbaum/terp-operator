import { RefreshCcw } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { EmptyState } from '../components/EmptyState';
import { KpiCard } from '../components/KpiCard';
import { OperatorGrid } from '../components/OperatorGrid';
import { StatusPill } from '../components/StatusPill';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useUiStore } from '../store/uiStore';
import { commandLabelFor } from '../../shared/commandCatalog';
import type { ColDef } from 'ag-grid-community';
import type { GridRow, ViewKey } from '../../shared/types';

export function DashboardView() {
  const setDrilldownMetric = useUiStore((state) => state.setDrilldownMetric);
  const navigate = useNavigate();
  const drilldownMetric = useUiStore((state) => state.drilldownMetric);
  const dashboard = trpc.queries.dashboard.useQuery(undefined, { refetchInterval: 15_000 });
  const workQueue = trpc.queries.workQueue.useQuery(undefined, { refetchInterval: 15_000 });
  const drilldown = trpc.queries.drilldown.useQuery({ metricKey: drilldownMetric ?? 'cash' }, { enabled: Boolean(drilldownMetric) });
  const rankedWorkRows = useMemo(() => [...((workQueue.data ?? []) as GridRow[])].sort(workUrgencySort), [workQueue.data]);

  const columns: ColDef<GridRow>[] = [
    { field: 'id', pinned: 'left', width: 120 },
    { field: 'status', width: 120 },
    { field: 'name' },
    { field: 'customer' },
    { field: 'vendor' },
    { field: 'needProduct', headerName: 'Need' },
    { field: 'vendorProduct', headerName: 'Vendor stock' },
    { field: 'score' },
    { field: 'reasons' },
    { field: 'amount' },
    { field: 'total' },
    { field: 'availableQty' },
    { field: 'createdAt' }
  ];
  const queueColumns: ColDef<GridRow>[] = [
    { field: 'lane', pinned: 'left', width: 125 },
    { field: 'title', width: 180 },
    { field: 'status', width: 125 },
    { field: 'detail', minWidth: 280 },
    { field: 'createdAt', width: 180 }
  ];

  if (dashboard.isError || workQueue.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
        <p className="text-sm">Unable to load dashboard. Check your connection.</p>
        <button className="btn-secondary text-xs" onClick={() => { dashboard.refetch(); workQueue.refetch(); }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="view-stack">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Owner Daily Decision View</h1>
          <p className="page-subtitle">Today’s money, inventory, open work, and recent activity.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => dashboard.refetch()}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {(dashboard.data?.metrics ?? []).map((metric) => (
          <KpiCard key={metric.key} metric={metric} onOpen={setDrilldownMetric} />
        ))}
      </div>

      {/* ── Today Focus ─────────────────────────────────────────────────────── */}
      <div aria-busy={workQueue.isLoading}>
        <WorkspacePanel
          panelId="dashboard:today-focus"
          title="Today Focus"
          subtitle="What needs your attention today"
          headingLevel={2}
          contentClassName="p-3"
        >
          <div aria-live="polite">
            {/* Today's Top Decisions */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">Today's Top Decisions</h3>
              {rankedWorkRows.length === 0 && !workQueue.isLoading ? (
                <EmptyState title="Nothing needs your attention right now." role="status" />
              ) : (
                <div className="flex flex-col gap-1">
                  {rankedWorkRows.slice(0, 3).map((item) => (
                    <button
                      key={String(item.id)}
                      type="button"
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-50 focus:outline-none focus-visible:shadow-focus"
                      onClick={() => item.route ? navigate('/' + item.route) : undefined}
                    >
                      <StatusPill status={String(item.lane ?? '')} />
                      <span className="font-medium text-ink">{String(item.title ?? '')}</span>
                      {item.detail ? (
                        <span className="text-xs text-zinc-500">— {String(item.detail)}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 5 KPI Tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <TodayFocusTile
                label="Cash Position"
                value={dashboard.data?.metrics.find((m) => m.key === 'cash')?.value}
                onClick={() => setDrilldownMetric('cash')}
              />
              <TodayFocusTile
                label="What we owe vendors"
                value={dashboard.data?.metrics.find((m) => m.key === 'payables')?.value}
                onClick={() => setDrilldownMetric('payables')}
              />
              <TodayFocusTile
                label="What clients owe"
                value={dashboard.data?.metrics.find((m) => m.key === 'receivables')?.value}
                onClick={() => setDrilldownMetric('receivables')}
              />
              <TodayFocusTile
                label="Open Orders"
                value={dashboard.data?.pendingQueues.find((q) => q.key === 'sales')?.count}
                onClick={() => navigate('/sales')}
              />
              <TodayFocusTile
                label="Intake ready"
                value={dashboard.data?.pendingQueues.find((q) => q.key === 'intake')?.count}
                onClick={() => navigate('/intake')}
              />
            </div>
          </div>
        </WorkspacePanel>
      </div>
      {/* ── End Today Focus ──────────────────────────────────────────────────── */}

      <WorkspacePanel panelId="dashboard:money-buckets" title="Money Buckets" headingLevel={2} contentClassName="p-3">
        <div className="definition-list">
          {(dashboard.data?.moneyBuckets ?? []).map((bucket) => (
            <button key={bucket.bucket} className="definition-item text-left focus:outline-none focus-visible:shadow-focus" type="button" onClick={() => setDrilldownMetric('cash')}>
              <strong>{bucket.bucket}</strong>
              <div className="mt-1 text-sm text-ink">${Number(bucket.amount ?? 0).toLocaleString()}</div>
            </button>
          ))}
          <button className="definition-item text-left focus:outline-none focus-visible:shadow-focus" type="button" onClick={() => setDrilldownMetric('payables')}>
            <strong>Payables due/scheduled</strong>
            <div className="mt-1 text-sm text-ink">Open vendor bills</div>
          </button>
          <button className="definition-item text-left focus:outline-none focus-visible:shadow-focus" type="button" onClick={() => setDrilldownMetric('receivables')}>
            <strong>Receivables</strong>
            <div className="mt-1 text-sm text-ink">Open customer invoices</div>
          </button>
        </div>
      </WorkspacePanel>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[0.8fr_1.2fr]">
        <WorkspacePanel panelId="dashboard:pending-work-queues" title="Pending work queues" headingLevel={2} contentClassName="p-3">
          <div className="grid gap-2">
            {(dashboard.data?.pendingQueues ?? []).map((queue) => (
                <button key={queue.key} className="queue-row" type="button" onClick={() => navigate('/' + queue.key)}>
                <span>{queue.label}</span>
                <strong>{queue.count}</strong>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <StatusPill status={dashboard.data?.health.ok ? 'posted' : 'needs_fix'} />
            <span>{dashboard.data?.health.ok ? 'Health checks are green.' : dashboard.data?.health.warnings.join(' ')}</span>
          </div>
        </WorkspacePanel>
        <WorkspacePanel panelId="dashboard:recent-activity" title="Recent activity" headingLevel={2} contentClassName="p-3">
          <div className="mt-2 max-h-64 overflow-auto">
            {(dashboard.data?.recentActivity ?? []).map((activity) => (
              <div key={activity.id} className="activity-row">
                <span className="font-medium">{commandLabelFor(activity.commandName)}</span>
                <span>{activity.actorName}</span>
                <span>{new Date(activity.createdAt).toLocaleString()}</span>
                <span>{activity.toast}</span>
              </div>
            ))}
          </div>
        </WorkspacePanel>
      </div>
      <OperatorGrid
        view="dashboard"
        title="My Open Work"
        rows={rankedWorkRows}
        columns={queueColumns}
        loading={workQueue.isLoading}
        actions={
          <button
            type="button"
            className="text-button"
            onClick={() => {
              const first = rankedWorkRows[0] as GridRow | undefined;
              if (first?.route) navigate('/' + first.route);
            }}
          >
            Open top item
          </button>
        }
      />
      {drilldownMetric ? (
        <OperatorGrid
          view="dashboard"
          title={`Source rows for ${drilldownMetric.replace('_', ' ')}`}
          rows={(drilldown.data ?? []) as GridRow[]}
          columns={columns}
          loading={drilldown.isLoading}
          actions={
            <button type="button" className="text-button" onClick={() => setDrilldownMetric(null)}>
              Close drilldown
            </button>
          }
        />
      ) : null}
    </div>
  );
}

// ── Today Focus tile (TER-1572) ───────────────────────────────────────────
// Wired tile showing live metric value from dashboard tRPC queries.
// Shows "--" while loading or when data is unavailable.
function TodayFocusTile({
  label,
  value,
  onClick,
}: {
  label: string;
  value?: string | number;
  onClick?: () => void;
}) {
  return (
    <div className="border border-line bg-white p-3">
      <span className="text-xs font-semibold uppercase text-zinc-600">{label}</span>
      <div className="mt-2 text-xl font-bold text-ink">{value ?? '--'}</div>
      <button
        type="button"
        onClick={onClick}
        className="mt-2 inline-flex items-center text-xs text-accent hover:underline focus:outline-none focus-visible:shadow-focus"
      >
        View
      </button>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

function workUrgencySort(a: GridRow, b: GridRow) {
  const score = urgencyScore(b) - urgencyScore(a);
  if (score) return score;
  return new Date(String(b.createdAt ?? 0)).getTime() - new Date(String(a.createdAt ?? 0)).getTime();
}

function urgencyScore(row: GridRow) {
  const status = String(row.status ?? '');
  const lane = String(row.lane ?? '');
  if (status === 'needs_fix' || status === 'failed') return 100;
  if (status === 'ready' || status === 'confirmed') return 80;
  if (lane === 'Payments' || lane === 'Vendor') return 70;
  if (status === 'draft' || status === 'open') return 50;
  return 10;
}
