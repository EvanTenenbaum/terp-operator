import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { trpc } from '../api/trpc';
import { StatusActionBar, type StatusActionTable } from '../components/templates';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import type { GridRow, ViewKey } from '../../shared/types';
import { GridJourney } from './operations/shared';

export function CloseoutView() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [adjustmentAmount, setAdjustmentAmount] = useState('0');
  const [adjustmentMemo, setAdjustmentMemo] = useState('');
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [expandedBlocker, setExpandedBlocker] = useState<string | null>(null);
  const preview = trpc.queries.closeoutPreview.useQuery({ period });
  const { runCommand, isRunning } = useCommandRunner();
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setActiveSettingsTab = useUiStore((state) => state.setActiveSettingsTab);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const controlTotals = preview.data?.controlTotals ?? {};
  const blockers = preview.data?.blockers ?? [];
  const openWorkCount = preview.data?.openWorkCount ?? preview.data?.unsafeRows ?? 0;
  const readiness = closeoutReadiness(preview.data?.locked, openWorkCount);
  const blockerRows = trpc.queries.closeoutBlockerRows.useQuery(
    { period, blockerId: expandedBlocker ?? '' },
    { enabled: Boolean(expandedBlocker) }
  );

  function openBlocker(blockerId?: string) {
    const target = blockerTarget(blockerId);
    if (target.settingsTab) setActiveSettingsTab(target.settingsTab);
    setGridFilter(target.filterView ?? target.view, target.filter);
    setActiveView(target.view);
  }

  return (
    <div className="view-stack">
      <div className="control-band">
        <label className="field-inline">
          Period
          <input className="input compact" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
        <span className="selection-pill">Open work: {openWorkCount}</span>
        <span className={`selection-pill ${readiness.tone}`}>{readiness.label}</span>
        <span className="text-sm text-zinc-700">Batches: {controlTotals.batches ?? 0}</span>
        <span className="text-sm text-zinc-700">Sales: {controlTotals.salesOrders ?? 0}</span>
        <span className="text-sm text-zinc-700">POs: {controlTotals.purchaseOrders ?? 0}</span>
        <span className="text-sm text-zinc-700">Commands: {controlTotals.commands ?? 0}</span>
        {(() => {
          // Spec §10.10 — status-aware primary for the closeout period. The
          // period is not a grid row, so the band feeds the same decision
          // engine a synthetic row (status: open | locked from
          // closeoutPreview). With open work the primary becomes the amber
          // "Fix unsafe rows (N)" warning-tone action; Lock and Archive stay
          // visible in the tray (disabled-with-reason) so no verb is lost.
          const fixUnsafe = {
            key: 'fix-unsafe',
            label: `Fix unsafe rows (${openWorkCount})`,
            tone: 'warning' as const,
            run: () => openBlocker(blockers[0]?.id)
          };
          const lock = (disabled: boolean) => ({
            key: 'lock',
            label: 'Lock period',
            disabled,
            disabledReason: 'Review open work before locking this period',
            run: () => runCommand('lockPeriod', { period }, 'Lock closeout period')
          });
          const archive = (disabled: boolean, reason: string) => ({
            key: 'archive',
            label: 'Archive',
            icon: <FileDown className="h-4 w-4" aria-hidden="true" />,
            disabled,
            disabledReason: reason,
            run: () => runCommand('archivePeriod', { period, verified: true }, 'Archive locked period')
          });
          const adjust = {
            key: 'adjust',
            label: showAdjustment ? 'Hide adjustment' : 'Adjustment',
            run: () => setShowAdjustment((value) => !value)
          };
          const closeoutTable: StatusActionTable = {
            rules: [
              { when: (row) => row.status === 'open' && openWorkCount > 0, primary: fixUnsafe, tray: [adjust, lock(true), archive(true, 'Lock the period first')] },
              { when: 'open', primary: lock(false), tray: [adjust, archive(true, 'Lock the period first')] },
              { when: (row) => row.status === 'locked' && openWorkCount > 0, primary: fixUnsafe, tray: [adjust, archive(true, 'Review open work before archiving')] },
              { when: 'locked', primary: archive(false, ''), tray: [adjust] },
              // Catch-all: every closeout verb stays reachable.
              { when: () => true, primary: null, tray: [fixUnsafe, lock(false), archive(false, ''), adjust] }
            ]
          };
          const periodRow: GridRow = { id: period, status: preview.data?.locked ? 'locked' : 'open' };
          return <StatusActionBar rows={[periodRow]} table={closeoutTable} busy={isRunning} />;
        })()}
      </div>
      {showAdjustment ? (
        <div className="control-band subtle-band">
          <label className="field-inline">
            Adj
            <input className="input compact" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} />
          </label>
          <label className="field-inline">
            Memo
            <input className="input" value={adjustmentMemo} onChange={(event) => setAdjustmentMemo(event.target.value)} />
          </label>
          <button className="secondary-button" type="button" disabled={!adjustmentMemo} onClick={() => runCommand('postPeriodAdjustments', { period, amount: Number(adjustmentAmount), memo: adjustmentMemo }, 'Post closeout adjustment')}>
          Post adjustment
          </button>
        </div>
      ) : null}
      <section className="inline-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="section-title">Archive readiness</h2>
          </div>
          <span className={preview.data?.eligible ? 'selection-pill success' : 'selection-pill warning'}>{preview.data?.eligible ? 'Ready' : 'Open work'}</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(controlTotals).map(([key, value]) => (
            <div key={key} className="metric-mini">
              <span className="text-[11px] uppercase text-zinc-500">{key.replace(/([A-Z])/g, ' $1')}</span>
              <strong>{Number(value ?? 0).toLocaleString('en-US')}</strong>
            </div>
          ))}
        </div>
        {/* CAP-025 / Phase 5 — inline expandable blocker drilldown (TER-1504) */}
        {blockers.length ? (
          <div className="mt-3 grid gap-2 text-sm">
            {blockers.map((blocker) => {
              const isExpanded = expandedBlocker === String(blocker.id);
              const descriptions: Record<string, string> = {
                unsafeBatches: 'Intake lots still in draft or needs-fix state must be reviewed, posted, or deleted before the period can be archived.',
                unsafePurchaseOrders: 'Purchase orders that have not been fully received are still open. Receive, cancel, or defer them before archiving.',
                openConnectors: 'Inbound connector requests are awaiting review. Approve, reject, or route each one before archiving.',
                openFulfillment: 'Fulfillment picks are in open or packed state. Complete or cancel them before archiving.',
                failedCommands: 'Commands in the action log failed and have not been retried. Review each failure and retry or create a correction.',
                unresolvedDrafts: 'Sales orders are still in draft state. Confirm or cancel them before archiving.',
              };
              return (
                <div key={String(blocker.id)} className="border border-line rounded">
                  <button
                    type="button"
                    className="closeout-blocker-row w-full"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedBlocker(isExpanded ? null : String(blocker.id))}
                  >
                    <span className="font-medium text-ink">{String(blocker.label)}</span>
                    <div className="flex items-center gap-2">
                      <span className="selection-pill warning">{Number(blocker.count ?? 0).toLocaleString('en-US')}</span>
                      <span className="text-xs text-zinc-500" aria-hidden="true">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>
                  {isExpanded ? (
                    <div className="border-t border-line bg-panel px-3 py-3" data-testid="blocker-drilldown">
                      <p className="text-xs text-zinc-600">{descriptions[String(blocker.id)] ?? 'Review open work before archiving.'}</p>
                      <div className="ml-2 mt-2 grid gap-1 text-xs border-l-2 border-amber-200 pl-3">
                        {blockerRows.isLoading ? (
                          <span className="text-zinc-400">Loading…</span>
                        ) : blockerRows.data?.rows.length ? (
                          blockerRows.data.rows.map((row) => (
                            <button
                              key={String(row.id)}
                              type="button"
                              className="activity-row text-left hover:bg-zinc-50 cursor-pointer"
                              onClick={() => { setExpandedBlocker(null); openBlocker(String(blocker.id)); }}
                            >
                              <span className="font-mono text-zinc-400">{String(row.id).slice(0, 8)}…</span>
                              <span className="truncate">{String(row.label)}</span>
                              <span className={String(row.status) === 'failed' ? 'text-red-600' : 'text-amber-700'}>{String(row.status)}</span>
                            </button>
                          ))
                        ) : (
                          <span className="text-zinc-400">No rows returned.</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="text-button mt-2 text-xs"
                        onClick={() => { setExpandedBlocker(null); openBlocker(String(blocker.id)); }}
                      >
                        View all in {String(blocker.label).toLowerCase()} →
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
      <GridJourney view="closeout" title="Archive Runs" />
    </div>
  );
}

function closeoutReadiness(locked: unknown, openWorkCount: number) {
  if (openWorkCount > 0) return { label: 'Review open work', tone: 'warning' };
  if (locked) return { label: 'Ready to archive', tone: 'success' };
  return { label: 'Ready to lock', tone: 'success' };
}

function blockerTarget(blockerId?: string): { view: ViewKey; filter: string; filterView?: ViewKey; settingsTab?: 'requests' | 'actions' | 'archive' } {
  const map: Record<string, { view: ViewKey; filter: string; filterView?: ViewKey; settingsTab?: 'requests' | 'actions' | 'archive' }> = {
    unsafeBatches: { view: 'intake', filter: 'status:draft,needs_fix' },
    unsafePurchaseOrders: { view: 'purchaseOrders', filter: 'status:draft,approved,ordered,partially_received' },
    // TER-1664 / UX-A12: Settings → Requests is the home for connector review.
    openConnectors: { view: 'settings', filterView: 'connectors', settingsTab: 'requests', filter: 'status:open,pending_review,approved,accepted,routed,posting,failed' },
    openFulfillment: { view: 'fulfillment', filter: 'status:open,packed' },
    // UX-A13: the Action Log's canonical home is the recovery nav route — the
    // old Settings "Action log" tab is now a redirect to /recovery.
    failedCommands: { view: 'recovery', filter: 'failed' },
    unresolvedDrafts: { view: 'orders', filter: 'status:draft' }
  };
  return map[blockerId ?? ''] ?? { view: 'dashboard', filter: '' };
}
