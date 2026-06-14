import { RefreshCcw } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
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

/** UX-E07: snooze duration in ms (24 h). Truthfully client-local. */
const SNOOZE_24H_MS = 24 * 60 * 60 * 1_000;

/** Maps a pendingQueue key to the pre-apply grid filter string.
 *  Empty string → navigate without applying a filter. */
const QUEUE_FILTER: Partial<Record<string, string>> = {
  intake:   'status:ready',
  sales:    'status:confirmed',
  payments: '',  // count is from invoices; payments view shows payment records — no direct filter
};

/** Maps a Today-Focus tile key to its navigation target and pre-apply filter.
 *  UX-E02: tiles now use the same filter semantics as the pending-queue buttons. */
const TODAY_TILE_NAV: Record<string, { route: string; filterView?: ViewKey; filter?: string }> = {
  'open-orders': { route: '/orders', filterView: 'orders', filter: 'status:confirmed' },
  'intake-ready': { route: '/intake', filterView: 'intake', filter: 'status:ready' },
};

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

export function DashboardView() {
  const setDrilldownMetric = useUiStore((state) => state.setDrilldownMetric);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  // UX-E07: snooze state from store.
  const snoozedWorkQueueItems = useUiStore((state) => state.snoozedWorkQueueItems);
  const snoozeWorkQueueItem = useUiStore((state) => state.snoozeWorkQueueItem);
  const navigate = useNavigate();
  const drilldownMetric = useUiStore((state) => state.drilldownMetric);
  const dashboard = trpc.queries.dashboard.useQuery(undefined, { refetchInterval: 15_000 });
  const workQueue = trpc.queries.workQueue.useQuery(undefined, { refetchInterval: 15_000 });
  const drilldown = trpc.queries.drilldown.useQuery({ metricKey: drilldownMetric ?? 'cash' }, { enabled: Boolean(drilldownMetric) });
  // UX-E08 / SX-C03: ref for scroll-to "My Open Work" from "View all".
  const myOpenWorkRef = useRef<HTMLDivElement>(null);
  const now = Date.now();
  // UX-E07: filter out snoozed rows (snooze expires when snoozedUntil < now).
  const rankedWorkRows = useMemo(() => {
    const all = [...((workQueue.data ?? []) as GridRow[])].sort(workUrgencySort);
    return all.filter((row) => {
      const snoozedUntil = snoozedWorkQueueItems[String(row.id)];
      if (!snoozedUntil) return true;
      return new Date(snoozedUntil).getTime() < now;
    });
  }, [workQueue.data, snoozedWorkQueueItems, now]);
  const { runCommand, isRunning } = useCommandRunner();
  const myDrafts = trpc.queries.myDrafts.useQuery(undefined, { refetchInterval: 15_000 });
  // GH #359: Credit watch watchlist — top customers by credit risk
  // SX-I16: role-gate — viewer/intake@ roles get 403 on this manager-only query.
  const meForCreditWatch = trpc.auth.me.useQuery();
  const isCreditWatchRole = meForCreditWatch.data?.role === 'owner' || meForCreditWatch.data?.role === 'manager';
  const creditWatchlist = trpc.queries.creditWatchlist.useQuery({ limit: 10 }, { refetchInterval: 30_000, enabled: isCreditWatchRole });

  // UX-J07: group cash drilldown rows by locationBucket when the metric is 'cash'
  // and locationBucket is present on the wire (gridSql('payments') always returns it).
  const drilldownRows = (drilldown.data ?? []) as GridRow[];
  const cashBucketGroups: Array<{ bucket: string; rows: GridRow[]; total: number }> | null = useMemo(() => {
    if (drilldownMetric !== 'cash' || drilldownRows.length === 0) return null;
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
  }, [drilldownMetric, drilldownRows]);

  /** UX-E09: Refresh all dashboard-page queries, not just the dashboard query. */
  function handleRefresh() {
    void dashboard.refetch();
    void workQueue.refetch();
    void myDrafts.refetch();
    void creditWatchlist.refetch();
  }

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
          {/* UX-E07: Snooze button — all lanes. Truthfully local — labelled "snooze". */}
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
          {/* Original Matchmaking dismiss — preserved. */}
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

  // UX-E04: removed the all-or-nothing error gate — each panel renders its own
  // PanelError+retry so healthy panels stay live when only one query fails.

  return (
    <div className="view-stack">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Owner Daily Decision View</h1>
          <p className="page-subtitle">Today’s money, inventory, open work, and recent activity.</p>
        </div>
        {/* UX-E09: Refresh refetches all dashboard-page queries. */}
        <button type="button" className="secondary-button" onClick={handleRefresh}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>
      {/* UX-E04: KPI panel shows its own error+retry; dashboard error does not
          replace the whole page. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4" aria-busy={dashboard.isLoading}>
        {/* EXT-REVIEW 2026-06 finding #2 ("the dashboard is empty"): the KPI row
            previously rendered nothing while loading and nothing on an empty
            response — indistinguishable from a data failure. Loading now shows
            skeleton tiles; a loaded-but-empty response shows an explicit state. */}
        {dashboard.isError
          ? (
            <div className="col-span-full">
              <PanelError onRetry={() => void dashboard.refetch()} />
            </div>
          )
          : dashboard.isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg border border-line bg-zinc-100" data-testid="kpi-skeleton" />
            ))
          : (dashboard.data?.metrics ?? []).map((metric) => (
              <KpiCard key={metric.key} metric={metric} onOpen={setDrilldownMetric} />
            ))}
        {!dashboard.isError && !dashboard.isLoading && (dashboard.data?.metrics ?? []).length === 0 ? (
          <div className="col-span-full">
            <EmptyState title="No dashboard data yet." role="status">
              KPIs appear here once orders, payments, and inventory are posted. If you expected data, check the server health indicator.
            </EmptyState>
          </div>
        ) : null}
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
            {/* Today's Top Decisions — UX-E04: workQueue error shown inline */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">Today's Top Decisions</h3>
              {workQueue.isError ? (
                <PanelError onRetry={() => void workQueue.refetch()} />
              ) : rankedWorkRows.length === 0 && !workQueue.isLoading ? (
                <EmptyState title="Nothing needs your attention right now." role="status" />
              ) : (
                <div className="flex flex-col gap-1">
                  {/* SX-C03: always show top 3. "View all" scrolls to My Open Work grid. */}
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
                  {/* SX-C03: "View all" scrolls to My Open Work grid. */}
                  {rankedWorkRows.length > 3 && (
                    <button
                      type="button"
                      className="mt-1 text-left text-xs text-accent hover:underline focus:outline-none focus-visible:shadow-focus"
                      onClick={() => {
                        myOpenWorkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        myOpenWorkRef.current?.focus();
                      }}
                      data-testid="top-decisions-toggle"
                    >
                      View all ({rankedWorkRows.length})
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* SX-C02: keep only the 2 non-duplicate tiles (Open Orders, Intake ready).
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
      </div>
      {/* ── End Today Focus ──────────────────────────────────────────────────── */}

      {/* ── Pending work queues (SX-C02: moved up) ─────────────────────────────── */}
      <WorkspacePanel panelId="dashboard:pending-work-queues" title="Pending work queues" headingLevel={2} contentClassName="p-3">
        <div className="grid gap-2">
        {(dashboard.data?.pendingQueues ?? []).map((queue) => {
            const filter = QUEUE_FILTER[queue.key] ?? '';
            // SX-C04: cap queue counts at 99+.
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

      {/* ── My Open Work (SX-C03: scroll target for "View all") ────────────────── */}
      <div ref={myOpenWorkRef} tabIndex={-1} aria-label="My Open Work grid">
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

      {/* ── Credit Watch (GH #359) ──────────────────────────────────────────────── */}
      {/* UX-E04: creditWatchlist error renders inline so other panels stay live. */}
      {(creditWatchlist.isError || (creditWatchlist.data && creditWatchlist.data.length > 0)) && (
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
                {/* SX-C02: cap visible rows at 5 + "View all (N)" link to /clients.
                    UX-E01: each row deep-links — setGridFilter('clients', 'name:<customer>')
                    + setDrawerEntity + setDrawerState('standard') — mirrors the CountPill
                    pattern (TER-1624 lineage). */}
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
                {/* SX-C02: "View all (N)" link when more than 5 items. */}
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
      )}
      {/* ── Your Drafts (TER-1632) ────────────────────────────────────────────── */}
      {/* UX-E04: myDrafts error renders inline so other panels stay live. */}
      {(myDrafts.isError || (myDrafts.data?.length ?? 0) > 0) && (
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
      )}
      {/* ── End Your Drafts ─────────────────────────────────────────────────── */}

      {/* ── Recent activity (SX-C02: moved to bottom) ──────────────────────────── */}
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
      {drilldownMetric ? (
        <>
          {/* UX-J07: cash drilldown groups by locationBucket when the field is on the wire. */}
          {cashBucketGroups ? (
            <WorkspacePanel
              panelId="dashboard:drilldown-cash-buckets"
              title="Cash — by bucket"
              headingLevel={2}
              contentClassName="p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                <button type="button" className="text-button" onClick={() => setDrilldownMetric(null)}>
                  Close drilldown
                </button>
              </div>
              {cashBucketGroups.map(({ bucket, rows, total }) => (
                <div key={bucket} className="mb-4">
                  <div className="mb-1 flex items-center justify-between text-sm font-semibold text-ink">
                    <span>{bucket}</span>
                    <span className="text-xs text-zinc-500">{rows.length} row{rows.length !== 1 ? 's' : ''} · ${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                  </div>
                  <OperatorGrid
                    view="dashboard"
                    title=""
                    rows={rows}
                    columns={columns}
                    loading={drilldown.isLoading}
                  />
                </div>
              ))}
            </WorkspacePanel>
          ) : (
            <OperatorGrid
              view="dashboard"
              title={`Source rows for ${drilldownMetric.replace('_', ' ')}`}
              rows={drilldownRows}
              columns={columns}
              loading={drilldown.isLoading}
              actions={
                <button type="button" className="text-button" onClick={() => setDrilldownMetric(null)}>
                  Close drilldown
                </button>
              }
            />
          )}
        </>
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
