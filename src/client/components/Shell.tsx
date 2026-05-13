import {
  ArrowDown,
  ArrowUp,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  ClipboardList,
  Gauge,
  Inbox,
  Landmark,
  PackageCheck,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  ReceiptText,
  Search,
  ShoppingCart,
  Settings
} from 'lucide-react';
import clsx from 'clsx';
import { trpc } from '../api/trpc';
import { startVisibleForUser, viewVisibleForUser } from '../accessPolicy';
import { drawerStateNameForState, useUiStore } from '../store/uiStore';
import type { SessionUser, ViewKey } from '../../shared/types';

type NavItem = { view: ViewKey; label: string; hotkey?: string; icon: typeof Gauge };

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Decide',
    items: [
      { view: 'dashboard', label: 'Dashboard', hotkey: '⌘1', icon: Gauge },
      { view: 'reports', label: 'Reports', icon: BarChart3 }
    ]
  },
  {
    label: 'Procure',
    items: [
      { view: 'purchaseOrders', label: 'Purchase Orders', icon: PackagePlus },
      { view: 'intake', label: 'Intake', hotkey: '⌘2', icon: ClipboardList },
      { view: 'inventory', label: 'Inventory', hotkey: '⌘5', icon: Boxes }
    ]
  },
  {
    label: 'Sell',
    items: [
      { view: 'sales', label: 'Sales', hotkey: '⌘3', icon: ShoppingCart },
      { view: 'matchmaking', label: 'Matchmaking', icon: Search },
      { view: 'orders', label: 'Orders', icon: Inbox },
      { view: 'fulfillment', label: 'Fulfillment', icon: PackageCheck },
      { view: 'clients', label: 'Client Ledger', hotkey: '⌘6', icon: ReceiptText }
    ]
  },
  {
    label: 'Money',
    items: [
      { view: 'payments', label: 'Payments', hotkey: '⌘4', icon: BadgeDollarSign },
      { view: 'vendors', label: 'Vendor Payouts', icon: Landmark }
    ]
  },
  {
    label: 'Admin',
    items: [
      { view: 'settings', label: 'Settings', icon: Settings }
    ]
  }
];

const keelChips: Array<{ label: string; view: ViewKey; launch: 'sale' | 'purchaseOrder' | 'receiving' | 'moneyIn' | 'moneyOut'; icon: typeof Gauge; title: string }> = [
  { label: 'New Sale', view: 'sales', launch: 'sale', icon: ShoppingCart, title: 'Start a new sale' },
  { label: 'New PO', view: 'purchaseOrders', launch: 'purchaseOrder', icon: ClipboardList, title: 'Start a new purchase order' },
  { label: 'Receive', view: 'intake', launch: 'receiving', icon: PackagePlus, title: 'Receive product into intake' },
  { label: 'Money in', view: 'payments', launch: 'moneyIn', icon: ArrowDown, title: 'Open money in' },
  { label: 'Money out', view: 'vendors', launch: 'moneyOut', icon: ArrowUp, title: 'Open money out' }
];

export function SideNav({ user }: { user: SessionUser }) {
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const sideNavCollapsed = useUiStore((state) => state.sideNavCollapsed);
  const toggleSideNav = useUiStore((state) => state.toggleSideNav);

  return (
    <nav className={clsx('flex shrink-0 flex-col border-r border-line bg-panel p-2 transition-all', sideNavCollapsed ? 'w-16' : 'w-60')}>
      <div className="flex items-start justify-between gap-2 px-2 py-3">
        <div className={clsx('min-w-0', sideNavCollapsed && 'sr-only')}>
          <div className="text-lg font-bold text-ink">TERP Agro</div>
          <div className="text-xs uppercase text-zinc-600">Operator Console</div>
        </div>
        <button type="button" className="icon-button" onClick={toggleSideNav} aria-label={sideNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
          {sideNavCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => viewVisibleForUser(item.view, user));
          if (!visibleItems.length) return null;
          return (
            <div key={group.label} className="nav-group">
              <div className={clsx('nav-group-label', sideNavCollapsed && 'sr-only')}>{group.label}</div>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    key={item.view}
                    data-testid={`sidenav-item-${item.view}`}
                    aria-label={item.label}
                    onClick={() => setActiveView(item.view)}
                    className={clsx('nav-button', activeView === item.view && 'nav-button-active')}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className={clsx('min-w-0 flex-1 truncate text-left', sideNavCollapsed && 'sr-only')}>{item.label}</span>
                    {item.hotkey && !sideNavCollapsed ? <kbd>{item.hotkey}</kbd> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export function Keel({ user }: { user: SessionUser }) {
  const activeView = useUiStore((state) => state.activeView);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setActiveQuickLaunch = useUiStore((state) => state.setActiveQuickLaunch);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const toggleDrawer = useUiStore((state) => state.toggleDrawer);
  const drawerState = useUiStore((state) => drawerStateNameForState(state, state.activeView));
  const utils = trpc.useContext();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => utils.auth.me.invalidate()
  });
  const health = trpc.queries.health.useQuery(undefined, { refetchInterval: 30_000 });
  const visibleChips = keelChips.filter((chip) => viewVisibleForUser(chip.view, user) && startVisibleForUser(chip.launch, user));

  return (
    <header className="keel" aria-label="Global workspace keel">
      <button type="button" className="command-search keel-search" onClick={() => setCommandPaletteOpen(true)}>
        <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
        <span>Search PO-123, Sunset Collective, or "new sale"</span>
        <kbd className="ml-auto">⌘K</kbd>
      </button>
      <div className="keel-chip-row" aria-label="Start chips">
        {visibleChips.length ? visibleChips.map((chip) => {
          const Icon = chip.icon;
          return (
            <button
              key={chip.launch}
              type="button"
              className={clsx('keel-chip', activeView === chip.view && 'keel-chip-active')}
              title={chip.title}
              onClick={() => {
                setActiveQuickLaunch(chip.launch);
                setActiveView(chip.view);
              }}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{chip.label}</span>
            </button>
          );
        }) : (
          <button type="button" className="keel-chip" title="Find rows and commands" onClick={() => setCommandPaletteOpen(true)}>
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>Find</span>
          </button>
        )}
      </div>
      <div className="keel-utilities">
        <button type="button" className="keel-status-chip" onClick={() => toggleDrawer(activeView)} title={`Context drawer is ${drawerState}. Toggle context drawer.`} aria-label={`Toggle context drawer. Current state: ${drawerState}.`}>
          <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
          <span>Drawer</span>
          <span className="keel-chip-detail">{drawerState}</span>
        </button>
        <div className="keel-status-chip">
          <span className={clsx('h-3 w-3 border', health.data?.ok ? 'bg-emerald-500 border-emerald-700' : 'bg-amber border-amber')} aria-hidden="true" />
          <span>{health.data?.ok ? 'Healthy' : 'Needs attention'}</span>
        </div>
        <span className="min-w-0 truncate font-medium text-ink">{user.name}</span>
        <span className="border border-line px-2 py-0.5 text-xs uppercase text-zinc-700">{user.role}</span>
        <button type="button" className="text-button" onClick={() => logout.mutate()}>
          Sign out
        </button>
      </div>
    </header>
  );
}

export const TopBar = Keel;
