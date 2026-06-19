import { Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GridView } from '../templates/GridView';
import { useUiStore } from '../store/uiStore';
import type { GridRow } from '../../shared/types';

// UX-G04: Orders → Invoice cross-link inspector tab.
// Shows invoice summary from the order row's `invoiceNo` / `invoiceStatus` /
// `total` / `amountPaid` fields (already present in the orders grid payload)
// and provides a "View in Payments" deep-link that navigates to PaymentsView
// with a filter on this customer's payment context.
export function OrderInvoiceTab({ row }: { row: GridRow }) {
  const navigate = useNavigate();
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const invoiceNo = String(row.invoiceNo ?? '');
  const invoiceStatus = String(row.invoiceStatus ?? '');
  const customerId = String(row.customerId ?? '');
  const total = Number(row.total ?? 0);
  const amountPaid = Number(row.amountPaid ?? 0);
  const balance = total - amountPaid;

  if (!invoiceNo) {
    return (
      <div className="p-3 text-sm text-zinc-500">
        No invoice linked yet. Post the order to generate an invoice.
      </div>
    );
  }

  function goToPayments() {
    if (customerId) {
      setGridFilter('payments', `customerId:${customerId}`);
    }
    setActiveView('payments');
    navigate('/payments');
  }

  const statusBadge =
    invoiceStatus === 'paid'
      ? 'bg-emerald-100 text-emerald-800'
      : invoiceStatus === 'partial'
      ? 'bg-amber-100 text-amber-800'
      : invoiceStatus === 'open'
      ? 'bg-blue-100 text-blue-800'
      : 'bg-zinc-100 text-zinc-600';

  return (
    <div className="p-3 space-y-3 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <dt className="text-zinc-500">Invoice</dt>
        <dd className="font-mono font-medium">{invoiceNo}</dd>
        <dt className="text-zinc-500">Status</dt>
        <dd>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge}`}>
            {invoiceStatus || '—'}
          </span>
        </dd>
        <dt className="text-zinc-500">Total</dt>
        <dd>${total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd>
        <dt className="text-zinc-500">Paid</dt>
        <dd>${amountPaid.toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd>
        {balance > 0 ? (
          <>
            <dt className="text-zinc-500">Balance due</dt>
            <dd className="text-amber-700 font-medium">${balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</dd>
          </>
        ) : null}
      </dl>
      <button
        type="button"
        className="secondary-button compact-action"
        onClick={goToPayments}
        title="View all payments for this customer in the Payments view"
      >
        <Receipt className="h-4 w-4" aria-hidden="true" />
        View in Payments
      </button>
    </div>
  );
}

// UX-D01: deep-link helper — navigate to the orders view filtered to a specific
// order row and open its drawer. Mirrors the CountPill pattern (TER-1624/E01).
export function useOrderDeepLink() {
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setGridFilter = useUiStore((state) => state.setGridFilter);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const navigate = useNavigate();
  return (orderId: string | undefined) => {
    if (!orderId) return;
    setGridFilter('orders', `id:${orderId}`);
    setDrawerEntity('orders', 'order', orderId);
    setDrawerState('orders', 'standard');
    navigate('/orders');
    setActiveView('orders');
  };
}

export function OrdersView() {
  return (
    <div className="h-full flex flex-col">
      <GridView viewKey="orders" entityType="sale" />
    </div>
  );
}
