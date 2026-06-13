import { useState } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from '../components/useCommandRunner';
import { ShadowModeBanner } from '../components/credit/ShadowModeBanner';
import { CreditQueueHealthWidget } from '../components/credit/CreditQueueHealthWidget';
import { CreditDivergencePanel } from '../components/credit/CreditDivergencePanel';
import { useUiStore } from '../store/uiStore';
import type { ViewKey } from '../../shared/types';

type FilterTab = 'stale_manual' | 'engine_disabled' | 'near_snooze_cap';
type SortOption = 'days_since_review' | 'delta_pct' | 'dollar_impact';

const tabs: { key: FilterTab; label: string }[] = [
  { key: 'stale_manual', label: 'Stale manual' },
  { key: 'engine_disabled', label: 'Engine disabled' },
  { key: 'near_snooze_cap', label: 'Near snooze cap' }
];

const sortOptions: { key: SortOption; label: string }[] = [
  { key: 'days_since_review', label: 'Days since review' },
  { key: 'delta_pct', label: 'Delta %' },
  { key: 'dollar_impact', label: 'Dollar impact' }
];

export function CreditReviewView() {
  const [filterTab, setFilterTab] = useState<FilterTab>('stale_manual');
  const [sort, setSort] = useState<SortOption>('days_since_review');
  const [divergenceOpen, setDivergenceOpen] = useState(false);
  const { runCommand, isRunning } = useCommandRunner();
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);

  const me = trpc.auth.me.useQuery();
  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';
  const isOwner = me.data?.role === 'owner';

  const queue = trpc.credit.creditReviewQueue.useQuery(
    { filterTab, sort },
    { refetchInterval: 60_000, enabled: isManagerOrOwner }
  );

  const rows = queue.data?.rows ?? [];

  if (!me.isLoading && me.data && !isManagerOrOwner) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-sm text-zinc-600">
        You need manager or owner access to view the credit review queue.
      </div>
    );
  }

  function openProfile(customerId: string) {
    const view: ViewKey = 'credit-review';
    setDrawerEntity(view, 'customer', customerId);
    setDrawerState(view, 'standard');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4">
        <ShadowModeBanner />
      </div>
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-zinc-900">Credit Review</h1>
        <div className="flex items-center gap-3">
          <div className="field-inline">
            <label htmlFor="credit-sort" className="text-sm text-zinc-600">Sort</label>
            <select
              id="credit-sort"
              className="select compact"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
            >
              {sortOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
          {isManagerOrOwner && <CreditQueueHealthWidget />}
          {isOwner && (
            <button
              type="button"
              className="secondary-button compact-action"
              onClick={() => setDivergenceOpen((v) => !v)}
              aria-label="Divergence report"
              aria-expanded={divergenceOpen}
            >
              Divergence report
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-line bg-white px-4 py-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilterTab(t.key)}
            className={`inline-flex h-7 items-center gap-1 border px-2 text-xs font-medium transition focus:outline-none focus-visible:shadow-focus ${
              filterTab === t.key
                ? 'border-line bg-amber/10 text-ink'
                : 'border-transparent text-zinc-600 hover:border-line hover:bg-panel'
            }`}
          >
            {t.label}
            {queue.data?.counts ? (
              <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-zinc-200 px-1 text-[10px] font-bold text-zinc-700">
                {t.key === 'stale_manual' && queue.data.counts.staleManual}
                {t.key === 'engine_disabled' && queue.data.counts.engineDisabled}
                {t.key === 'near_snooze_cap' && queue.data.counts.nearSnoozeCap}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {isOwner && divergenceOpen && (
        <div className="border-b border-zinc-200">
          <CreditDivergencePanel />
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {queue.isLoading ? (
          <div className="text-sm text-zinc-600">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-zinc-600">No items in this queue.</div>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Credit review queue">
            <thead>
              <tr className="border-b border-line text-xs font-semibold uppercase text-zinc-500">
                <th scope="col" className="py-1.5 pr-4">Customer</th>
                <th scope="col" className="py-1.5 pr-4">Limit</th>
                <th scope="col" className="py-1.5 pr-4">Engine Rec</th>
                <th scope="col" className="py-1.5 pr-4">Source</th>
                <th scope="col" className="py-1.5 pr-4">Days since review</th>
                <th scope="col" className="py-1.5 pr-4">Days to snooze cap</th>
                <th scope="col" className="py-1.5 pr-4">Manual reason</th>
                <th scope="col" className="py-1.5 pr-4">Engine disabled reason</th>
                <th scope="col" className="py-1.5 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.customerId} className="border-b border-line hover:bg-panel">
                  <th scope="row" className="py-1.5 pr-4 text-left font-medium text-ink">{row.customerName}</th>
                  <td className="py-1.5 pr-4">${row.creditLimit.toLocaleString('en-US')}</td>
                  <td className="py-1.5 pr-4">
                    {row.engineRecommendation !== null ? `$${row.engineRecommendation.toLocaleString('en-US')}` : '-'}
                  </td>
                  <td className="py-1.5 pr-4 capitalize">{row.source}</td>
                  <td className="py-1.5 pr-4">{row.daysSinceReview ?? '-'}</td>
                  <td className="py-1.5 pr-4">{row.daysToSnoozeCap ?? '-'}</td>
                  <td className="py-1.5 pr-4 text-zinc-600">{row.manualReason ?? '-'}</td>
                  <td className="py-1.5 pr-4 text-zinc-600">{row.engineDisabledReason ?? '-'}</td>
                  <td className="py-1.5 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="text-button text-xs"
                        aria-label={`Open profile for ${row.customerName}`}
                        onClick={() => openProfile(row.customerId)}
                      >
                        Open profile
                      </button>
                      {row.source === 'manual' && (
                        <button
                          type="button"
                          className="secondary-button compact-action text-xs"
                          disabled={isRunning}
                          aria-label={`Revert ${row.customerName} to engine credit limit`}
                          onClick={() =>
                            runCommand('revertCustomerCreditToEngine', { customerId: row.customerId }, 'Revert manual credit limit to engine from credit review')
                          }
                        >
                          Revert to engine
                        </button>
                      )}
                      {filterTab === 'stale_manual' && (
                        <button
                          type="button"
                          className="secondary-button compact-action text-xs"
                          disabled={isRunning}
                          aria-label={`Snooze stale credit reminder for ${row.customerName} by 60 days`}
                          onClick={() =>
                            runCommand('snoozeCustomerCreditReminder', { customerId: row.customerId, newReminderDays: 60 }, 'Snooze stale credit reminder from credit review')
                          }
                        >
                          Snooze 60 days
                        </button>
                      )}
                      {filterTab === 'engine_disabled' && isOwner && (
                        <button
                          type="button"
                          className="secondary-button compact-action text-xs"
                          disabled={isRunning}
                          aria-label={`Re-enable credit engine for ${row.customerName}`}
                          onClick={() =>
                            runCommand('enableCreditEngineForCustomer', { customerId: row.customerId }, 'Re-enable credit engine from credit review')
                          }
                        >
                          Enable engine
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
