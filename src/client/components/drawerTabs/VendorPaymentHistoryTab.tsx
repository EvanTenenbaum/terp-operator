import { CalendarClock, Landmark } from 'lucide-react';
import { trpc } from '../../api/trpc';
import { useCommandRunner } from '../useCommandRunner';

/**
 * VendorPaymentHistoryTab — scheduled and recorded payment history for a bill.
 *
 * CMD-VENDOR / TER-1517 (Phase 3 PR B): Shows all scheduled and recorded
 * payments for the selected vendor bill with running totals, and provides
 * a "Schedule payout" button when the bill is in approved status.
 *
 * Uses `queries.vendorPayments({ vendorBillId })` which is already defined
 * in the tRPC router and returns payment rows with method, amount, reference,
 * status, and createdAt.
 *
 * Note: The tRPC `vendorPayments` query does not currently return a
 * `scheduledFor` column per payment row (scheduling lives on the bill row
 * itself via `scheduled_for`). A dedicated per-payment scheduled date would
 * require a schema or query extension.
 * TODO: expose `scheduled_for` per-payment once the schema supports it.
 */

interface VendorPaymentHistoryTabProps {
  vendorBillId: string;
  /** Grid row for the selected vendor bill — pre-fetched by VendorPayablesView */
  row?: Record<string, unknown>;
  /** Current user role — used to gate the Schedule action */
  role?: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  wire: 'Wire',
  ach: 'ACH',
  card: 'Card',
};

function moneyish(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

function dateish(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}

function statusTone(status: unknown): string {
  const s = String(status ?? '').toLowerCase();
  if (s === 'void') return 'text-red-500';
  if (s === 'recorded' || s === '') return 'text-green-700';
  return 'text-zinc-500';
}

export function VendorPaymentHistoryTab({ vendorBillId, row, role }: VendorPaymentHistoryTabProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const effectiveRole = role ?? me.data?.role;
  const canWrite = effectiveRole !== 'viewer';

  const paymentsQuery = trpc.queries.vendorPayments.useQuery(
    { vendorBillId },
    { enabled: Boolean(vendorBillId) }
  );

  const allPayments = paymentsQuery.data ?? [];
  const activePayments = allPayments.filter((p) => String(p.status ?? '') !== 'void');
  const voidedPayments = allPayments.filter((p) => String(p.status ?? '') === 'void');

  const totalPaid = activePayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const totalOwed = Number(row?.amount ?? 0);
  const outstanding = Math.max(0, totalOwed - Number(row?.amountPaid ?? totalPaid));

  const status = String(row?.status ?? '');
  const canSchedule = status === 'approved';

  function handleSchedule() {
    runCommand(
      'scheduleVendorPayment',
      {
        vendorBillId,
        scheduledFor: new Date(Date.now() + 7 * 86400000).toISOString()
      },
      'Schedule vendor payment'
    );
  }

  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 text-base font-semibold text-ink">Payment history</h2>
      <p className="mt-1 text-xs text-zinc-500">
        {String(row?.billNo ?? 'Bill')} · {String(row?.vendor ?? '')}
      </p>

      {/* Running totals */}
      <div className="mt-3 grid gap-2">
        <div className="drawer-fact-row">
          <span>Total owed</span>
          <strong>${moneyish(totalOwed)}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Total paid</span>
          <strong className="text-green-700">${moneyish(row?.amountPaid ?? totalPaid)}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Outstanding</span>
          <strong className={outstanding > 0 ? 'text-red-600' : 'text-green-700'}>
            ${moneyish(outstanding)}
          </strong>
        </div>
        {row?.scheduledFor ? (
          <div className="drawer-fact-row">
            <span>Scheduled for</span>
            <strong>{dateish(row.scheduledFor)}</strong>
          </div>
        ) : null}
      </div>

      {/* Schedule action */}
      {canSchedule && canWrite ? (
        <div className="mt-4">
          <button
            type="button"
            className="primary-button compact-action"
            disabled={isRunning}
            onClick={handleSchedule}
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            Schedule payout (+7 days)
          </button>
        </div>
      ) : null}

      {canSchedule && !canWrite ? (
        <p className="mt-3 text-xs text-zinc-500">
          Manager or owner required to schedule payouts.
        </p>
      ) : null}

      {/* Active payments */}
      <section className="mt-4">
        <h3 className="section-title">
          Recorded payments ({activePayments.length})
        </h3>
        {paymentsQuery.isLoading ? (
          <div className="drawer-empty mt-2">Loading…</div>
        ) : activePayments.length ? (
          <div className="mt-2 grid gap-1 text-xs">
            {activePayments.map((payment) => (
              <div key={String(payment.id)} className="activity-row">
                <span className="font-medium text-ink">
                  ${moneyish(payment.amount)}
                </span>
                <span className="text-zinc-500">
                  {METHOD_LABELS[String(payment.method ?? '')] ?? String(payment.method ?? '-')}
                </span>
                {payment.reference ? (
                  <span className="font-mono text-zinc-400">
                    {String(payment.reference)}
                  </span>
                ) : null}
                <span className={statusTone(payment.status)}>
                  {String(payment.status ?? 'recorded')}
                </span>
                <span className="text-zinc-400">{dateish(payment.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-400">
            No payments recorded yet for this bill.
          </p>
        )}
      </section>

      {/* Voided payments */}
      {voidedPayments.length ? (
        <section className="mt-4">
          <h3 className="section-title">
            Voided payments ({voidedPayments.length})
          </h3>
          <div className="mt-2 grid gap-1 text-xs">
            {voidedPayments.map((payment) => (
              <div key={String(payment.id)} className="activity-row opacity-60">
                <span className="font-medium line-through text-zinc-400">
                  ${moneyish(payment.amount)}
                </span>
                <span className="text-zinc-400">
                  {METHOD_LABELS[String(payment.method ?? '')] ?? String(payment.method ?? '-')}
                </span>
                <span className="text-red-400">voided</span>
                <span className="text-zinc-300">{dateish(payment.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Record payment hint */}
      {status === 'scheduled' && canWrite ? (
        <div className="mt-4 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-zinc-400" aria-hidden="true" />
          <p className="text-xs text-zinc-500">
            Use the Details tab to record a payment against this scheduled bill.
          </p>
        </div>
      ) : null}
    </div>
  );
}
