/**
 * DashboardView — widget composition template for the Dashboard.
 *
 * Accepts registered widgets (similar to how GridView accepts tabs) and
 * renders them in a responsive 12-column grid ordered by priority.
 *
 * When `useDefaults` is true (the default), the standard operator KPI,
 * queue, and activity widgets are loaded automatically. Pass an explicit
 * `widgets` array to override or augment the default set.
 *
 * The DashboardWidget interface is exported so consumers can register
 * custom widgets without modifying this file.
 */

import { RefreshCcw } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { EmptyState } from '../components/EmptyState';
import { KpiCard } from '../components/KpiCard';
import { OperatorGrid } from '../components/OperatorGrid';
import { StatusPill } from '../components/StatusPill';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { commandLabelFor } from '../../shared/commandCatalog';
import { formatTs } from '../utils/format';
import type { ColDef } from 'ag-grid-community';
import type { GridRow, ViewKey } from '../../shared/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardWidget {
  /** Unique identifier used for deduplication and override matching. */
  key: string;
  /** Human-readable widget name (used for aria-label on the grid cell). */
  title: string;
  /** Responsive column span. On mobile every widget is full-width. */
  span: 'full' | 'half' | 'third';
  /** Lower numbers render first. */
  priority: number;
  /** Widget content. Return null to suppress the grid cell entirely. */
  render: () => ReactNode;
}

