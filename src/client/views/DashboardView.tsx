import { RefreshCcw } from 'lucide-react';
import { useMemo } from 'react';
import { trpc } from '../api/trpc';
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
  const setActiveView = useUiStore((state) => state.setActiveView);
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
      {/* Phase 6 scaffold: static stub tiles — wire tRPC queries when math     */}
      {/* fixtures pass. Each tile marked with TODO(phase6) for the query.       */}
      <WorkspacePanel
        panelId="dashboard:today-focus"
        title="Today Focus"
        subtitle="Key decisions for today — data coming in Phase 6"
        headingLevel={2}
        contentClassName="p-3"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {/* TODO(phase6): wire queries.dashboard → cash metric for live Cash Position */}
          <TodayFocusTile label="Cash Position" />
          {/* TODO(phase6): wire queries.dashboard → payables metric for Payables Due Today */}
          <TodayFocusTile label="Payables Due Today" />
          {/* TODO(phase6): wire queries.dashboard → receivables metric for Receivables Due Today */}
          <TodayFocusTile label="Receivables Due Today" />
          {/* TODO(phase6): wire queries.dashboard → pendingQueues sales count for Open Orders */}
          <TodayFocusTile label="Open Orders" />
          {/* TODO(phase6): wire queries.dashboard → pendingQueues fulfillment count for Pending Fulfillments */}
          <TodayFocusTile label="Pending Fulfillments" />
        </div>
      </WorkspacePanel>
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
              <button key={queue.key} className="queue-row" type="button" onClick={() => setActiveView(queue.key as ViewKey)}>
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
              if (first?.route) setActiveView(first.route as ViewKey);
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

// ── Phase 6 Today Focus tile ───────────────────────────────────────────────
// Static stub tile used in the Today Focus section. Replace `value` prop with
// real data once the matching tRPC query lands in Phase 6.
// Visual style mirrors KpiCard (same border/bg/padding) without requiring a
// full KpiMetric shape — keeps the stub self-contained and easy to wire later.
function TodayFocusTile({ label }: { label: string }) {
  return (
    <div className="border border-line bg-white p-3">
      <span className="text-xs font-semibold uppercase text-zinc-600">{label}</span>
      {/* TODO(phase6): replace "--" with live value from the wired tRPC query */}
      <div className="mt-2 text-xl font-bold text-ink">--</div>
      {/* TODO(phase6): replace href="#" with navigation to the source-row view */}
      <a
        href="#"
        className="mt-2 inline-flex items-center text-xs text-accent hover:underline focus:outline-none focus-visible:shadow-focus"
      >
        View
      </a>
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
