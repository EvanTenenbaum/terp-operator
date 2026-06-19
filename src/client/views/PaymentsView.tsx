import { useId, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { QuickLedgerGrid } from '../components/QuickLedgerGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { ReceiptPanel } from '../components/ReceiptPanel';
import { PaymentLinkedOrdersTab } from '../components/drawerTabs/PaymentLinkedOrdersTab';
import { FilterToolbar, type FilterPreset, type StatusCount } from '../components/FilterToolbar';
import {
  BulkActionBar,
  type BulkAction,
  type BulkActionResult,
} from '../components/BulkActionBar';
import type { GridRow } from '../../shared/types';
import { GridJourney, moneyish, dateish } from './operations/shared';
import { registerPaymentTabs } from '../components/tabs/registerPaymentTabs';

// ── Register payment entity tabs for future DetailSlideover migration ────────
registerPaymentTabs();

// ── Payment filter presets (replaces FilterPresetStrip) ──────────────────────

const PAYMENT_PRESETS: FilterPreset[] = [
  { key: 'money-in', label: 'Money In', filter: 'direction:receiving' },
  { key: 'money-out', label: 'Money Out', filter: 'direction:paying' },
  {
    key: 'unapplied',
    label: 'Unapplied',
    filter: 'allocationIntent:unapplied',
  },
  { key: 'posted', label: 'Posted', filter: 'status:posted' },
  { key: 'reversed', label: 'Reversed', filter: 'status:reversed' },
];

// ── UnappliedCountBadge (unchanged — UX-J03) ─────────────────────────────────

/**
 * UX-J03: Live count of payment rows with unapplied > 0, computed from the
 * payments grid query that GridJourney already fetches.  Because tRPC deduplicates
 * queries by (procedure + input), calling the same `.grid({ view: 'payments' })`
 * here reuses the in-flight or cached response — it does NOT issue a second
 * network request.
 */
export function UnappliedCountBadge() {
  const grid = trpc.queries.grid.useQuery({ view: 'payments' });
  if (grid.isLoading || !grid.data) return null;
  const count = (grid.data as GridRow[]).filter(
    (row) =>
      Number(row.unappliedAmount ?? 0) > 0 &&
      !['reversed', 'refunded'].includes(String(row.status ?? '')),
  ).length;
  // Render nothing while zero to avoid a static "0" badge occupying space.
  if (count === 0) return null;
  return (
    <span
      className="selection-pill"
      aria-label={`${count} unapplied payment${count !== 1 ? 's' : ''}`}
      title="Payments with unapplied balance"
    >
      {count}
    </span>
  );
}

// ── usePaymentDeepLink (unchanged — UX-D01) ──────────────────────────────────

// UX-D01: deep-link helper — navigate to the payments view filtered + drawered
// to a specific payment row. Mirrors the CountPill pattern (TER-1624/E01).
export function usePaymentDeepLink() {
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const navigate = useNavigate();
  return (paymentId: string | undefined) => {
    if (!paymentId) return;
    setGridFilter('payments', `id:${paymentId}`);
    setDrawerEntity('payments', 'payment', paymentId);
    setDrawerState('payments', 'standard');
    navigate('/payments');
    setActiveView('payments');
  };
}

// ── BulkAction helpers ───────────────────────────────────────────────────────

function unappliedOf(row: GridRow): number {
  return Number(row.unappliedAmount ?? 0);
}

function amountOf(row: GridRow): number {
  return Math.abs(Number(row.amount ?? 0));
}

function isTerminal(row: GridRow): boolean {
  return ['reversed', 'refunded'].includes(String(row.status ?? ''));
}

/**
 * Build BulkAction[] for selected payment rows, preserving the same
 * status-aware logic as the original StatusActionTable (§10.5).
 */
function buildPaymentBulkActions(
  rows: GridRow[],
  runCommand: ReturnType<typeof useCommandRunner>['runCommand'],
  setNextSuccessActions:
    | ReturnType<typeof useCommandRunner>['setNextSuccessActions']
    | undefined,
  openPaymentDeepLink: (id: string | undefined) => void,
): BulkAction[] {
  if (rows.length === 0) return [];

  // If any selected row is terminal (reversed/refunded), no allocation actions.
  if (rows.some(isTerminal)) return [];

  // If any selected row has no unapplied amount, no allocation actions.
  if (rows.some((r) => unappliedOf(r) <= 0)) return [];

  // Determine label: "Auto-apply oldest" if all selected rows are fully unapplied,
  // otherwise "Allocate remaining".
  const allFullyUnapplied = rows.every((r) => unappliedOf(r) >= amountOf(r));
  const label = allFullyUnapplied ? 'Auto-apply oldest' : 'Allocate remaining';

  return [
    {
      key: 'allocate',
      label,
      primary: true,
      variant: 'primary',
      onAction: async (): Promise<BulkActionResult> => {
        // Allocate the first selected payment (single-row allocation).
        // For multi-row bulk, we'd loop — but payment allocation is single-row
        // by design since order context varies per payment.
        const paymentId = String(rows[0].id ?? '');
        setNextSuccessActions?.([
          {
            label: 'View payment',
            onAction: () => openPaymentDeepLink(paymentId),
          },
        ]);
        try {
          await runCommand(
            'allocatePayment',
            { paymentId: rows[0].id },
            `Auto-apply payment to oldest open orders`,
          );
          return { succeeded: 1, failed: 0 };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Allocation failed';
          return { succeeded: 0, failed: 1, error: message };
        }
      },
    },
    {
      key: 'markUnapplied',
      label: 'Mark unapplied',
      variant: 'secondary',
      onAction: async (): Promise<BulkActionResult> => {
        const paymentId = String(rows[0].id ?? '');
        setNextSuccessActions?.([
          {
            label: 'View payment',
            onAction: () => openPaymentDeepLink(paymentId),
          },
        ]);
        try {
          await runCommand(
            'markPaymentUnapplied',
            { paymentId: rows[0].id },
            `Mark payment as unapplied`,
          );
          return { succeeded: 1, failed: 0 };
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Mark unapplied failed';
          return { succeeded: 0, failed: 1, error: message };
        }
      },
    },
  ];
}

// ── PaymentsView ─────────────────────────────────────────────────────────────

export function PaymentsView() {
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const openPaymentDeepLink = usePaymentDeepLink();

  // ── Status counts for FilterToolbar status filter pill ──────────────────
  const statusCountsQuery = trpc.queries.statusCounts.useQuery(
    { entityType: 'payment' },
  );
  const statusCounts: StatusCount[] =
    statusCountsQuery.data?.statuses ?? [];

  const activeStatusFilter =
    useUiStore((state) => state.gridFilters.payments) ?? '';

  const handleStatusFilterChange = useCallback(
    (filter: string) => {
      setGridFilter('payments', filter);
    },
    [setGridFilter],
  );

  return (
    <GridJourney
      view="payments"
      title="Payments"
      // UX-D03: tailored empty state names the producing verb and surface.
      emptyTitle="No payments yet — press Money In"
      emptyChildren="Use the Quick Ledger above to log a cash, check, wire, or crypto receipt. Payments appear here once posted."
      prelude={() => (
        <>
          {/* Mercury-modernized filter toolbar — replaces FilterPresetStrip */}
          <FilterToolbar
            view="payments"
            presets={PAYMENT_PRESETS}
            statusCounts={statusCounts}
            activeStatusFilter={activeStatusFilter}
            onStatusFilterChange={handleStatusFilterChange}
          />
          <div className="flex items-center gap-2 px-3 py-1.5">
            <UnappliedCountBadge />
          </div>
          <QuickLedgerGrid />
        </>
      )}
      inspectorTabs={(row) =>
        row.id
          ? [
              {
                key: 'allocations',
                label: 'Allocations',
                render: () => (
                  <PaymentAllocationTools selectedPayment={row} />
                ),
              },
              {
                key: 'receipt',
                label: 'Receipt',
                render: () => (
                  <ReceiptPanel kind="payment" paymentId={String(row.id)} />
                ),
              },
              {
                key: 'linked-orders',
                label: 'Linked Orders',
                render: () => (
                  <PaymentLinkedOrdersTab paymentId={String(row.id)} />
                ),
              },
            ]
          : []
      }
      selectionActions={(rows, runCommand, setNextSuccessActions) => {
        const actions = buildPaymentBulkActions(
          rows,
          runCommand,
          setNextSuccessActions,
          openPaymentDeepLink,
        );
        if (actions.length === 0) return null;
        return (
          <BulkActionBar
            selectedCount={rows.length}
            entityLabel="payment"
            actions={actions}
            onClear={() => setSelectedRows('payments', [])}
          />
        );
      }}
    />
  );
}

// ── PaymentAllocationTools (unchanged — moved to inspector tab) ──────────────

export function PaymentAllocationTools({
  selectedPayment,
}: {
  selectedPayment?: GridRow;
}) {
  const reference = trpc.queries.reference.useQuery();
  const allocations = trpc.payments.paymentAllocations.useQuery(
    { paymentId: selectedPayment?.id },
    { enabled: Boolean(selectedPayment?.id) },
  );
  const me = trpc.auth.me.useQuery();
  // CAP-004: preview impact for selected payment using existing paymentAllocationPreview query.
  const blankCustomerId = '00000000-0000-0000-0000-000000000000';
  const paymentAmount = Number(selectedPayment?.amount ?? 0);
  const paymentCustomerId = selectedPayment?.customerId
    ? String(selectedPayment.customerId)
    : blankCustomerId;
  const allocationPreview = trpc.payments.paymentAllocationPreview.useQuery(
    {
      customerId: paymentCustomerId,
      amount: paymentAmount,
      allocationIntent: String(selectedPayment?.allocationIntent ?? 'fifo'),
    },
    {
      enabled: Boolean(
        selectedPayment?.id && selectedPayment?.customerId,
      ),
    },
  );
  const { runCommand, isRunning } = useCommandRunner();
  const canAllocate = me.data
    ? ['owner', 'manager'].includes(me.data.role)
    : false;
  const [allocationId, setAllocationId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const firstAllocation = allocations.data?.[0];
  const chosenAllocationId =
    allocationId || String(firstAllocation?.id ?? '');
  const invoices = (reference.data?.openInvoices ?? []).filter(
    (invoice) =>
      !selectedPayment?.customerId ||
      invoice.customerId === selectedPayment.customerId,
  );

  // K7 (phase7-keyboard-a11y-audit): explicit label associations ensure reliable tab order.
  const allocationSelectId = useId();
  const invoiceSelectId = useId();
  const discountInputId = useId();

  // CAP-004: detect buyer credit (negative amount or explicit direction flag)
  const isBuyerCredit =
    paymentAmount < 0 || selectedPayment?.direction === 'buyer_credit';
  const preview = allocationPreview.data;

  return (
    /* Title/subtitle chrome is owned by the wrapping WorkspacePanel
       ("Payment allocations") — this body keeps only data + controls. */
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <span className="selection-pill">
          {allocations.data?.length ?? 0} allocation(s)
        </span>
        {/* CAP-004: buyer credit badge */}
        {isBuyerCredit ? (
          <span className="selection-pill">
            Buyer Credit / Down Payment
          </span>
        ) : null}
      </div>
      {/* CAP-004: allocation impact preview */}
      {preview && selectedPayment?.id ? (
        <div className="mt-2 text-xs text-zinc-500">
          {preview.kind === 'buyer_credit' ? (
            <span>
              Buyer credit of ${moneyish(preview.unapplied)} recorded as
              unapplied credit available for future orders.
            </span>
          ) : preview.rows && preview.rows.length > 0 ? (
            <span>
              Will apply $
              {moneyish(preview.rows[0]?.applied)} to order{' '}
              {String(
                preview.rows[0]?.invoiceNo ??
                  preview.rows[0]?.invoiceId ??
                  '—',
              )}
              {Number(preview.unapplied) > 0
                ? ` · $${moneyish(preview.unapplied)} remains unapplied`
                : ''}
              .
            </span>
          ) : Number(preview.unapplied) > 0 ? (
            <span>
              Overpayment of ${moneyish(preview.unapplied)} will be recorded
              as unapplied credit available for future orders.
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={allocationSelectId} className="field-inline">
          Allocation
          <select
            id={allocationSelectId}
            className="select"
            value={chosenAllocationId}
            onChange={(event) => setAllocationId(event.target.value)}
            disabled={!allocations.data?.length || !canAllocate}
          >
            <option value="">Choose</option>
            {allocations.data?.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>
                {String(row.invoiceNo)} / ${String(row.amount)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={
            !chosenAllocationId || isRunning || !canAllocate
          }
          title={
            !canAllocate
              ? 'Manager or owner required to unallocate'
              : !chosenAllocationId
                ? 'Select an allocation to unallocate'
                : undefined
          }
          onClick={() =>
            runCommand(
              'unallocatePayment',
              { allocationId: chosenAllocationId },
              'Unallocate selected payment allocation',
            )
          }
        >
          Unallocate
        </button>
        <label htmlFor={invoiceSelectId} className="field-inline">
          Order
          <select
            id={invoiceSelectId}
            className="select"
            value={invoiceId}
            onChange={(event) => setInvoiceId(event.target.value)}
            disabled={!canAllocate}
          >
            <option value="">Choose order</option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoiceNo} / $
                {moneyish(
                  Number(invoice.total ?? 0) -
                    Number(invoice.amountPaid ?? 0),
                )}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={discountInputId} className="field-inline">
          Discount
          <input
            id={discountInputId}
            className="input compact"
            value={discountAmount}
            inputMode="decimal"
            disabled={!canAllocate}
            onChange={(event) => setDiscountAmount(event.target.value)}
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={
            !invoiceId || !selectedPayment?.id || isRunning || !canAllocate
          }
          title={
            !canAllocate
              ? 'Manager or owner required to allocate'
              : !invoiceId
                ? 'Select an order to apply to'
                : !selectedPayment?.id
                  ? 'Select a payment row first'
                  : undefined
          }
          onClick={() =>
            runCommand(
              'allocatePayment',
              { paymentId: selectedPayment?.id, invoiceId },
              'Apply payment to selected order',
            )
          }
        >
          Apply to selected
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={
            !invoiceId ||
            !discountAmount ||
            isRunning ||
            !canAllocate
          }
          title={
            !canAllocate
              ? 'Manager or owner required to apply discount'
              : !invoiceId
                ? 'Select an order first'
                : !discountAmount
                  ? 'Enter a discount amount'
                  : undefined
          }
          onClick={() =>
            runCommand(
              'applyDiscount',
              { invoiceId, amount: Number(discountAmount) },
              'Apply discount from payments surface',
            )
          }
        >
          Apply Discount
        </button>
      </div>
      {/* CAP-004: role-gate note for viewers */}
      {!canAllocate ? (
        <p className="text-xs text-zinc-400 mt-1">
          Manager or owner required to allocate payments.
        </p>
      ) : null}
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <span className="selection-pill">
          Selected{' '}
          {selectedPayment
            ? String(selectedPayment.reference ?? selectedPayment.id)
            : 'none'}
        </span>
        <span className="selection-pill">
          Unapplied ${moneyish(selectedPayment?.unappliedAmount)}
        </span>
        <span className="selection-pill success">
          {paymentAllocationLabel(selectedPayment?.allocationIntent)}
        </span>
      </div>
      {allocations.data?.length ? (
        <div className="finder-table-wrap max-h-48">
          <table className="finder-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Amount</th>
                <th>Created</th>
                <th>Trace</th>
              </tr>
            </thead>
            <tbody>
              {allocations.data.map((row) => (
                <tr key={String(row.id)}>
                  <td>
                    {String(row.invoiceNo ?? row.invoiceId ?? 'Order')}
                  </td>
                  <td>${moneyish(row.amount)}</td>
                  <td>{dateish(row.createdAt)}</td>
                  <td>
                    {String(
                      selectedPayment?.reference ??
                        selectedPayment?.method ??
                        'Payment row',
                    )}{' '}
                    -&gt; {String(row.invoiceNo ?? 'order')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function paymentAllocationLabel(intent: unknown) {
  if (intent === 'selected' || intent === 'selected_invoice')
    return 'Selected order';
  if (intent === 'unapplied') return 'Leave unapplied';
  return 'Auto-apply to oldest';
}