export interface DashboardViewProps {
  /** Custom widgets. Widgets with the same `key` as a default widget replace it. */
  widgets?: DashboardWidget[];
  /** When true (the default), the standard operator dashboard widgets are loaded. */
  useDefaults?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** UX-E07: snooze duration in ms (24 h). Truthfully client-local. */
const SNOOZE_24H_MS = 24 * 60 * 60 * 1_000;

/** Maps a pendingQueue key to the pre-apply grid filter string.
 *  Empty string → navigate without applying a filter. */
const QUEUE_FILTER: Partial<Record<string, string>> = {
  intake: 'status:ready',
  sales: 'status:confirmed',
  payments: '', // count is from invoices; payments view shows payment records — no direct filter
};

/** Maps a Today-Focus tile key to its navigation target and pre-apply filter.
 *  UX-E02: tiles use the same filter semantics as the pending-queue buttons. */
const TODAY_TILE_NAV: Record<string, { route: string; filterView?: ViewKey; filter?: string }> = {
  'open-orders': { route: '/orders', filterView: 'orders', filter: 'status:confirmed' },
  'intake-ready': { route: '/intake', filterView: 'intake', filter: 'status:ready' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Inline error+retry banner for a single dashboard panel. UX-E04. */
function PanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      <span>Failed to load.</span>
      <button type="button" className="ml-auto text-xs underline hover:no-underline" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

/** Wired tile showing live metric value from dashboard tRPC queries.
 *  Shows "--" while loading or when data is unavailable. */
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
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${label}`}
      className="border border-line bg-white p-3 text-left focus:outline-none focus-visible:shadow-focus"
    >
      <span className="text-xs font-semibold uppercase text-zinc-600">{label}</span>
      <div className="mt-2 text-xl font-bold text-ink">{value ?? '--'}</div>
      <span className="mt-2 inline-flex items-center text-xs text-accent hover:underline">
        View
      </span>
    </button>
  );
}

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

// ─── Private section components (default widget renderers) ────────────────────

/** KPI cards row — 4-up on large screens. */
function KpiCardsSection() {
  const setDrilldownMetric = useUiStore((state) => state.setDrilldownMetric);
  const dashboard = trpc.queries.dashboard.useQuery(undefined, { refetchInterval: 15_000 });

  if (dashboard.isError) {
    return (
      <WorkspacePanel panelId="dashboard:kpi-cards" title="KPIs" headingLevel={2} contentClassName="p-3">
        <PanelError onRetry={() => void dashboard.refetch()} />
      </WorkspacePanel>
    );
  }

  const metrics = dashboard.data?.metrics ?? [];
  const isLoading = dashboard.isLoading;

  return (
    <WorkspacePanel panelId="dashboard:kpi-cards" title="KPIs" headingLevel={2} contentClassName="p-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4" aria-busy={isLoading}>
        {isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg border border-line bg-zinc-100" data-testid="kpi-skeleton" />
            ))
          : metrics.map((metric) => (
              <KpiCard key={metric.key} metric={metric} onOpen={setDrilldownMetric} />
            ))}
        {!isLoading && metrics.length === 0 ? (
          <div className="col-span-full">
            <EmptyState title="No dashboard data yet." role="status">
              KPIs appear here once orders, payments, and inventory are posted. If you expected data, check the server health indicator.
            </EmptyState>
          </div>
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

/** Today Focus — top decisions + metric tiles. */
function TodayFocusSection() {
  const navigate = useNavigate();
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const snoozedWorkQueueItems = useUiStore((state) => state.snoozedWorkQueueItems);

  const dashboard = trpc.queries.dashboard.useQuery(undefined, { refetchInterval: 15_000 });
  const workQueue = trpc.queries.workQueue.useQuery(undefined, { refetchInterval: 15_000 });

  const now = Date.now();
  const rankedWorkRows = useMemo(() => {
    const all = [...((workQueue.data ?? []) as GridRow[])].sort(workUrgencySort);
    return all.filter((row) => {
      const snoozedUntil = snoozedWorkQueueItems[String(row.id)];
      if (!snoozedUntil) return true;
      return new Date(snoozedUntil).getTime() < now;
    });
  }, [workQueue.data, snoozedWorkQueueItems, now]);

  return (
    <WorkspacePanel
      panelId="dashboard:today-focus"
      title="Today Focus"
      subtitle="What needs your attention today"
      headingLevel={2}
      contentClassName="p-3"
    >
      <div aria-live="polite" aria-busy={workQueue.isLoading}>
        {/* Today's Top Decisions */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Today's Top Decisions</h3>
          {workQueue.isError ? (
            <PanelError onRetry={() => void workQueue.refetch()} />
          ) : rankedWorkRows.length === 0 && !workQueue.isLoading ? (
            <EmptyState title="Nothing needs your attention right now." role="status" />
          ) : (
            <div className="flex flex-col gap-1">
              {rankedWorkRows.slice(0, 3).map((item) => (
                <button
                  key={String(item.id)}
                  type="button"
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-50 focus:outline-none focus-visible:shadow-focus"
                  onClick={() => item.route ? navigate('/' + String(item.route)) : undefined}
                >
                  <StatusPill status={String(item.lane ?? '')} />
                  <span className="font-medium text-ink">{String(item.title ?? '')}</span>
                  {item.detail ? (
                    <span className="text-xs text-zinc-500">— {String(item.detail)}</span>
                  ) : null}
                </button>
              ))}
              {rankedWorkRows.length > 3 && (
                <button
                  type="button"
                  className="mt-1 text-left text-xs text-accent hover:underline focus:outline-none focus-visible:shadow-focus"
                  onClick={() => {
                    const el = document.querySelector('[data-section="my-open-work"]');
                    if (el instanceof HTMLElement) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      el.focus();
                    }
                  }}
                  data-testid="top-decisions-toggle"
                >
                  View all ({rankedWorkRows.length})
                </button>
              )}
            </div>
          )}
        </div>

        {/* SX-C02: non-duplicate tiles (Open Orders, Intake ready).
            Cash/payables/receivables are covered by KPI cards above. */}
        <div className="grid grid-cols-2 gap-3">
          <TodayFocusTile
            label="Open Orders"
            value={dashboard.data?.pendingQueues.find((q) => q.key === 'sales')?.count}
            onClick={() => {
              const { route, filterView, filter } = TODAY_TILE_NAV['open-orders'];
              if (filterView && filter) setGridFilter(filterView, filter);
              navigate(route);
            }}
          />
          <TodayFocusTile
            label="Intake ready"
            value={dashboard.data?.pendingQueues.find((q) => q.key === 'intake')?.count}
            onClick={() => {
              const { route, filterView, filter } = TODAY_TILE_NAV['intake-ready'];
              if (filterView && filter) setGridFilter(filterView, filter);
              navigate(route);
            }}
          />
        </div>
      </div>
    </WorkspacePanel>
  );
}

/** Pending work queues + health check footer. */
function PendingQueuesSection() {
  const navigate = useNavigate();
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const dashboard = trpc.queries.dashboard.useQuery(undefined, { refetchInterval: 15_000 });

  return (
    <WorkspacePanel panelId="dashboard:pending-work-queues" title="Pending work queues" headingLevel={2} contentClassName="p-3">
      <div className="grid gap-2">
        {(dashboard.data?.pendingQueues ?? []).map((queue) => {
          const filter = QUEUE_FILTER[queue.key] ?? '';
          const cappedCount = Number(queue.count) > 99 ? '99+' : queue.count;
          return (
            <button
              key={queue.key}
              className="queue-row"
              type="button"
              onClick={() => {
                if (filter) setGridFilter(queue.key as ViewKey, filter);
                navigate('/' + queue.key);
              }}
            >
              <span>{queue.label}</span>
              <strong>{cappedCount}</strong>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm">
        <StatusPill status={dashboard.data?.health.ok ? 'posted' : 'needs_fix'} />
        <span>{dashboard.data?.health.ok ? 'Health checks are green.' : dashboard.data?.health.warnings.join(' ')}</span>
      </div>
    </WorkspacePanel>
  );
}

/** My Open Work grid with snooze/dismiss actions and scroll-target anchor. */
function MyOpenWorkSection() {
  const navigate = useNavigate();
  const { runCommand, isRunning } = useCommandRunner();
  const snoozedWorkQueueItems = useUiStore((state) => state.snoozedWorkQueueItems);
  const snoozeWorkQueueItem = useUiStore((state) => state.snoozeWorkQueueItem);

  const workQueue = trpc.queries.workQueue.useQuery(undefined, { refetchInterval: 15_000 });

  const now = Date.now();
  const rankedWorkRows = useMemo(() => {
    const all = [...((workQueue.data ?? []) as GridRow[])].sort(workUrgencySort);
    return all.filter((row) => {
      const snoozedUntil = snoozedWorkQueueItems[String(row.id)];
      if (!snoozedUntil) return true;
      return new Date(snoozedUntil).getTime() < now;
    });
  }, [workQueue.data, snoozedWorkQueueItems, now]);

  const queueColumns: ColDef<GridRow>[] = [
    { field: 'lane', pinned: 'left', width: 125 },
    { field: 'title', width: 180 },
    { field: 'status', width: 125 },
    { field: 'detail', minWidth: 280 },
    { field: 'createdAt', width: 180 },
  ];

  const workQueueExpansionConfig = useMemo(() => ({
    enabled: true,
    isRowMaster: (_row: GridRow) => true,
    actionsRenderer: (row: GridRow) => {
      const lane = String(row.lane ?? '');
      const itemId = String(row.id);
      const snoozedUntil = snoozedWorkQueueItems[itemId];
      const isCurrentlySnoozed = snoozedUntil && new Date(snoozedUntil).getTime() >= now;
      return (
        <div className="flex items-center gap-2">
          {isCurrentlySnoozed ? (
            <span className="text-xs text-zinc-500" title={`Snoozed until ${new Date(snoozedUntil).toLocaleString()}`}>
              Snoozed (local)
            </span>
          ) : (
            <button
              className="secondary-button compact-action"
              type="button"
              title="Snooze this item for 24 hours (local only)"
              onClick={() => {
                const until = new Date(now + SNOOZE_24H_MS).toISOString();
                snoozeWorkQueueItem(itemId, until);
              }}
            >
              Snooze 24h
            </button>
          )}
          {lane === 'Matchmaking' && !isCurrentlySnoozed && (() => {
            const itemType = String(row.matchItemType ?? 'match');
            return (
              <button
                className="secondary-button compact-action"
                type="button"
                disabled={isRunning}
                onClick={() => {
                  if (itemType === 'opportunity' && row.matchVendorId && row.matchCategory) {
                    void runCommand('dismissMatchmakingWorkQueueItem', {
                      itemType: 'opportunity',
                      itemId: String(row.id),
                      entityType: 'vendor',
                      entityId: String(row.matchVendorId),
                      context: String(row.matchCategory),
                      leg: 3,
                    }, 'Dismiss from work queue').then(() => workQueue.refetch());
                  } else {
                    void runCommand('dismissMatchmakingWorkQueueItem', {
                      itemType: 'match',
                      itemId: String(row.id),
                    }, 'Dismiss from work queue').then(() => workQueue.refetch());
                  }
                }}
              >
                Dismiss for 30 days
              </button>
            );
          })()}
        </div>
      );
    },
    childrenRenderer: (row: GridRow) => {
      const lane = String(row.lane ?? '');
      if (lane !== 'Matchmaking') return null;
      return (
        <div className="text-sm text-zinc-500">
          <button
            className="text-xs text-blue-600 hover:underline"
            type="button"
            onClick={() => navigate('/' + String(row.route ?? 'matchmaking'))}
          >
            View in Matchmaking →
          </button>
        </div>
      );
    },
  }), [isRunning, runCommand, workQueue, navigate, snoozedWorkQueueItems, snoozeWorkQueueItem, now]);

  return (
    <div data-section="my-open-work" tabIndex={-1} aria-label="My Open Work grid">
      <OperatorGrid
        view="dashboard"
        title="My Open Work"
        rows={rankedWorkRows}
        columns={queueColumns}
        loading={workQueue.isLoading}
        expansionConfig={workQueueExpansionConfig}
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
    </div>
  );
}

/** Credit Watch — customers closest to or over their credit limit. GH #359. */
function CreditWatchSection(): ReactNode {
  const navigate = useNavigate();
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);

  const me = trpc.auth.me.useQuery();
  const isCreditWatchRole = me.data?.role === 'owner' || me.data?.role === 'manager';
  const creditWatchlist = trpc.queries.creditWatchlist.useQuery(
    { limit: 10 },
    { refetchInterval: 30_000, enabled: isCreditWatchRole },
  );

  // Suppress the entire panel when there's nothing to show (no error, no data).
  if (!creditWatchlist.isError && (!creditWatchlist.data || creditWatchlist.data.length === 0)) {
    return null;
  }

  return (
    <WorkspacePanel
      panelId="dashboard:credit-watch"
      title="Credit Watch"
      subtitle="Customers closest to or over their credit limit"
      headingLevel={2}
      contentClassName="p-3"
    >
      <div aria-busy={creditWatchlist.isLoading}>
        {creditWatchlist.isError ? (
          <PanelError onRetry={() => void creditWatchlist.refetch()} />
        ) : (
          <div className="credit-watch-list">
            {(creditWatchlist.data ?? []).slice(0, 5).map((item) => {
              const riskClass =
                item.risk === 'at-risk' ? 'credit-risk-bad' :
                item.risk === 'watch' ? 'credit-risk-watch' :
                'credit-risk-good';
              return (
                <button
                  key={item.customerId}
                  type="button"
                  className="queue-row"
                  onClick={() => {
                    setGridFilter('clients', `name:${item.customerName}`);
                    setDrawerEntity('clients', 'customer', String(item.customerId));
                    setDrawerState('clients', 'standard');
                    navigate('/clients');
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${riskClass}`}
                      title={item.risk === 'at-risk' ? 'At risk' : item.risk === 'watch' ? 'Watch' : 'Good'}
                    />
                    <span className="font-medium truncate">{item.customerName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span title="Outstanding balance">
                      ${Number(item.balance).toLocaleString('en-US')}
                    </span>
                    <span title={`Credit limit: $${Number(item.creditLimit).toLocaleString('en-US')}`}>
                      limit ${Number(item.creditLimit).toLocaleString('en-US')}
                    </span>
                    {item.overallScore !== null && (
                      <span title="Credit score">{item.overallScore}</span>
                    )}
                  </div>
                </button>
              );
            })}
            {(creditWatchlist.data ?? []).length > 5 && (
              <button
                type="button"
                className="mt-1 text-left text-xs text-accent hover:underline focus:outline-none focus-visible:shadow-focus"
                onClick={() => navigate('/clients')}
              >
                View all ({(creditWatchlist.data ?? []).length})
              </button>
            )}
          </div>
        )}
      </div>
    </WorkspacePanel>
  );
}

