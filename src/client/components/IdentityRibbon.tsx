import { ArrowLeft, X } from 'lucide-react';
import { useMemo } from 'react';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import { StatusPill } from './StatusPill';
import type { GridRow, ViewKey } from '../../shared/types';

const viewLabels: Record<ViewKey, string> = {
  dashboard: 'Dashboard',
  reports: 'Reports',
  purchaseOrders: 'Purchase Orders',
  intake: 'Intake',
  sales: 'Sales',
  matchmaking: 'Matchmaking',
  orders: 'Orders',
  payments: 'Payments',
  inventory: 'Inventory',
  clients: 'Client Ledger',
  vendors: 'Vendor Payouts',
  fulfillment: 'Fulfillment',
  connectors: 'Connectors',
  recovery: 'Recovery',
  closeout: 'Closeout',
  referees: 'Referees',
  processors: 'Payment Processors',
  'credit-review': 'Credit Review',
  photography: 'Photography',
  settings: 'Settings',
  pick: 'Pick Queue' // CAP-030 / TER-1513
};

export function IdentityRibbon() {
  const activeView = useUiStore((state) => state.activeView);
  const selectedRows = useUiStore((state) => state.selectedRows);
  const activeCustomerId = useUiStore((state) => state.activeCustomerId);
  const setSelectedRows = useUiStore((state) => state.setSelectedRows);
  const setActiveCustomerId = useUiStore((state) => state.setActiveCustomerId);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);
  const goBackRouteHistory = useUiStore((state) => state.goBackRouteHistory);
  const reference = trpc.queries.reference.useQuery(undefined, { enabled: Boolean(activeCustomerId) });
  const activeCustomerName = reference.data?.customers.find((customer) => customer.id === activeCustomerId)?.name;

  const row = selectedRows[activeView]?.[0];
  const identity = useMemo(() => buildIdentity(activeView, row, activeCustomerId, activeCustomerName), [activeCustomerId, activeCustomerName, activeView, row]);

  if (!identity) return null;

  function leaveContext() {
    setSelectedRows(activeView, []);
    if (activeView === 'sales') setActiveCustomerId(null);
    setDrawerEntity(activeView, 'queue', null);
  }

  return (
    <section className="identity-ribbon" aria-label="Active context">
      <button type="button" className="identity-ribbon-button" onClick={goBackRouteHistory} title="Back to previous context">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Back to previous context</span>
      </button>
      <span className="identity-ribbon-view">{viewLabels[activeView]}</span>
      <span className="identity-ribbon-title">{identity.title}</span>
      {identity.detail ? <span className="identity-ribbon-detail">{identity.detail}</span> : null}
      {identity.status ? <StatusPill status={identity.status} /> : null}
      <button type="button" className="identity-ribbon-button ml-auto" onClick={leaveContext} title="Leave context">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Leave context</span>
      </button>
    </section>
  );
}

function buildIdentity(view: ViewKey, row: GridRow | undefined, activeCustomerId: string | null, activeCustomerName?: string) {
  if (!row && !(view === 'sales' && activeCustomerId)) return null;
  if (view === 'sales' && activeCustomerId && !row) {
    return { title: activeCustomerName ?? 'Selected customer', detail: 'customer context', status: undefined };
  }
  if (!row) return null;
  return {
    title: displayTitle(row, view),
    detail: detailFor(row),
    status: row.status
  };
}

function displayTitle(row: GridRow, view: ViewKey) {
  const candidate = row.label ?? row.name ?? row.customer ?? row.vendor ?? row.orderNo ?? row.poNo ?? row.billNo ?? row.batchCode ?? row.pickNo ?? row.reference;
  if (candidate) return String(candidate);
  return `Selected ${viewLabel(view)} row`;
}

function detailFor(row: GridRow) {
  const values = [row.poNo, row.orderNo, row.billNo, row.sourceCode, row.createdAt]
    .map((value) => (value == null ? '' : String(value)))
    .filter(Boolean);
  return values.slice(0, 2).join(' · ');
}

function viewLabel(view: ViewKey) {
  return viewLabels[view].toLowerCase();
}
