import { ChevronRight, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../api/trpc';
import { activeEntityForState, defaultDrawerState, defaultTabForEntity, drawerStorageKey, queueDrawerEntity, storedDrawerForState, useUiStore } from '../store/uiStore';
import { commandLabelFor } from '../../shared/commandCatalog';
import type { DrawerStateName, GridRow, ViewKey } from '../../shared/types';
import { CustomerCreditPanel } from './credit/CustomerCreditPanel';
import { SalesOutputTab } from './drawerTabs/SalesOutputTab';
import { SalesPricingTab } from './drawerTabs/SalesPricingTab';
import { SalesCommandHistoryTab } from './drawerTabs/SalesCommandHistoryTab';

const drawerTabs: Record<string, Array<{ key: string; label: string }>> = {
  queue: [
    { key: 'actions', label: 'Actions' },
    { key: 'saved', label: 'Saved views' }
  ],
  customer: [
    { key: 'relationship', label: 'Relationship' },
    { key: 'profile', label: 'Profile' },
    { key: 'balance', label: 'Balance' },
    { key: 'purchases', label: 'Purchases' },
    { key: 'credit', label: 'Credit' },
    { key: 'notes', label: 'Notes' },
    { key: 'history', label: 'History' }
  ],
  vendor: [
    { key: 'relationship', label: 'Relationship' },
    { key: 'profile', label: 'Profile' },
    { key: 'open-bills', label: 'Open bills' },
    { key: 'pos', label: 'POs' },
    { key: 'history', label: 'History' }
  ],
  lot: [
    { key: 'relationship', label: 'Relationship' },
    { key: 'movement', label: 'Movement' },
    { key: 'sales', label: 'Sales' },
    { key: 'photos', label: 'Photos' },
    { key: 'history', label: 'History' }
  ],
  order: [
    { key: 'relationship', label: 'Relationship' },
    { key: 'lines', label: 'Lines' },
    { key: 'customer', label: 'Customer' },
    { key: 'output', label: 'Output' },
    { key: 'history', label: 'History' }
  ],
  salesOrder: [
    { key: 'balance', label: 'Balance' },
    { key: 'history', label: 'History' },
    { key: 'notes', label: 'Notes' },
    { key: 'pricing', label: 'Pricing' },
    { key: 'output', label: 'Output' },
    { key: 'commands', label: 'Commands' }
  ],
  po: [
    { key: 'relationship', label: 'Relationship' },
    { key: 'lines', label: 'Lines' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'linked-intake', label: 'Linked intake' },
    { key: 'history', label: 'History' }
  ],
  vendorBill: [
    { key: 'relationship', label: 'Relationship' },
    { key: 'due-reason', label: 'Due reason' },
    { key: 'linked-po', label: 'Linked PO' },
    { key: 'payouts', label: 'Payouts' },
    { key: 'history', label: 'History' }
  ],
  payment: [
    { key: 'relationship', label: 'Relationship' },
    { key: 'allocations', label: 'Allocations' },
    { key: 'customer', label: 'Customer' },
    { key: 'impact', label: 'Impact' },
    { key: 'history', label: 'History' }
  ],
  pick: [
    { key: 'relationship', label: 'Relationship' },
    { key: 'lines', label: 'Lines' },
    { key: 'order', label: 'Order' },
    { key: 'labels', label: 'Bag/labels' },
    { key: 'history', label: 'History' }
  ],
  connector: [
    { key: 'relationship', label: 'Relationship' },
    { key: 'request', label: 'Request' },
    { key: 'source', label: 'Source' },
    { key: 'history', label: 'History' }
  ],
  recovery: [
    { key: 'undo', label: 'Undo' },
    { key: 'target', label: 'Target row' },
    { key: 'history', label: 'History' }
  ],
  closeout: [
    { key: 'control-totals', label: 'Control totals' },
    { key: 'open-work', label: 'Open work' },
    { key: 'artifacts', label: 'Artifacts' }
  ],
  report: [
    { key: 'rows', label: 'Rows' },
    { key: 'export', label: 'Export' },
    { key: 'saved', label: 'Saved views' }
  ],
  settings: [
    { key: 'requests', label: 'Requests' },
    { key: 'actions', label: 'Action log' },
    { key: 'archive', label: 'Archive' }
  ]
};

const stateLabel: Record<DrawerStateName, string> = {
  closed: 'Drawer · ]',
  peek: 'Peek',
  standard: 'Standard',
  wide: 'Wide',
  focus: 'Focus'
};

export function ContextDrawer() {
  const activeView = useUiStore((state) => state.activeView);
  const selectedRows = useUiStore((state) => state.selectedRows);
  const activeEntityRef = useUiStore((state) => state.activeDrawerEntityByView[state.activeView]);
  const activeEntity = activeEntityRef ?? queueDrawerEntity;
  const storedDrawer = useUiStore((state) => storedDrawerForState(state, state.activeView));
  const drawer = storedDrawer ?? defaultDrawerState(defaultTabForEntity(activeEntity.entityType));
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const setDrawerTab = useUiStore((state) => state.setDrawerTab);
  const toggleDrawer = useUiStore((state) => state.toggleDrawer);
  const row = selectedRows[activeView]?.[0];
  const tabs = tabsFor(activeEntity.entityType);
  const activeTab = tabs.some((tab) => tab.key === drawer.activeTab) ? drawer.activeTab : defaultTabForEntity(activeEntity.entityType);
  const activeTabLabel = tabs.find((tab) => tab.key === activeTab)?.label ?? 'Context';

  if (drawer.state === 'closed') {
    if (activeEntity.entityType === 'queue' && !row) return null;
    return (
      <aside className="context-drawer-reopen" aria-label="Context drawer reopen">
        <button type="button" className="context-reopen-button" onClick={() => setDrawerState(activeView, 'standard')} title="Show context for the selected row">
          <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
          <span>Context</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className={clsx('context-drawer', `context-drawer-${drawer.state}`)} aria-label="Context drawer">
      <div className="context-drawer-header">
        <button type="button" className="icon-button" onClick={() => setDrawerState(activeView, 'closed')} aria-label="Close context drawer">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{activeTabLabel}</div>
          <div className="truncate text-[11px] uppercase text-zinc-500">
            {entitySubline(activeEntity.entityType, row)}
          </div>
        </div>
        <button type="button" className="icon-button" onClick={() => toggleDrawer(activeView)} aria-label="Cycle drawer size">
          <PanelRightClose className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="drawer-tabs" role="tablist" aria-label="Context tabs">
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={clsx('drawer-tab', activeTab === tab.key && 'drawer-tab-active')}
            onClick={() => setDrawerTab(activeView, tab.key)}
          >
            <span className="drawer-tab-index">{index + 1}</span>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="context-drawer-body">
        <ContextDrawerContent activeView={activeView} activeTab={activeTab} row={row} entityType={activeEntity.entityType} entityId={activeEntity.entityId} />
      </div>
    </aside>
  );
}

export function getActiveDrawerStorageKey(view: ViewKey) {
  const state = useUiStore.getState();
  return drawerStorageKey(view, activeEntityForState(state, view));
}

const PROFILE_ENTITY_TYPES = new Set(['customer', 'vendor', 'referee', 'processor']);

function ContextDrawerContent({ activeView, activeTab, row, entityType, entityId }: { activeView: ViewKey; activeTab: string; row?: GridRow; entityType: string; entityId?: string | null }) {
  const navigate = useNavigate();
  const customerId = inferCustomerId(row, activeView, entityType, entityId);
  const vendorId = inferVendorId(row, activeView, entityType, entityId);
  const relationship = trpc.queries.relationshipSummary.useQuery({ customerId, vendorId }, { enabled: Boolean(customerId || vendorId) });
  const facts = compactFacts(row, entityType, relationship.data);

  // contactId may be present on the row when the grid query includes it (added in 9.3).
  // Render conditionally — no extra query added here.
  const contactId = PROFILE_ENTITY_TYPES.has(entityType) && typeof row?.contactId === 'string' ? row.contactId : null;

  // salesOrder-specific drawer tabs (CAP-007/CAP-012)
  const isSalesOrderEntity = entityType === 'salesOrder';
  const salesOrderId = isSalesOrderEntity && entityId ? entityId : (row?.id ? String(row.id) : '');

  if (activeTab === 'pricing' && isSalesOrderEntity) {
    return (
      <SalesPricingTab
        orderId={salesOrderId}
        selectedOrder={row}
        orderLines={[]}
      />
    );
  }
  if (activeTab === 'output' && isSalesOrderEntity) {
    return (
      <SalesOutputTab
        orderId={salesOrderId}
        sheetMode="internal"
        sheetRows={[]}
        showMargin={true}
        orderLines={[]}
        onModeToggle={() => { /* no-op: full export state lives in SalesView */ }}
        onExport={() => { /* no-op: export triggered from SalesView */ }}
        exportError={null}
      />
    );
  }
  if (activeTab === 'commands' && isSalesOrderEntity) {
    return (
      <SalesCommandHistoryTab
        orderId={salesOrderId}
        customerId={customerId}
      />
    );
  }

  if (activeTab === 'credit') {
    if (customerId) {
      return <CustomerCreditPanel customerId={customerId} />;
    }
    return (
      <div className="context-drawer-card">
        <div className="drawer-empty">No customer selected.</div>
      </div>
    );
  }
  if (activeTab === 'relationship' && (customerId || vendorId)) {
    return (
      <>
        {contactId && (
          <div className="flex justify-end px-2 pt-2 pb-1">
            <button
              className="text-button text-xs"
              onClick={() => navigate(`/contacts/${contactId}`)}
              aria-label="Open full profile"
              type="button"
            >
              Open full profile →
            </button>
          </div>
        )}
        <RelationshipContext data={relationship.data} row={row} />
      </>
    );
  }
  return (
    <div className="context-drawer-card">
      {contactId && (
        <div className="flex justify-end pb-1">
          <button
            className="text-button text-xs"
            onClick={() => navigate(`/contacts/${contactId}`)}
            aria-label="Open full profile"
            type="button"
          >
            Open full profile →
          </button>
        </div>
      )}
      <h2 className="mt-1 truncate text-base font-semibold text-ink">{titleFor(row, activeTab)}</h2>
      <div className="mt-3 grid gap-2">
        {facts.length ? facts.map(([label, value]) => (
          <div key={label} className="drawer-fact-row">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        )) : (
          <div className="drawer-empty">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
            Select a row to pin context here.
          </div>
        )}
      </div>
    </div>
  );
}

function RelationshipContext({
  data,
  row
}: {
  data?: { customer?: GridRow | null; vendor?: GridRow | null; invoices?: GridRow[]; orders?: GridRow[]; payments?: GridRow[]; bills?: GridRow[]; vendorPayments?: GridRow[]; commands?: GridRow[] };
  row?: GridRow;
}) {
  const customerOpen = (data?.invoices ?? []).reduce((sum, invoice) => sum + Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0), 0);
  const vendorOpen = (data?.bills ?? []).reduce((sum, bill) => sum + Number(bill.amount ?? 0) - Number(bill.amountPaid ?? 0), 0);
  return (
    <div className="context-drawer-card">
      <h2 className="mt-1 truncate text-base font-semibold text-ink">{String(data?.customer?.name ?? data?.vendor?.name ?? row?.label ?? row?.customer ?? row?.vendor ?? 'Relationship')}</h2>
      <div className="mt-3 grid gap-2">
        <div className="drawer-fact-row"><span>Owes us</span><strong>${moneyish(customerOpen)}</strong></div>
        <div className="drawer-fact-row"><span>We owe them</span><strong>${moneyish(vendorOpen)}</strong></div>
        <div className="drawer-fact-row"><span>Orders</span><strong>{data?.orders?.length ?? 0}</strong></div>
        <div className="drawer-fact-row"><span>Recent actions</span><strong>{data?.commands?.length ?? 0}</strong></div>
      </div>
      <MiniRows title="Orders" rows={data?.orders ?? []} fields={['orderNo', 'status', 'total']} />
      <MiniRows title="Invoices" rows={data?.invoices ?? []} fields={['invoiceNo', 'status', 'total']} />
      <MiniRows title="Payments" rows={data?.payments ?? []} fields={['method', 'amount', 'category']} />
      <MiniRows title="Vendor bills" rows={data?.bills ?? []} fields={['billNo', 'status', 'amount']} />
      <MiniRows title="Recent actions" rows={data?.commands ?? []} fields={['commandName', 'actorName', 'status']} />
    </div>
  );
}

function MiniRows({ title, rows, fields }: { title: string; rows: GridRow[]; fields: string[] }) {
  if (!rows.length) return null;
  return (
    <section className="mt-4">
      <h3 className="section-title">{title}</h3>
      <div className="mt-2 grid gap-1 text-xs">
        {rows.slice(0, 5).map((row) => (
          <div className="activity-row" key={row.id}>
            {fields.map((field) => <span key={field}>{field === 'commandName' ? commandLabelFor(row[field]) : valueFor(row[field]) || '-'}</span>)}
            <span>{dateish(row.createdAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function tabsFor(entityType: string) {
  return drawerTabs[entityType] ?? drawerTabs.queue;
}

function titleFor(row: GridRow | undefined, activeTab: string) {
  return String(row?.label ?? row?.name ?? row?.customer ?? row?.vendor ?? row?.orderNo ?? row?.poNo ?? row?.billNo ?? labelFromKey(activeTab));
}

function entitySubline(entityType: string, row?: GridRow) {
  const label = row?.label ?? row?.name ?? row?.customer ?? row?.vendor ?? row?.orderNo ?? row?.poNo ?? row?.billNo ?? row?.batchCode ?? row?.pickNo;
  return `${labelFromKey(entityType)}${label ? ` · ${String(label)}` : ' context'}`;
}

function inferCustomerId(row: GridRow | undefined, view: ViewKey, entityType: string, entityId?: string | null) {
  if (typeof row?.customerId === 'string') return row.customerId;
  if (entityType === 'customer' && entityId) return entityId;
  if (view === 'clients' && row?.id) return row.id;
  return undefined;
}

function inferVendorId(row: GridRow | undefined, view: ViewKey, entityType: string, entityId?: string | null) {
  if (typeof row?.vendorId === 'string') return row.vendorId;
  if (entityType === 'vendor' && entityId) return entityId;
  if (view === 'vendors' && typeof row?.vendorId === 'string') return row.vendorId;
  return undefined;
}

function compactFacts(
  row: GridRow | undefined,
  entityType: string,
  relationship?: { customer?: GridRow | null; invoices?: GridRow[]; orders?: GridRow[] }
): Array<[string, string]> {
  if (!row) return [];
  if (entityType === 'customer' && relationship?.customer) {
    const openInvoices = (relationship.invoices ?? []).reduce((sum, invoice) => sum + Number(invoice.total ?? 0) - Number(invoice.amountPaid ?? 0), 0);
    const lastOrder = relationship.orders?.[0]?.createdAt;
    return [
      ['Balance', `$${moneyish(relationship.customer.balance)}`],
      ['Credit', `$${moneyish(relationship.customer.creditLimit)}`],
      ['Open invoices', `$${moneyish(openInvoices)}`],
      ['Last order', dateish(lastOrder)]
    ];
  }
  const keys = ['status', 'customer', 'vendor', 'amount', 'total', 'availableQty', 'intakeQty', 'createdAt'];
  return keys
    .map((key) => [labelFromKey(key), valueFor(row[key])] as [string, string])
    .filter(([, value]) => value.length > 0)
    .slice(0, 8);
}

function valueFor(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (typeof value === 'string') return value;
  return '';
}

function moneyish(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

function dateish(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function labelFromKey(value: string) {
  return value.replace(/-/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}
