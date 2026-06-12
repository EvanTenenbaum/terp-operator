import { trpc } from '../../api/trpc';
import { OperatorGrid } from '../OperatorGrid';
import { CustomerCreditPanel } from '../credit/CustomerCreditPanel';
import { CustomerPurchaseHistoryPanel } from '../CustomerPurchaseHistoryPanel';
import { CustomerLedgerPanel } from './CustomerLedgerPanel';
import type { ColDef } from 'ag-grid-community';
import type { GridRow } from '../../../shared/types';
import type { ContactProfileData } from './types';
import { moneyCol } from '../../utils/format';

interface Props { data: ContactProfileData; }

export function ContactCustomerPanel({ data }: Props) {
  const customer = data.customer as Record<string, unknown> | null;
  const customerId = customer?.id as string | undefined;

  const { data: orders } = trpc.queries.customerOrderHistory.useQuery(
    { customerId: customerId ?? '' },
    { enabled: Boolean(customerId) }
  );

  const orderColumns: ColDef<GridRow>[] = [
    { field: 'orderNo',    headerName: 'Order #', width: 110 },
    { field: 'createdAt',  headerName: 'Date',    width: 120,
      valueFormatter: (p) => p.value ? new Date(String(p.value)).toLocaleDateString('en-US') : '—' },
    { field: 'line_count', headerName: 'Lines',   width: 80 },
    moneyCol('total', { headerName: 'Total', width: 100 }),
    { field: 'status',     headerName: 'Status',  width: 120 },
  ];

  if (!customerId) {
    return <p className="text-sm text-zinc-500 p-4">No customer record linked.</p>;
  }

  const customerName = String(customer?.name ?? '');

  return (
    <div className="space-y-4">
      <CustomerCreditPanel customerId={customerId} />

      <OperatorGrid
        view="contacts-customer-orders"
        title="Order History"
        rows={(orders?.rows ?? []) as GridRow[]}
        columns={orderColumns}
        emptyTitle="No orders yet"
      />

      <CustomerPurchaseHistoryPanel
        customerId={customerId}
        customerName={customerName}
      />

      <CustomerLedgerPanel customerId={customerId} />
    </div>
  );
}
