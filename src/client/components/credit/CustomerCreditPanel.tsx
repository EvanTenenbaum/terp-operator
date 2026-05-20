import { useState } from 'react';
import { trpc } from '../../api/trpc';
import { useCommandRunner } from '../useCommandRunner';
import { EditCreditLimitModal } from './EditCreditLimitModal';
import { ShadowModeBanner } from './ShadowModeBanner';
import {
  formatMoney,
  formatDateish,
  progressGlyph,
  bucketSignal,
  classifyDelta,
  type SignalConfidence,
} from './creditPanelUtils';

// Local structural interfaces matching the server route output so we never need `any`.
interface CustomerCreditStatus {
  customer: {
    id: string;
    name: string;
    creditLimit: number;
    balance: number;
    creditLimitSource: 'engine' | 'manual';
    engineEnabled: boolean;
    engineMax: number | null;
    engineDisabledAt: Date | null;
    engineDisabledReason: string | null;
    creditLimitManualSetAt: Date | null;
    creditLimitManualReason: string | null;
    creditLimitReminderDays: number | null;
    creditLimitLastReviewedAt: Date | null;
    creditLimitSnoozeCount: number;
  };
  effectiveStance: {
    id: string;
    name: string;
    isCustomerOverride: boolean;
    weights: {
      revenueMomentum: number;
      cashCollection: number;
      profitability: number;
      debtAging: number;
      repaymentVelocity: number;
      tenureDepth: number;
    };
  } | null;
  latestAssessment: {
    id: string;
    createdAt: Date;
    triggeredBy: string;
    applied: boolean;
    finalLimit: number;
    recommendedLimit: number;
    baseAmount: number;
    multiplier: number;
    overallScore: number;
    scores: {
      revenueMomentum: number;
      cashCollection: number;
      profitability: number;
      debtAging: number;
      repaymentVelocity: number;
      tenureDepth: number;
    };
    confidences: {
      revenueMomentum: string;
      cashCollection: string;
      profitability: string;
      debtAging: string;
      repaymentVelocity: string;
      tenureDepth: string;
    };
    stanceId: string;
  } | null;
  coldStart: {
    invoicesPosted: number;
    invoicesRequired: number;
    tenureDays: number;
    tenureRequired: number;
    baseAmount: number;
    isWarming: boolean;
  };
  reminder: {
    effectiveReminderDays: number;
    daysSinceReview: number | null;
    staleReminderActive: boolean;
    snoozeCapDays: number;
    daysToSnoozeCap: number | null;
    nearSnoozeCap: boolean;
    snoozeCapReached: boolean;
  };
  engineRecommendationDelta: {
    deltaDollars: number;
    deltaPct: number;
    direction: 'above' | 'below' | 'within';
    ownerElevationThreshold: number;
    recommendedLimit: number;
  } | null;
  shadowMode: boolean;
}

interface AssessmentHistoryRow {
  id: string;
  createdAt: Date;
  triggeredBy: string;
  applied: boolean;
  finalLimit: number;
  recommendedLimit: number;
  baseAmount: number;
  multiplier: number;
  overallScore: number;
  scores: {
    revenueMomentum: number;
    cashCollection: number;
    profitability: number;
    debtAging: number;
    repaymentVelocity: number;
    tenureDepth: number;
  };
  confidences: {
    revenueMomentum: string;
    cashCollection: string;
    profitability: string;
    debtAging: string;
    repaymentVelocity: string;
    tenureDepth: string;
  };
  stanceId: string;
}

const SIGNAL_LABELS: Record<string, string> = {
  revenueMomentum: 'Revenue momentum',
  cashCollection: 'Cash collection',
  profitability: 'Profitability',
  debtAging: 'Debt aging',
  repaymentVelocity: 'Repayment velocity',
  tenureDepth: 'Tenure depth',
};

