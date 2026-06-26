import { ArrowLeft, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import { StatusPill } from './StatusPill';
import { formatTs } from '../utils/format';
import type { GridRow, ViewKey } from '../../shared/types';

const viewLabels: Record<ViewKey, string> = {
  dashboard: 'Dashboard',
  reports: 'Reports',
  purchaseOrders: 'Purchase Orders',
  purchaseReceipts: 'Purchase Receipts',
  intake: 'Intake',
  sales: 'Sales',
  matchmaking: 'Matchmaking',
  orders: 'Orders',
  payments: 'Payments',
  inventory: 'Inventory',
  clients: 'Client Balances',
  vendors: 'Vendor Payouts',
  fulfillment: 'Fulfillment',
  connectors: 'Connectors',
  recovery: 'Recovery',
  closeout: 'Closeout',
  referees: 'Referees',
  processors: 'Payment Processors',
  'credit-review': 'Credit Review',
  photography: 'Photography',
  items: 'Items',
  disputes: 'Invoice Disputes',
  barter: 'Barter Settlement',
  contacts: 'Contacts', // CAP-033 / TER-1564
  settings: 'Settings',
  pick: 'Pick Queue', // CAP-030 / TER-1513
  'contacts-customer-orders': 'Customer Orders', // CAP-029 / TER-1564: sub-grid in ContactCustomerPanel
  'fulfillment-picks': 'Fulfillment', // SX-K06 — filter-slot key (not navigable)
  'fulfillment-lines': 'Fulfillment Lines', // SX-K06 — filter-slot key (not navigable)
};

// UX-B08: views that neither set their own ribbon entity (via row selection or
// activeCustomerId) nor intend to show a stale entity from a prior route. When
// navigating to one of these views, the ribbon entity for the incoming view
// is cleared so a stale entity from the previous route cannot bleed through.
// Scope: route-change clearing only — no edits to individual view files.
//
// - 'reports' / 'matchmaking': never expose a per-row entity; any carried-over
//   entity would be from a completely different workflow.
// - 'sales' in orders-mode: handled separately — activeCustomerId is cleared
//   when transitioning to 'sales' if no customer is explicitly chosen by the
//   view (i.e. the operator opened Sales without a customer workspace intent).
const STALE_ENTITY_VIEWS = new Set<ViewKey>(['reports', 'matchmaking']);

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

  // UX-B08: clear stale ribbon entity on route changes to views that do not
  // own an entity context. Fires once per activeView change. The setSelectedRows
  // drain is safe because any view that DOES own a row will call setSelectedRows
  // again before the ribbon renders with the cleared state.
  useEffect(() => {
    if (STALE_ENTITY_VIEWS.has(activeView)) {
      setSelectedRows(activeView, []);
      setDrawerEntity(activeView, 'queue', null);
    }
    // Sales orders-mode: clear the activeCustomerId if the user navigates to
    // Sales without selecting a customer (the Sales view will set it explicitly
    // when a customer is chosen via the Keel chip or workspace).
    if (activeView === 'sales' && !selectedRows['sales']?.length) {
      setActiveCustomerId(null);
    }
    // selectedRows intentionally excluded from deps: including it would cause
    // the ribbon to clear the current view's selection on every row click.
    // Zustand setters (setSelectedRows, setDrawerEntity, setActiveCustomerId)
    // are stable references — including them documents the dependency without
    // causing extra renders.
  }, [activeView, setSelectedRows, setDrawerEntity, setActiveCustomerId]);

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
  const values = [
    row.poNo,
    row.orderNo,
    row.billNo,
    row.sourceCode,
    row.createdAt != null
      ? formatTs(row.createdAt as Date | string | number, { variant: 'short' })
      : null,
  ]
    .map((value) => (value == null ? '' : String(value)))
    .filter(Boolean);
  return values.slice(0, 2).join(' · ');
}

function viewLabel(view: ViewKey) {
  return viewLabels[view].toLowerCase();
}
