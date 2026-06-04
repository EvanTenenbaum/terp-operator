import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  BadgeDollarSign,
  BarChart3,
  Boxes,
  Camera,
  ChevronDown,
  ClipboardList,
  Gauge,
  Inbox,
  Landmark,
  ListChecks,
  PackageCheck,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  ReceiptText,
  RotateCcw,
  Scale,
  Search,
  ScanSearch,
  ShoppingCart,
  Settings,
  Smartphone,
  Tags,
  Users
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { trpc } from '../api/trpc';
import { startVisibleForUser, viewVisibleForUser } from '../accessPolicy';
import { useUiStore } from '../store/uiStore';
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
      { view: 'purchaseReceipts', label: 'Receipts', icon: ReceiptText },
      { view: 'intake', label: 'Intake', hotkey: '⌘2', icon: ClipboardList },
      { view: 'inventory', label: 'Inventory', hotkey: '⌘5', icon: Boxes },
      { view: 'photography', label: 'Photography', icon: Camera },
      { view: 'items', label: 'Items / SKUs', icon: Tags }
    ]
  },
  {
    label: 'Sell',
    items: [
      { view: 'sales', label: 'Sales', hotkey: '⌘3', icon: ShoppingCart },
      { view: 'matchmaking', label: 'Matchmaking', icon: Search },
      { view: 'orders', label: 'Orders', icon: Inbox },
      { view: 'fulfillment', label: 'Fulfillment', icon: PackageCheck },
      { view: 'pick', label: 'Pick Queue', icon: ListChecks },  // CAP-030 / TER-1563
      { view: 'clients', label: 'Client Balances', hotkey: '⌘6', icon: ReceiptText },
      { view: 'credit-review', label: 'Credit Review', icon: Scale }
    ]
  },
  {
    label: 'Money',
    items: [
      { view: 'payments', label: 'Payments', hotkey: '⌘4', icon: BadgeDollarSign },
      { view: 'vendors', label: 'Vendor Payouts', icon: Landmark },
      { view: 'disputes', label: 'Disputes', icon: AlertTriangle },
      { view: 'referees', label: 'Referees', icon: Users },
      { view: 'contacts', label: 'Contacts', icon: Users },
      { view: 'processors', label: 'Processors', icon: BadgeDollarSign }
    ]
  },
  {
    label: 'Admin',
    items: [
      { view: 'recovery', label: 'Recovery', icon: RotateCcw },
      { view: 'closeout', label: 'Closeout', icon: Archive },
      { view: 'connectors', label: 'Connectors', icon: Plug },
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
  const navigate = useNavigate();
  const activeView = useUiStore((state) => state.activeView);
  const sideNavCollapsed = useUiStore((state) => state.sideNavCollapsed);
  const toggleSideNav = useUiStore((state) => state.toggleSideNav);
  const isManagerOrOwner = user.role === 'manager' || user.role === 'owner';
  const badgeQuery = trpc.credit.creditReviewQueue.useQuery(undefined, {
    enabled: isManagerOrOwner,
    refetchInterval: 60_000
  });
  const badgeCounts = badgeQuery.data?.counts;
  const badgeTotal = badgeCounts ? badgeCounts.staleManual + badgeCounts.engineDisabled + badgeCounts.nearSnoozeCap : 0;

  return (
    <nav className={clsx('flex shrink-0 flex-col border-r border-line bg-panel p-2 transition-all', sideNavCollapsed ? 'w-16' : 'w-60')}>
      <div className="flex items-start justify-between gap-2 px-2 py-3">
        <div className={clsx('min-w-0', sideNavCollapsed && 'sr-only')}>
          <div className="text-lg font-bold text-ink">TERP Operator</div>
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
                const showBadge = item.view === 'credit-review' && badgeTotal > 0 && !sideNavCollapsed;
                // #34 FE-L4 — defence-in-depth: only render the Cmd+N hotkey
                // chip when the lane is actually enterable for this operator.
                // visibleItems already filters by viewVisibleForUser, but
                // gating the chip directly here means a future refactor that
                // loosens visibleItems can't silently leak a chip for a lane
                // that fires the "lane not part of this operator workspace"
                // toast when hit.
                const showHotkey = Boolean(
                  item.hotkey && !sideNavCollapsed && viewVisibleForUser(item.view, user)
                );
                return (
                  <button
                    type="button"
                    key={item.view}
                    data-testid={`sidenav-item-${item.view}`}
                    aria-label={item.label}
                    aria-current={activeView === item.view ? 'page' : undefined}
                    onClick={() => navigate(`/${item.view}`)}
                    className={clsx('nav-button', activeView === item.view && 'nav-button-active')}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className={clsx('min-w-0 flex-1 truncate text-left', sideNavCollapsed && 'sr-only')}>{item.label}</span>
                    {showBadge ? (
                      <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">
                        {badgeTotal > 99 ? '99+' : badgeTotal}
                      </span>
                    ) : null}
                    {showHotkey ? <kbd>{item.hotkey}</kbd> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {/* Mobile view link */}
      <div className="mt-auto border-t border-line pt-2">
        <a
          href="/mobile/dashboard"
          className={clsx('nav-button', 'text-zinc-500 hover:text-accent')}
          aria-label="Switch to mobile view"
          title="Mobile view"
        >
          <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className={clsx('min-w-0 flex-1 truncate text-left text-xs', sideNavCollapsed && 'sr-only')}>
            Mobile view
          </span>
        </a>
      </div>
    </nav>
  );
}

export function Keel({ user }: { user: SessionUser }) {
  const navigate = useNavigate();
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const activeView = useUiStore((state) => state.activeView);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setFinderOpen = useUiStore((state) => state.setFinderOpen);
  const setActiveQuickLaunch = useUiStore((state) => state.setActiveQuickLaunch);
  const utils = trpc.useContext();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      // UX-A1 (#15): clear persisted UI state on logout so the next operator
      // on a shared workstation does not inherit column/nav/drawer preferences
      // from the previous operator. resetSession clears in-memory entity
      // context (selected rows, drawer refs, filters) for the same reason.
      useUiStore.getState().resetSession();
      useUiStore.persist.clearStorage();
      return utils.auth.me.invalidate();
    }
  });
  const health = trpc.queries.health.useQuery(undefined, { refetchInterval: 30_000 });
  const visibleChips = keelChips.filter((chip) => viewVisibleForUser(chip.view, user) && startVisibleForUser(chip.launch, user));

  useEffect(() => {
    if (!actionsOpen) return;
    function closeOnOutside(event: MouseEvent) {
      if (!actionMenuRef.current?.contains(event.target as Node)) setActionsOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [actionsOpen]);

  return (
    <header className="keel" aria-label="Global workspace keel">
      <button type="button" className="command-search keel-search" onClick={() => setCommandPaletteOpen(true)}>
        <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
        <span>Search</span>
        <kbd className="ml-auto">⌘K</kbd>
      </button>
      <button
        type="button"
        className="command-search keel-search"
        title="Global finder — search across all entities (⌘⇧F)"
        onClick={() => setFinderOpen(true)}
      >
        <ScanSearch className="h-4 w-4 text-zinc-500" aria-hidden="true" />
        <span>Find</span>
        <kbd className="ml-auto">⌘⇧F</kbd>
      </button>
      <div className="keel-chip-row" aria-label="Start chips">
        {visibleChips.length ? (
          <div className="quick-action-menu" ref={actionMenuRef} onKeyDown={(event) => {
            if (event.key === 'Escape') setActionsOpen(false);
          }}>
            <button
              type="button"
              className="keel-chip"
              aria-haspopup="menu"
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen((value) => !value)}
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              <span>Quick actions</span>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
            {actionsOpen ? (
              <div className="quick-action-popover" role="menu" aria-label="Quick actions">
                {visibleChips.map((chip) => {
                  const Icon = chip.icon;
                  return (
                    <button
                      key={chip.launch}
                      type="button"
                      role="menuitem"
                      className={clsx('quick-action-item', activeView === chip.view && 'quick-action-item-active')}
                      title={chip.title}
                      onClick={() => {
                        setActiveQuickLaunch(chip.launch);
                        navigate(`/${chip.view}`);
                        setActionsOpen(false);
                      }}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <button type="button" className="keel-chip" title="Find rows and commands" onClick={() => setCommandPaletteOpen(true)}>
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>Find</span>
          </button>
        )}
      </div>
      <div className="keel-utilities">
        <div className="keel-status-chip">
          <span className={clsx('h-3 w-3 border', health.data?.ok ? 'bg-emerald-500 border-emerald-700' : 'bg-amber border-amber')} aria-hidden="true" />
          <span>{health.data?.ok ? 'Healthy' : 'Needs attention'}</span>
        </div>
        <span className="min-w-0 truncate font-medium text-ink">{user.name}</span>
        <button type="button" className="text-button" onClick={() => logout.mutate()}>
          Sign out
        </button>
      </div>
    </header>
  );
}

export const TopBar = Keel;