export function CustomerCreditPanel({ customerId }: { customerId: string }) {
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';

  const query = trpc.credit.customerCreditStatus.useQuery(
    { customerId },
    { enabled: Boolean(customerId) && isManagerOrOwner }
  );
  const status = query.data as CustomerCreditStatus | undefined;

  const [showEdit, setShowEdit] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);

  const historyQuery = trpc.credit.customerCreditAssessments.useQuery(
    { customerId, limit: 20, offset: historyOffset },
    { enabled: Boolean(customerId) && showHistory && isManagerOrOwner }
  );

  if (me.isLoading) {
    return (
      <div className="context-drawer-card">
        <div className="drawer-empty">Loading...</div>
      </div>
    );
  }

  if (me.data && !isManagerOrOwner) {
    return (
      <div className="context-drawer-card">
        <div className="drawer-empty">Manager or owner access required to view credit details.</div>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="context-drawer-card">
        <div className="drawer-empty">Loading credit status…</div>
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="context-drawer-card">
        <div className="drawer-empty text-red-600">Error loading credit status.</div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="context-drawer-card">
        <div className="drawer-empty">No credit data available.</div>
      </div>
    );
  }

  const customer = status.customer;
  const utilization =
    customer.creditLimit > 0
      ? Math.round((customer.balance / customer.creditLimit) * 100)
      : 0;

  const canSnooze =
    status.reminder.staleReminderActive &&
    !status.reminder.nearSnoozeCap &&
    !status.reminder.snoozeCapReached;

  return (
    <div className="grid gap-3">
      <ShadowModeBanner />
      <div className="context-drawer-card">
        <h2 className="mt-1 truncate text-base font-semibold text-ink">{customer.name}</h2>
        <div className="mt-3 grid gap-2">
          <div className="drawer-fact-row">
            <span>Credit limit</span>
            <strong>
              {formatMoney(customer.creditLimit)} ({customer.creditLimitSource})
            </strong>
          </div>
          <div className="drawer-fact-row">
            <span>Balance / utilization</span>
            <strong>
              {formatMoney(customer.balance)} / {utilization}%
            </strong>
          </div>
          {status.shadowMode ? (
            <div className="drawer-fact-row">
              <span>Shadow mode</span>
              <strong>On</strong>
            </div>
          ) : null}
          {status.effectiveStance ? (
            <div className="drawer-fact-row">
              <span>Stance</span>
              <strong>
                {status.effectiveStance.name}
                {status.effectiveStance.isCustomerOverride ? ' (override)' : ''}
              </strong>
            </div>
          ) : null}
        </div>

        {status.latestAssessment ? (
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="section-title">Latest assessment</h3>
            <div className="mt-2 grid gap-2">
              <div className="drawer-fact-row">
                <span>Final limit</span>
                <strong>{formatMoney(status.latestAssessment.finalLimit)}</strong>
              </div>
              <div className="drawer-fact-row">
                <span>Overall score</span>
                <strong>{status.latestAssessment.overallScore}</strong>
              </div>
              <div className="drawer-fact-row">
                <span>Applied</span>
                <strong>{status.latestAssessment.applied ? 'Yes' : 'No'}</strong>
              </div>
              <div className="drawer-fact-row">
                <span>Shadow</span>
                <strong>{status.shadowMode ? 'On' : 'Off'}</strong>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Object.entries(SIGNAL_LABELS).map(([key, label]) => {
                const score =
                  status.latestAssessment!.scores[key as keyof typeof status.latestAssessment.scores];
                const confidence =
                  status.latestAssessment!.confidences[key as keyof typeof status.latestAssessment.confidences];
                const bucket = bucketSignal(score, confidence as SignalConfidence);
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded border border-line bg-panel px-2 py-1 text-xs"
                  >
                    <span className="text-zinc-600">{label}</span>
                    <span className="font-semibold text-ink">
                      {bucket} · {confidence}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {status.coldStart.isWarming ? (
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="section-title">Cold-start warming</h3>
            <div className="mt-2 grid gap-2 text-xs text-zinc-600">
              <div className="drawer-fact-row">
                <span>Invoices</span>
                <strong>
                  {progressGlyph(status.coldStart.invoicesPosted, status.coldStart.invoicesRequired)}{' '}
                  {status.coldStart.invoicesPosted} / {status.coldStart.invoicesRequired}
                </strong>
              </div>
              <div className="drawer-fact-row">
                <span>Tenure</span>
                <strong>
                  {progressGlyph(status.coldStart.tenureDays, status.coldStart.tenureRequired)}{' '}
                  {status.coldStart.tenureDays} / {status.coldStart.tenureRequired} days
                </strong>
              </div>
              <div className="drawer-fact-row">
                <span>Base</span>
                <strong>
                  {progressGlyph(status.coldStart.baseAmount, 1)}{' '}
                  {formatMoney(status.coldStart.baseAmount)}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {customer.creditLimitSource === 'manual' && status.engineRecommendationDelta ? (
          <div className="mt-4 border-t border-line pt-3">
            <div className="drawer-fact-row">
              <span>Engine delta</span>
              <strong>{classifyDelta(status.engineRecommendationDelta)}</strong>
            </div>
          </div>
        ) : null}

        {customer.engineEnabled === false ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Engine disabled</strong>
            {customer.engineDisabledReason ? `: ${customer.engineDisabledReason}` : '.'}
          </div>
        ) : null}

        {status.reminder.staleReminderActive &&
        !status.reminder.nearSnoozeCap &&
        !status.reminder.snoozeCapReached ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Stale manual override — {status.reminder.daysSinceReview ?? '?'} days since review
            {status.reminder.effectiveReminderDays > 0
              ? ` · reminder set to ${status.reminder.effectiveReminderDays} days`
              : null}
            .
          </div>
        ) : null}

        {status.reminder.nearSnoozeCap || status.reminder.snoozeCapReached ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {status.reminder.snoozeCapReached
              ? 'Snooze cap reached. Re-confirm via Edit or revert to engine.'
              : `Near snooze cap. Review and update the credit limit soon.${
                  status.reminder.daysToSnoozeCap !== null && status.reminder.daysToSnoozeCap >= 0
                    ? ` (${status.reminder.daysToSnoozeCap} day${
                        status.reminder.daysToSnoozeCap === 1 ? '' : 's'
                      } to cap)`
                    : ''
                }`}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowEdit(true)}
            disabled={isRunning}
          >
            Edit
          </button>
          {customer.creditLimitSource === 'manual' ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                runCommand('revertCustomerCreditToEngine', { customerId }, 'Revert manual credit limit to engine')
              }
              disabled={isRunning}
            >
              Revert
            </button>
          ) : null}
          {canSnooze ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                runCommand('snoozeCustomerCreditReminder', {
                  customerId,
                  newReminderDays: 60,
                }, 'Snooze customer credit reminder by 60 days')
              }
              disabled={isRunning}
            >
              Snooze 60 days
            </button>
          ) : null}
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setShowHistory((prev) => !prev);
              setHistoryOffset(0);
            }}
          >
            {showHistory ? 'Hide history' : 'Show history'}
          </button>
        </div>
      </div>

      {showHistory ? (
        <AssessmentHistoryDrawer
          customerId={customerId}
          offset={historyOffset}
          setOffset={setHistoryOffset}
          query={historyQuery}
        />
      ) : null}

      <EditCreditLimitModal
        customerId={customerId}
        currentLimit={customer.creditLimit}
        // "Engine recommends" surfaces the pre-clamp recommendation
        // (`recommendedLimit`), matching the command-server formula that
        // gates owner elevation on 1.5 * recommendedLimit. `finalLimit` is
        // shown separately under the latest assessment block above.
        engineRecommendation={status.latestAssessment?.recommendedLimit ?? null}
        ownerElevationThreshold={
          status.engineRecommendationDelta?.ownerElevationThreshold ?? null
        }
        source={customer.creditLimitSource}
        open={showEdit}
        onClose={() => setShowEdit(false)}
      />
    </div>
  );
}

