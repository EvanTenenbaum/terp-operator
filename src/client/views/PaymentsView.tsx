import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { FilterPresetStrip, StatusActionBar, type StatusActionTable } from '../components/templates';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { QuickLedgerGrid } from '../components/QuickLedgerGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { ReceiptPanel } from '../components/ReceiptPanel';
import { PaymentLinkedOrdersTab } from '../components/drawerTabs/PaymentLinkedOrdersTab';
import type { GridRow } from '../../shared/types';
import { GridJourney, moneyish, dateish } from './operations/shared';

/**
 * UX-J03: Live count of payment rows with unapplied > 0, computed from the
 * payments grid query that GridJourney already fetches.  Because tRPC deduplicates
 * queries by (procedure + input), calling the same `.grid({ view: 'payments' })`
 * here reuses the in-flight or cached response — it does NOT issue a second
 * network request.
 */
function UnappliedCountBadge() {
  const grid = trpc.queries.grid.useQuery({ view: 'payments' });
  if (grid.isLoading || !grid.data) return null;
  const count = (grid.data as GridRow[]).filter(
    (row) => Number(row.unappliedAmount ?? 0) > 0 &&
             !['reversed', 'refunded'].includes(String(row.status ?? ''))
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

// UX-D01: deep-link helper — navigate to the payments view filtered + drawered
// to a specific payment row. Mirrors the CountPill pattern (TER-1624/E01).
function usePaymentDeepLink() {
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

export function PaymentsView() {
  const selectedRows = useUiStore((state) => state.selectedRows.payments);
  const selectedPayment = selectedRows?.[0];
  // UX-D01: deep-link for success toast "View payment" action
  const openPaymentDeepLink = usePaymentDeepLink();
  return (
    <GridJourney
      view="payments"
      title="Payments"
      // UX-D03: tailored empty state names the producing verb and surface.
      emptyTitle="No payments yet — press Money In"
      emptyChildren="Use the Quick Ledger above to log a cash, check, wire, or crypto receipt. Payments appear here once posted."
      prelude={() => (
        <>
          <QuickLedgerGrid />
          {/* Selection-bound allocation tools live in consistent WorkspacePanel
              chrome (collapsible, focusable) instead of a bare inline panel. */}
          {selectedPayment ? (
            <WorkspacePanel panelId="payments-allocations" title="Payment allocations" subtitle="Uses the selected payment row below." headingLevel={2}>
              <PaymentAllocationTools selectedPayment={selectedPayment} />
            </WorkspacePanel>
          ) : null}
        </>
      )}
      inspectorTabs={(row) =>
        row.id
          ? [
              {
                key: 'receipt',
                label: 'Receipt',
                render: () => <ReceiptPanel kind="payment" paymentId={String(row.id)} />
              },
              {
                // UX-J06: invoice→order cross-links in the payment inspector.
                // Uses the existing setGridFilter/setDrawerEntity/navigate
                // pattern (same CountPill / TER-1624 lineage).
                key: 'linked-orders',
                label: 'Linked Orders',
                render: () => <PaymentLinkedOrdersTab paymentId={String(row.id)} />
              }
            ]
          : []
      }
      actions={() => (
        <>
          {/* GH #354 presets, now via the shared template.
              UX-J03: "Unapplied (N)" preset surfaces the standing unapplied queue.
              The filter uses field:val syntax that gridFilterUtils understands
              (unappliedAmount column > 0 is expressed as a non-zero presence
              filter string; the grid's quickFilter text-search will exclude rows
              where unappliedAmount is 0 or null when this preset is active). */}
          <FilterPresetStrip
            view="payments"
            ariaLabel="Filter payments"
             presets={[
               // SX-J04: Presets updated to use field values the grid filter can
               // evaluate (simple string matching via applyGridFilter). The filter
               // cannot do numeric comparisons (>, <, etc.) or range queries.
               //
               // "Unpaid" shows posted (active) payments not yet reversed/refunded.
               { label: 'Unpaid', filter: 'status:posted' },
               // "Overdue" is not directly evaluable — payments are point-in-time
               // events without due dates (due-date tracking lives on vendor_bills
               // and invoices). A server-side filter on vendor_bill due dates would
               // be needed for true overdue detection.
               //
               // Server-side filter needed: category-based overdue detection.
               { label: 'Overdue', filter: 'direction:paying', title: 'Payment direction:paying (proxy for outgoing/bill payments; true overdue requires vendor_bill due-date filter — server-side filter needed)' },
               {
                 key: 'unapplied',
                 // UX-J03: live count pill is rendered inline after the label via
                 // a sibling element, not inside FilterPresetStrip, to keep the
                 // template's label: string contract intact.
                 //
                 // SX-J04: Grid filter can only do string matching on field values,
                 // so allocationIntent:unapplied catches explicitly-unapplied
                 // payments but misses partially-applied ones (those have fifo
                 // intent but unappliedAmount > 0). A server-side numeric filter
                 // on unappliedAmount > 0 would be needed for full coverage.
                 label: 'Unapplied',
                 filter: 'allocationIntent:unapplied',
                 title: 'Payment allocationIntent:unapplied (explicitly-unapplied only; partially-applied payments not covered — server-side numeric filter needed)'
               }
             ]}
          />
          {/* UX-J03: standing count pill — always visible next to the preset strip
              so the accounting operator sees the unapplied queue size at a glance.
              Count is derived from grid data already on the wire (no extra query). */}
          <UnappliedCountBadge />
        </>
      )}
      selectionActions={(rows, runCommand, setNextSuccessActions) => {
        // Spec §10.5 — status-aware primary for payments. The spec's
        // unapplied / partially_applied / applied states are NOT payment
        // statuses (real payments.status: posted | refunded | reversed,
        // verified in schema + commandBus); applied-ness is derived from
        // unappliedAmount vs amount, and buyer credits are a direction, not
        // a status. allocatePayment requires unapplied > 0. Unallocate and
        // discounts keep their inputs in the allocations WorkspacePanel
        // (in-page work tool per the templates.md decision rule).
        const unappliedOf = (row: GridRow) => Number(row.unappliedAmount ?? 0);
        const amountOf = (row: GridRow) => Math.abs(Number(row.amount ?? 0));
        // UX-D01: "View payment" action on allocate success toast. Call
        // setNextSuccessActions immediately before runCommand so the hook
        // attaches the action to the success toast. runCommand stays 3-arg,
        // preserving the existing test contract in statusTables.test.tsx.
        const allocate = (label: string) => ({
          key: 'allocate',
          label,
          icon: <Check className="h-4 w-4" aria-hidden="true" />,
          run: (r: GridRow[]) => {
            const paymentId = String(r[0].id ?? '');
            setNextSuccessActions?.([{ label: 'View payment', onAction: () => openPaymentDeepLink(paymentId) }]);
            return runCommand('allocatePayment', { paymentId: r[0].id }, 'Auto-apply payment to oldest open orders');
          }
        });
        const paymentsTable: StatusActionTable = {
          rules: [
            { when: (row) => ['reversed', 'refunded'].includes(String(row.status ?? '')), primary: null, tray: [] },
            { when: (row) => unappliedOf(row) > 0 && unappliedOf(row) >= amountOf(row), primary: allocate('Auto-apply oldest'), tray: [] },
            { when: (row) => unappliedOf(row) > 0, primary: allocate('Allocate remaining'), tray: [] },
            // Fully applied: unallocate/discount live in the allocations panel.
            { when: (row) => unappliedOf(row) <= 0, primary: null, tray: [] },
            // Catch-all: allocation stays reachable on mixed selections.
            { when: () => true, primary: null, tray: [allocate('Auto-apply oldest')] }
          ]
        };
        return <StatusActionBar rows={rows} table={paymentsTable} />;
      }}
    />
  );
}

function PaymentAllocationTools({ selectedPayment }: { selectedPayment?: GridRow }) {
  const reference = trpc.queries.reference.useQuery();
  const allocations = trpc.queries.paymentAllocations.useQuery({ paymentId: selectedPayment?.id }, { enabled: Boolean(selectedPayment?.id) });
  const me = trpc.auth.me.useQuery();
  // CAP-004: preview impact for selected payment using existing paymentAllocationPreview query.
  const blankCustomerId = '00000000-0000-0000-0000-000000000000';
  const paymentAmount = Number(selectedPayment?.amount ?? 0);
  const paymentCustomerId = selectedPayment?.customerId ? String(selectedPayment.customerId) : blankCustomerId;
  const allocationPreview = trpc.queries.paymentAllocationPreview.useQuery(
    { customerId: paymentCustomerId, amount: paymentAmount, allocationIntent: String(selectedPayment?.allocationIntent ?? 'fifo') },
    { enabled: Boolean(selectedPayment?.id && selectedPayment?.customerId) }
  );
  const { runCommand, isRunning } = useCommandRunner();
  const canAllocate = me.data ? ['owner', 'manager'].includes(me.data.role) : false;
  const [allocationId, setAllocationId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const firstAllocation = allocations.data?.[0];
  const chosenAllocationId = allocationId || String(firstAllocation?.id ?? '');
  const invoices = (reference.data?.openInvoices ?? []).filter((invoice) => !selectedPayment?.customerId || invoice.customerId === selectedPayment.customerId);

  // K7 (phase7-keyboard-a11y-audit): explicit label associations ensure reliable tab order.
  const allocationSelectId = useId();
  const invoiceSelectId = useId();
  const discountInputId = useId();

  // CAP-004: detect buyer credit (negative amount or explicit direction flag)
  const isBuyerCredit = paymentAmount < 0 || selectedPayment?.direction === 'buyer_credit';
  const preview = allocationPreview.data;

  return (
    /* Title/subtitle chrome is owned by the wrapping WorkspacePanel
       ("Payment allocations") — this body keeps only data + controls. */
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <span className="selection-pill">{allocations.data?.length ?? 0} allocation(s)</span>
        {/* CAP-004: buyer credit badge */}
        {isBuyerCredit ? (
          <span className="selection-pill">Buyer Credit / Down Payment</span>
        ) : null}
      </div>
      {/* CAP-004: allocation impact preview */}
      {preview && selectedPayment?.id ? (
        <div className="mt-2 text-xs text-zinc-500">
          {preview.kind === 'buyer_credit' ? (
            <span>Buyer credit of ${moneyish(preview.unapplied)} recorded as unapplied credit available for future orders.</span>
          ) : preview.rows && preview.rows.length > 0 ? (
            <span>Will apply ${moneyish(preview.rows[0]?.applied)} to order {String(preview.rows[0]?.invoiceNo ?? preview.rows[0]?.invoiceId ?? '—')}
              {Number(preview.unapplied) > 0 ? ` · $${moneyish(preview.unapplied)} remains unapplied` : ''}.
            </span>
          ) : Number(preview.unapplied) > 0 ? (
            <span>Overpayment of ${moneyish(preview.unapplied)} will be recorded as unapplied credit available for future orders.</span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={allocationSelectId} className="field-inline">
          Allocation
          <select id={allocationSelectId} className="select" value={chosenAllocationId} onChange={(event) => setAllocationId(event.target.value)} disabled={!allocations.data?.length || !canAllocate}>
            <option value="">Choose</option>
            {allocations.data?.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>
                {String(row.invoiceNo)} / ${String(row.amount)}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="button" disabled={!chosenAllocationId || isRunning || !canAllocate} title={!canAllocate ? 'Manager or owner required to unallocate' : !chosenAllocationId ? 'Select an allocation to unallocate' : undefined} onClick={() => runCommand('unallocatePayment', { allocationId: chosenAllocationId }, 'Unallocate selected payment allocation')}>
          Unallocate
        </button>
        <label htmlFor={invoiceSelectId} className="field-inline">
          Order
          <select id={invoiceSelectId} className="select" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} disabled={!canAllocate}>
            <option value="">Choose order</option>
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoiceNo} / ${moneyish(Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0))}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={discountInputId} className="field-inline">
          Discount
          <input id={discountInputId} className="input compact" value={discountAmount} inputMode="decimal" disabled={!canAllocate} onChange={(event) => setDiscountAmount(event.target.value)} />
        </label>
        <button className="secondary-button" type="button" disabled={!invoiceId || !selectedPayment?.id || isRunning || !canAllocate} title={!canAllocate ? "Manager or owner required to allocate" : !invoiceId ? "Select an order to apply to" : !selectedPayment?.id ? "Select a payment row first" : undefined} onClick={() => runCommand("allocatePayment", { paymentId: selectedPayment?.id, invoiceId }, "Apply payment to selected order")}>
          Apply to selected
        </button>
        <button className="secondary-button" type="button" disabled={!invoiceId || !discountAmount || isRunning || !canAllocate} title={!canAllocate ? 'Manager or owner required to apply discount' : !invoiceId ? 'Select an order first' : !discountAmount ? 'Enter a discount amount' : undefined} onClick={() => runCommand('applyDiscount', { invoiceId, amount: Number(discountAmount) }, 'Apply discount from payments surface')}>
          Apply Discount
        </button>
      </div>
      {/* CAP-004: role-gate note for viewers */}
      {!canAllocate ? (
        <p className="text-xs text-zinc-400 mt-1">Manager or owner required to allocate payments.</p>
      ) : null}
      <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
        <span className="selection-pill">Selected {selectedPayment ? String(selectedPayment.reference ?? selectedPayment.id) : 'none'}</span>
        <span className="selection-pill">Unapplied ${moneyish(selectedPayment?.unappliedAmount)}</span>
        <span className="selection-pill success">{paymentAllocationLabel(selectedPayment?.allocationIntent)}</span>
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
                  <td>{String(row.invoiceNo ?? row.invoiceId ?? 'Order')}</td>
                  <td>${moneyish(row.amount)}</td>
                  <td>{dateish(row.createdAt)}</td>
                  <td>{String(selectedPayment?.reference ?? selectedPayment?.method ?? 'Payment row')} -&gt; {String(row.invoiceNo ?? 'order')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function paymentAllocationLabel(intent: unknown) {
  if (intent === 'selected' || intent === 'selected_invoice') return 'Selected order';
  if (intent === 'unapplied') return 'Leave unapplied';
  return 'Auto-apply to oldest';
}
