import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { trpc } from '../api/trpc';
import { FilterPresetStrip, StatusActionBar, type StatusActionTable } from '../components/templates';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { QuickLedgerGrid } from '../components/QuickLedgerGrid';
import { useCommandRunner } from '../components/useCommandRunner';
import { useUiStore } from '../store/uiStore';
import { ReceiptPanel } from '../components/ReceiptPanel';
import type { GridRow } from '../../shared/types';
import { GridJourney, moneyish, dateish } from './operations/shared';

export function PaymentsView() {
  const selectedRows = useUiStore((state) => state.selectedRows.payments);
  const selectedPayment = selectedRows?.[0];
  return (
    <GridJourney
      view="payments"
      title="Payments"
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
              }
            ]
          : []
      }
      actions={() => (
        <>
          {/* GH #354 presets, now via the shared template */}
          <FilterPresetStrip
            view="payments"
            ariaLabel="Filter payments"
            presets={[
              { label: 'Unpaid', filter: 'status:active' },
              { label: 'Overdue', filter: 'category:overdue' }
            ]}
          />
        </>
      )}
      selectionActions={(rows, runCommand) => {
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
        const allocate = (label: string) => ({
          key: 'allocate',
          label,
          icon: <Check className="h-4 w-4" aria-hidden="true" />,
          run: (r: GridRow[]) => runCommand('allocatePayment', { paymentId: r[0].id }, 'Auto-apply payment to oldest open orders')
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
                {invoice.invoiceNo} / ${Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={discountInputId} className="field-inline">
          Discount
          <input id={discountInputId} className="input compact" value={discountAmount} inputMode="decimal" disabled={!canAllocate} onChange={(event) => setDiscountAmount(event.target.value)} />
        </label>
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