function AssessmentHistoryDrawer({
  customerId,
  offset,
  setOffset,
  query,
}: {
  customerId: string;
  offset: number;
  setOffset: (value: number) => void;
  query: ReturnType<typeof trpc.credit.customerCreditAssessments.useQuery>;
}) {
  const data = query.data as
    | { rows: AssessmentHistoryRow[]; total: number }
    | undefined;

  return (
    <div className="context-drawer-card">
      <h3 className="section-title">Assessment history</h3>
      {query.isLoading ? (
        <div className="drawer-empty">Loading…</div>
      ) : query.error ? (
        <div className="drawer-empty text-red-600">Error loading history.</div>
      ) : !data || data.rows.length === 0 ? (
        <div className="drawer-empty">No assessments yet.</div>
      ) : (
        <>
          <div className="mt-2 grid gap-1 text-xs">
            {data.rows.map((row) => (
              <div key={row.id} className="activity-row">
                <span>{formatDateish(row.createdAt)}</span>
                <span>{formatMoney(row.finalLimit)}</span>
                <span>{row.applied ? 'Applied' : 'Shadow'}</span>
                <span>Score {row.overallScore}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-600">
            <span>
              {data.total} total · page {Math.floor(offset / 20) + 1} of{' '}
              {Math.max(1, Math.ceil(data.total / 20))}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="secondary-button"
                disabled={offset === 0 || query.isLoading}
                onClick={() => setOffset(Math.max(0, offset - 20))}
              >
                Prev
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={offset + 20 >= data.total || query.isLoading}
                onClick={() => setOffset(offset + 20)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
