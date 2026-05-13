import { ChevronRight, PanelRightClose, PanelRightOpen, X } from 'lucide-react';
import clsx from 'clsx';
import { trpc } from '../api/trpc';
import { activeEntityForState, defaultDrawerState, defaultTabForEntity, drawerStorageKey, queueDrawerEntity, storedDrawerForState, useUiStore } from '../store/uiStore';
import type { DrawerStateName, GridRow, ViewKey } from '../../shared/types';

const drawerTabs: Record<string, Array<{ key: string; label: string }>> = {
  queue: [
    { key: 'actions', label: 'Actions' },
    { key: 'saved', label: 'Saved views' }
  ],
  customer: [
    { key: 'profile', label: 'Profile' },
    { key: 'balance', label: 'Balance' },
    { key: 'purchases', label: 'Purchases' },
    { key: 'notes', label: 'Notes' },
    { key: 'history', label: 'History' }
  ],
  vendor: [
    { key: 'profile', label: 'Profile' },
    { key: 'open-bills', label: 'Open bills' },
    { key: 'pos', label: 'POs' },
    { key: 'history', label: 'History' }
  ],
  lot: [
    { key: 'movement', label: 'Movement' },
    { key: 'sales', label: 'Sales' },
    { key: 'photos', label: 'Photos' },
    { key: 'history', label: 'History' }
  ],
  order: [
    { key: 'lines', label: 'Lines' },
    { key: 'customer', label: 'Customer' },
    { key: 'output', label: 'Output' },
    { key: 'history', label: 'History' }
  ],
  po: [
    { key: 'lines', label: 'Lines' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'linked-intake', label: 'Linked intake' },
    { key: 'history', label: 'History' }
  ],
  vendorBill: [
    { key: 'due-reason', label: 'Due reason' },
    { key: 'linked-po', label: 'Linked PO' },
    { key: 'payouts', label: 'Payouts' },
    { key: 'history', label: 'History' }
  ],
  payment: [
    { key: 'allocations', label: 'Allocations' },
    { key: 'customer', label: 'Customer' },
    { key: 'impact', label: 'Impact' },
    { key: 'history', label: 'History' }
  ],
  pick: [
    { key: 'lines', label: 'Lines' },
    { key: 'order', label: 'Order' },
    { key: 'labels', label: 'Bag/labels' },
    { key: 'history', label: 'History' }
  ],
  connector: [
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
    return (
      <aside className="context-drawer context-drawer-closed" aria-label="Context drawer">
        <button type="button" className="context-drawer-nub" onClick={() => toggleDrawer(activeView)} title="Toggle Drawer (Hotkey: ])">
          <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
          <span>Drawer `]`</span>
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
            {activeEntity.entityType} {activeEntity.entityId ? `· ${shortId(activeEntity.entityId)}` : 'queue'}
          </div>
        </div>
        <button type="button" className="icon-button" onClick={() => toggleDrawer(activeView)} aria-label="Cycle drawer size">
          <PanelRightClose className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {drawer.state === 'peek' ? null : (
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
      )}
      <div className="context-drawer-body">
        <ContextDrawerContent activeView={activeView} activeTab={activeTab} row={row} entityType={activeEntity.entityType} />
      </div>
    </aside>
  );
}

export function getActiveDrawerStorageKey(view: ViewKey) {
  const state = useUiStore.getState();
  return drawerStorageKey(view, activeEntityForState(state, view));
}

function ContextDrawerContent({ activeView, activeTab, row, entityType }: { activeView: ViewKey; activeTab: string; row?: GridRow; entityType: string }) {
  const customerId = entityType === 'customer' ? String(row?.customerId ?? (activeView === 'clients' ? row?.id ?? '' : '')) : '';
  const relationship = trpc.queries.relationshipSummary.useQuery({ customerId }, { enabled: Boolean(customerId) });
  const facts = compactFacts(row, entityType, relationship.data);
  return (
    <div className="context-drawer-card">
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

function tabsFor(entityType: string) {
  return drawerTabs[entityType] ?? drawerTabs.queue;
}

function titleFor(row: GridRow | undefined, activeTab: string) {
  return String(row?.label ?? row?.name ?? row?.customer ?? row?.vendor ?? row?.orderNo ?? row?.poNo ?? row?.billNo ?? labelFromKey(activeTab));
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

function shortId(value: string) {
  return value.length > 10 ? value.slice(0, 10) : value;
}
