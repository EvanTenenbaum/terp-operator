import { ShieldCheck, CalendarClock, Landmark, Ban } from 'lucide-react';
import { trpc } from '../../api/trpc';
import { useCommandRunner } from '../useCommandRunner';

/**
 * VendorBillDetailsTab — bill-level detail and status-aware quick actions.
 *
 * CMD-VENDOR / TER-1517 (Phase 3 PR B): Surfaces bill amount, paid, balance,
 * status badge, due reason, due date, notes, and contextual action buttons
 * (Approve / Schedule / Record Payment / Void) gated by bill status and
 * user role so the operator never sees an action that would be rejected.
 *
 * Reads from the existing `vendorPayments` tRPC query (scoped to
 * vendorBillId) for payment totals; bill header fields come from the grid
 * row passed in as props (same data the VendorPayablesView already fetches).
 */

interface VendorBillDetailsTabProps {
  vendorBillId: string;
  /** Grid row for the selected vendor bill — pre-fetched by VendorPayablesView */
  row?: Record<string, unknown>;
  /** Current user role from auth.me */
  role?: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-zinc-100 text-zinc-700',
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  scheduled: 'bg-indigo-100 text-indigo-800',
  partial: 'bg-orange-100 text-orange-700',
  paid: 'bg-green-100 text-green-800',
  voided: 'bg-red-100 text-red-700',
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

export function VendorBillDetailsTab({ vendorBillId, row, role }: VendorBillDetailsTabProps) {
  const { runCommand, isRunning } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const effectiveRole = role ?? me.data?.role;
  const canWrite = effectiveRole !== 'viewer';
  const canVoid = effectiveRole === 'manager' || effectiveRole === 'owner';

  const paymentsQuery = trpc.queries.vendorPayments.useQuery(
    { vendorBillId },
    { enabled: Boolean(vendorBillId) }
  );

  const status = String(row?.status ?? '');
  const amount = Number(row?.amount ?? 0);
  const amountPaid = Number(row?.amountPaid ?? 0);
  const outstanding = Math.max(0, amount - amountPaid);
  const badgeClass = STATUS_BADGE[status] ?? 'bg-zinc-100 text-zinc-700';

  const isTerminal = status === 'paid' || status === 'voided';
  const showApprove = status === 'open' || status === 'pending';
  const showSchedule = status === 'approved';
  const showRecord = status === 'scheduled';

  function handleApprove() {
    runCommand('approveVendorBill', { vendorBillId }, 'Approve vendor bill');
  }

  function handleSchedule() {
    runCommand(
      'scheduleVendorPayment',
      { vendorBillId, scheduledFor: new Date(Date.now() + 7 * 86400000).toISOString() },
      'Schedule vendor payment'
    );
  }

  function handleRecord() {
    runCommand('recordVendorPayment', { vendorBillId }, 'Record vendor payout');
  }

  function handleVoid() {
    // Void the most recent active vendor payment
    const activePayment = paymentsQuery.data?.find(
      (p) => String(p.status ?? '') !== 'void'
    );
    if (activePayment?.id) {
      runCommand('voidVendorPayment', { vendorPaymentId: activePayment.id }, 'Void vendor payment');
    }
  }

  return (
    <div className="context-drawer-card">
      <div className="flex items-start justify-between">
        <h2 className="mt-1 text-base font-semibold text-ink">
          {String(row?.billNo ?? 'Vendor Bill')}
        </h2>
        <span className={`mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
          {status || 'unknown'}
        </span>
      </div>

      {/* Amounts */}
      <div className="mt-3 grid gap-2">
        <div className="drawer-fact-row">
          <span>Bill amount</span>
          <strong>${moneyish(amount)}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Paid to date</span>
          <strong className="text-green-700">${moneyish(amountPaid)}</strong>
        </div>
        <div className="drawer-fact-row">
          <span>Outstanding</span>
          <strong className={outstanding > 0 ? 'text-red-600' : 'text-green-700'}>
            ${moneyish(outstanding)}
          </strong>
        </div>
      </div>

      {/* Due details */}
      <section className="mt-4">
        <h3 className="section-title">Due details</h3>
        <div className="mt-2 grid gap-2">
          <div className="drawer-fact-row">
            <span>Due date</span>
            <strong>{dateish(row?.dueDate)}</strong>
          </div>
          {row?.scheduledFor ? (
            <div className="drawer-fact-row">
              <span>Scheduled for</span>
              <strong>{dateish(row.scheduledFor)}</strong>
            </div>
          ) : null}
          {row?.dueReason ? (
            <div className="drawer-fact-row">
              <span>Due reason</span>
              <strong className="text-xs">{String(row.dueReason)}</strong>
            </div>
          ) : null}
          {row?.consignmentTriggered ? (
            <div className="drawer-fact-row">
              <span>Trigger</span>
              <strong className="text-xs text-amber-700">Consignment depletion</strong>
            </div>
          ) : null}
        </div>
      </section>

      {/* Vendor */}
      {row?.vendor ? (
        <section className="mt-4">
          <h3 className="section-title">Vendor</h3>
          <div className="mt-2 grid gap-2">
            <div className="drawer-fact-row">
              <span>Name</span>
              <strong>{String(row.vendor)}</strong>
            </div>
            {row?.poNo ? (
              <div className="drawer-fact-row">
                <span>Linked PO</span>
                <strong className="font-mono text-xs">{String(row.poNo)}</strong>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Quick actions */}
      <section className="mt-4">
        <h3 className="section-title">Actions</h3>

        {!canWrite ? (
          <p className="mt-2 text-xs text-zinc-500">
            Manager or owner required to take action on this bill.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {showApprove ? (
              <button
                type="button"
                className="primary-button compact-action"
                disabled={isRunning}
                onClick={handleApprove}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Approve
              </button>
            ) : null}

            {showSchedule ? (
              <button
                type="button"
                className="primary-button compact-action"
                disabled={isRunning}
                onClick={handleSchedule}
              >
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Schedule
              </button>
            ) : null}

            {showRecord ? (
              <button
                type="button"
                className="primary-button compact-action"
                disabled={isRunning}
                onClick={handleRecord}
              >
                <Landmark className="h-4 w-4" aria-hidden="true" />
                Record payment
              </button>
            ) : null}

            {!isTerminal && canVoid ? (
              <button
                type="button"
                className="secondary-button compact-action"
                disabled={isRunning || !paymentsQuery.data?.some((p) => String(p.status ?? '') !== 'void')}
                onClick={handleVoid}
                title="Void the most recent active payment on this bill"
              >
                <Ban className="h-4 w-4" aria-hidden="true" />
                Void payment
              </button>
            ) : null}

            {!isTerminal && !canVoid ? (
              <p className="text-xs text-zinc-500">
                Manager or owner required to void payments.
              </p>
            ) : null}
          </div>
        )}

        {isTerminal ? (
          <p className="mt-2 text-xs text-zinc-400">
            This bill is {status} — no further actions available.
          </p>
        ) : null}

        {status === 'partial' ? (
          <p className="mt-2 text-xs text-zinc-400">
            Partially paid — schedule another payment to continue.
          </p>
        ) : null}
      </section>
    </div>
  );
}