/** Your Drafts — TER-1632. */
function DraftsSection(): ReactNode {
  const navigate = useNavigate();
  const myDrafts = trpc.queries.myDrafts.useQuery(undefined, { refetchInterval: 15_000 });

  // Suppress when there's nothing to show.
  if (!myDrafts.isError && (!myDrafts.data || myDrafts.data.length === 0)) {
    return null;
  }

  return (
    <WorkspacePanel
      panelId="dashboard:my-drafts"
      title={`Your drafts (${myDrafts.data?.length ?? 0})`}
      headingLevel={2}
      contentClassName="p-3"
    >
      {myDrafts.isError ? (
        <PanelError onRetry={() => void myDrafts.refetch()} />
      ) : (
        <div className="grid gap-2">
          {(myDrafts.data ?? []).map((draft) => (
            <button
              key={String(draft.id)}
              className="queue-row"
              type="button"
              onClick={() => navigate('/' + String(draft.route))}
            >
              <span>{String(draft.lane)}: {String(draft.title)}</span>
              <StatusPill status={String(draft.status ?? '')} />
            </button>
          ))}
        </div>
      )}
    </WorkspacePanel>
  );
}

/** Recent activity feed — SX-C02. */
function RecentActivitySection() {
  const dashboard = trpc.queries.dashboard.useQuery(undefined, { refetchInterval: 15_000 });

  return (
    <WorkspacePanel panelId="dashboard:recent-activity" title="Recent activity" headingLevel={2} contentClassName="p-3">
      <div className="mt-2 max-h-64 overflow-auto">
        {(dashboard.data?.recentActivity ?? []).map((activity) => (
          <div key={activity.id} className="activity-row">
            <span className="font-medium">{commandLabelFor(activity.commandName)}</span>
            <span>{activity.actorName}</span>
            <span title={formatTs(activity.createdAt, { variant: 'long' })}>
              {formatTs(activity.createdAt, { variant: 'relative' })}
            </span>
            <span>{activity.toast}</span>
          </div>
        ))}
      </div>
    </WorkspacePanel>
  );
}

/** Drilldown — source rows or cash bucket groups when a KPI card is clicked. */
function DrilldownSection(): ReactNode {
  const drilldownMetric = useUiStore((state) => state.drilldownMetric);
  const setDrilldownMetric = useUiStore((state) => state.setDrilldownMetric);

  if (!drilldownMetric) return null;

  return <DrilldownContent metricKey={drilldownMetric} onClose={() => setDrilldownMetric(null)} />;
}

function DrilldownContent({ metricKey, onClose }: { metricKey: string; onClose: () => void }) {
  const drilldown = trpc.queries.drilldown.useQuery(
    { metricKey },
    { enabled: Boolean(metricKey) },
  );

  const drilldownRows = (drilldown.data ?? []) as GridRow[];

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
    { field: 'createdAt' },
  ];

  // UX-J07: group cash drilldown rows by locationBucket.
  const cashBucketGroups: Array<{ bucket: string; rows: GridRow[]; total: number }> | null = useMemo(() => {
    if (metricKey !== 'cash' || drilldownRows.length === 0) return null;
    if (!drilldownRows.some((r) => r['locationBucket'] != null)) return null;
    const map = new Map<string, GridRow[]>();
    for (const row of drilldownRows) {
      const bucket = String(row['locationBucket'] ?? 'Unclassified');
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(row);
    }
    return Array.from(map.entries())
      .map(([bucket, rows]) => ({
        bucket,
        rows,
        total: rows.reduce((sum, r) => sum + Number(r['amount'] ?? 0), 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [metricKey, drilldownRows]);

  if (cashBucketGroups) {
    return (
      <WorkspacePanel
        panelId="dashboard:drilldown-cash-buckets"
        title="Cash — by bucket"
        headingLevel={2}
        contentClassName="p-3"
      >
        <div className="mb-2 flex items-center gap-2">
          <button type="button" className="text-button" onClick={onClose}>
            Close drilldown
          </button>
        </div>
        {cashBucketGroups.map(({ bucket, rows, total }) => (
          <div key={bucket} className="mb-4">
            <div className="mb-1 flex items-center justify-between text-sm font-semibold text-ink">
              <span>{bucket}</span>
              <span className="text-xs text-zinc-500">
                {rows.length} row{rows.length !== 1 ? 's' : ''} · ${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <OperatorGrid view="dashboard" title="" rows={rows} columns={columns} loading={drilldown.isLoading} />
          </div>
        ))}
      </WorkspacePanel>
    );
  }

  return (
    <OperatorGrid
      view="dashboard"
      title={`Source rows for ${metricKey.replace('_', ' ')}`}
      rows={drilldownRows}
      columns={columns}
      loading={drilldown.isLoading}
      actions={
        <button type="button" className="text-button" onClick={onClose}>
          Close drilldown
        </button>
      }
    />
  );
}

// ─── Default widget registry ──────────────────────────────────────────────────

const DEFAULT_DASHBOARD_WIDGETS: DashboardWidget[] = [
  { key: 'kpi-cards',         title: 'KPIs',                  span: 'full', priority: 0,  render: () => <KpiCardsSection /> },
  { key: 'today-focus',       title: 'Today Focus',           span: 'full', priority: 10, render: () => <TodayFocusSection /> },
  { key: 'pending-queues',    title: 'Pending work queues',   span: 'full', priority: 20, render: () => <PendingQueuesSection /> },
  { key: 'my-open-work',      title: 'My Open Work',          span: 'full', priority: 30, render: () => <MyOpenWorkSection /> },
  { key: 'credit-watch',      title: 'Credit Watch',          span: 'full', priority: 40, render: () => <CreditWatchSection /> },
  { key: 'drafts',            title: 'Your drafts',           span: 'full', priority: 50, render: () => <DraftsSection /> },
  { key: 'recent-activity',   title: 'Recent activity',       span: 'full', priority: 60, render: () => <RecentActivitySection /> },
  { key: 'drilldown',         title: 'Drilldown',             span: 'full', priority: 70, render: () => <DrilldownSection /> },
];

// ─── Span → Tailwind class mapping ────────────────────────────────────────────

function spanToColClass(span: DashboardWidget['span']): string {
  switch (span) {
    case 'full':  return 'col-span-full';
    case 'half':  return 'col-span-full lg:col-span-6';
    case 'third': return 'col-span-full lg:col-span-4';
  }
}

// ─── Main template ────────────────────────────────────────────────────────────

export function DashboardView({ widgets, useDefaults = true }: DashboardViewProps) {
  const effectiveWidgets = useMemo(() => {
    const base = useDefaults ? [...DEFAULT_DASHBOARD_WIDGETS] : [];
    if (!widgets || widgets.length === 0) return base;

    // Merge: custom widgets override defaults by key, new keys are appended.
    const merged = [...base];
    for (const w of widgets) {
      const idx = merged.findIndex((m) => m.key === w.key);
      if (idx >= 0) {
        merged[idx] = w;
      } else {
        merged.push(w);
      }
    }
    return merged;
  }, [widgets, useDefaults]);

  const sorted = useMemo(
    () => [...effectiveWidgets].sort((a, b) => a.priority - b.priority),
    [effectiveWidgets],
  );

  /** Refresh all dashboard-page queries. UX-E09. */
  function handleRefresh() {
    // tRPC query invalidation via the utility context triggers refetch for
    // all dashboard, workQueue, myDrafts, and creditWatchlist queries.
    const ctx = trpc.useUtils();
    void ctx.queries.dashboard.invalidate();
    void ctx.queries.workQueue.invalidate();
    void ctx.queries.myDrafts.invalidate();
    void ctx.queries.creditWatchlist.invalidate();
  }

  return (
    <div className="view-stack">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Owner Daily Decision View</h1>
          <p className="page-subtitle">Today's money, inventory, open work, and recent activity.</p>
        </div>
        <button type="button" className="secondary-button" onClick={handleRefresh}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Widget grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {sorted.map((widget) => {
          const rendered = widget.render();
          if (rendered === null || rendered === undefined || rendered === false) return null;

          return (
            <div
              key={widget.key}
              className={spanToColClass(widget.span)}
              aria-label={widget.title}
              data-widget={widget.key}
            >
              {rendered}
            </div>
          );
        })}
      </div>
    </div>
  );
}
