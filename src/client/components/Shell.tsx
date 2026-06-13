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
  ChevronRight,
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
import { navShortcutForView, requireShortcut } from '../shortcuts/registry';
import type { SessionUser, ViewKey } from '../../shared/types';

type NavItem = { view: ViewKey; label: string; icon: typeof Gauge };

// UX-T07/UX-B02: nav hotkey badges are no longer hardcoded per item — they are
// looked up from the shortcuts registry (navShortcutForView), so the badge and
// the actual Hotkeys binding can never disagree. ⌘1–⌘6 assignments are kept
// as-is this run; per-loop hotkey maps remain tracked under UX-B02.

// UX-B01: low-frequency lanes that are collapsed into a per-group "More"
// disclosure. These never include sales/warehouse/intake loop lanes. Keyboard
// shortcuts (⌘1–⌘6 + aria-keyshortcuts) continue to work for any lane that
// has a registry binding even when the group is visually collapsed — navigation
// still functions, only the button is visually hidden behind the disclosure.
const LOW_FREQUENCY_VIEWS = new Set<string>([
  'purchaseReceipts',
  'photography',
  'items',
  'credit-review',
  'disputes',
  'referees'
]);

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Decide',
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: Gauge },
      { view: 'reports', label: 'Reports', icon: BarChart3 }
    ]
  },
  {
    label: 'Procure',
    items: [
      { view: 'purchaseOrders', label: 'Purchase Orders', icon: PackagePlus },
      { view: 'purchaseReceipts', label: 'Receipts', icon: ReceiptText },
      { view: 'intake', label: 'Intake', icon: ClipboardList },
      { view: 'inventory', label: 'Inventory', icon: Boxes },
      { view: 'photography', label: 'Photography', icon: Camera },
      { view: 'items', label: 'Items / SKUs', icon: Tags }
    ]
  },
  {
    label: 'Sell',
    items: [
      { view: 'sales', label: 'Sales', icon: ShoppingCart },
      { view: 'matchmaking', label: 'Matchmaking', icon: Search },
      { view: 'orders', label: 'Orders', icon: Inbox },
      { view: 'fulfillment', label: 'Fulfillment', icon: PackageCheck },
      { view: 'pick', label: 'Pick Queue', icon: ListChecks },  // CAP-030 / TER-1563
      { view: 'clients', label: 'Client Balances', icon: ReceiptText },
      { view: 'credit-review', label: 'Credit Review', icon: Scale }
    ]
  },
  {
    label: 'Money',
    items: [
      { view: 'payments', label: 'Payments', icon: BadgeDollarSign },
      { view: 'vendors', label: 'Vendor Payouts', icon: Landmark },
      { view: 'disputes', label: 'Disputes', icon: AlertTriangle },
      { view: 'referees', label: 'Referees', icon: Users },
      { view: 'contacts', label: 'Contacts', icon: Users },
      // TER-1664: Connectors removed from MVP nav
      // { view: 'processors', label: 'Processors', icon: BadgeDollarSign }
    ]
  },
  {
    label: 'Admin',
    items: [
      { view: 'recovery', label: 'Recovery', icon: RotateCcw },
      { view: 'closeout', label: 'Closeout', icon: Archive },
      // TER-1664: Connectors removed from MVP nav
      // { view: 'connectors', label: 'Connectors', icon: Plug },
      { view: 'settings', label: 'Settings', icon: Settings }
    ]
  }
];

const keelChips: Array<{ label: string; view: ViewKey; launch: 'sale' | 'purchaseOrder' | 'receiving' | 'moneyIn' | 'moneyOut'; icon: typeof Gauge; title: string }> = [
  { label: 'New Sale', view: 'sales', launch: 'sale', icon: ShoppingCart, title: 'Start a new sale' },
  { label: 'New PO', view: 'purchaseOrders', launch: 'purchaseOrder', icon: ClipboardList, title: 'Start a new purchase order' },
  // UX-A09 (2026-06-12): PO-first intake is official (TER-1658). Renamed to
  // "Receive against PO" and re-pointed to purchaseOrders view so the operator
  // lands on the PO list to select an approved PO for receiving. The old
  // 'intake'/'receiving' path is rejected by the backend (importBatchesCsv /
  // createBatch without purchaseOrderLineId no longer accepted).
  { label: 'Receive against PO', view: 'purchaseOrders', launch: 'purchaseOrder', icon: PackagePlus, title: 'Receive product — select an approved PO to draft intake rows' },
  { label: 'Money in', view: 'payments', launch: 'moneyIn', icon: ArrowDown, title: 'Open money in' },
  { label: 'Money out', view: 'vendors', launch: 'moneyOut', icon: ArrowUp, title: 'Open money out' }
];

export function SideNav({ user }: { user: SessionUser }) {
  const navigate = useNavigate();
  const activeView = useUiStore((state) => state.activeView);
  const sideNavCollapsed = useUiStore((state) => state.sideNavCollapsed);
  const toggleSideNav = useUiStore((state) => state.toggleSideNav);
  // UX-B01: per-group "More" expansion state from persisted store.
  const navGroupExpansion = useUiStore((state) => state.navGroupExpansion);
  const setNavGroupExpanded = useUiStore((state) => state.setNavGroupExpanded);

  // EXT-REVIEW 2026-06 finding #8 (responsive): on narrow viewports the
  // expanded 240px rail consumed a third of the screen and forced grids into
  // horizontal crush. Auto-collapse when crossing below 1024px (downward only —
  // an operator who re-expands on a small screen is respected until the next
  // downward crossing). Dedicated phone UX lives at /mobile.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return; // jsdom / non-browser
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches && !useUiStore.getState().sideNavCollapsed) {
        useUiStore.getState().toggleSideNav();
      }
    };
    onChange(mq);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
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

          // UX-B01: split visible items into primary (always shown) and secondary
          // (collapsed behind "More"). An item is secondary only when it is
          // low-frequency AND NOT the currently active view AND NOT the current
          // view's active item. Items with ⌘N shortcuts always stay primary so
          // the badge is discoverable.
          const primaryItems = visibleItems.filter(
            (item) =>
              !LOW_FREQUENCY_VIEWS.has(item.view) ||
              activeView === item.view ||
              Boolean(navShortcutForView(item.view))
          );
          const secondaryItems = visibleItems.filter(
            (item) =>
              LOW_FREQUENCY_VIEWS.has(item.view) &&
              activeView !== item.view &&
              !navShortcutForView(item.view)
          );
          const hasMore = secondaryItems.length > 0;
          const isExpanded = Boolean(navGroupExpansion[group.label]);

          function renderNavItem(item: NavItem) {
            const Icon = item.icon;
            const showBadge = item.view === 'credit-review' && badgeTotal > 0 && !sideNavCollapsed;
            // UX-T07: badge content comes from the shortcuts registry, not
            // a per-item literal — single source of truth with Hotkeys.tsx.
            const navShortcut = navShortcutForView(item.view);
            // #34 FE-L4 — defence-in-depth: only treat the lane as bound
            // when it is actually enterable for this operator.
            const hotkeyBound = Boolean(navShortcut && viewVisibleForUser(item.view, user));
            // The visual chip hides when the rail is collapsed, but the
            // aria-keyshortcuts contract (UX-S02/B02) stays on the control
            // whenever the binding is live — collapsing the rail does not
            // unbind ⌘1–⌘6.
            const showHotkey = hotkeyBound && !sideNavCollapsed;
            return (
              <button
                type="button"
                key={item.view}
                data-testid={`sidenav-item-${item.view}`}
                aria-label={item.label}
                aria-current={activeView === item.view ? 'page' : undefined}
                aria-keyshortcuts={hotkeyBound && navShortcut ? navShortcut.ariaKeyshortcuts : undefined}
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
                {showHotkey && navShortcut ? <kbd>{navShortcut.combo}</kbd> : null}
              </button>
            );
          }

          return (
            <div key={group.label} className="nav-group">
              <div className={clsx('nav-group-label', sideNavCollapsed && 'sr-only')}>{group.label}</div>
              {primaryItems.map(renderNavItem)}
              {hasMore && (
                <>
                  {/* UX-B01: "More" disclosure button. Keyboard accessible via
                      button role; aria-expanded communicates current state to
                      assistive tech. When collapsed, secondary items remain in
                      the DOM as sr-only so ⌘1-6 navigation still fires. */}
                  <button
                    type="button"
                    data-testid={`sidenav-more-${group.label}`}
                    className="nav-button text-zinc-400 hover:text-ink"
                    aria-expanded={isExpanded}
                    aria-controls={`sidenav-more-panel-${group.label}`}
                    onClick={() => setNavGroupExpanded(group.label, !isExpanded)}
                  >
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                    <span className={clsx('min-w-0 flex-1 truncate text-left', sideNavCollapsed && 'sr-only')}>
                      {isExpanded ? 'Less' : 'More'}
                    </span>
                  </button>
                  {/* Secondary items: visually shown when expanded; rendered
                      sr-only when collapsed so keyboard shortcuts (⌘N) still
                      navigate even when the group is visually collapsed. */}
                  <div
                    id={`sidenav-more-panel-${group.label}`}
                    role="group"
                    aria-label={`More ${group.label} items`}
                    className={clsx(!isExpanded && !sideNavCollapsed && 'sr-only')}
                  >
                    {secondaryItems.map(renderNavItem)}
                  </div>
                </>
              )}
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
  const setActiveCustomerId = useUiStore((state) => state.setActiveCustomerId);
  const activeCustomerId = useUiStore((state) => state.activeCustomerId);
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
  const reference = trpc.queries.reference.useQuery();
  const visibleChips = keelChips.filter((chip) => viewVisibleForUser(chip.view, user) && startVisibleForUser(chip.launch, user));

  useEffect(() => {
    if (!actionsOpen) return;
    function closeOnOutside(event: MouseEvent) {
      if (!actionMenuRef.current?.contains(event.target as Node)) setActionsOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [actionsOpen]);

  // UX-S02: the keel search button is the visible control for the ⌘K binding —
  // surface that on the control itself, sourced from the shortcuts registry.
  const paletteShortcut = requireShortcut('palette.commands');

  return (
    <header className="keel" aria-label="Global workspace keel">
      <button
        type="button"
        className="command-search keel-search"
        aria-keyshortcuts={paletteShortcut.ariaKeyshortcuts}
        onClick={() => setCommandPaletteOpen(true)}
      >
        <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
        <span>Search</span>
        <kbd className="ml-auto">{paletteShortcut.combo}</kbd>
      </button>
      <div className="keel-chip-row" aria-label="Quick actions and tools">
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
                      key={chip.label}
                      type="button"
                      role="menuitem"
                      className={clsx('quick-action-item', activeView === chip.view && 'quick-action-item-active')}
                      title={chip.title}
                      onClick={() => {
                        setActiveQuickLaunch(chip.launch);
                        if (activeView !== chip.view) {
                          navigate(`/${chip.view}`);
                        } else {
                          // Already on this view — setActiveQuickLaunch above is
                          // sufficient to focus/expand the relevant panel (e.g.
                          // Quick Ledger on /payments for Money in/out).
                        }
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
        {activeView === 'sales' ? (
          <select
            className="select compact"
            value={activeCustomerId ?? ''}
            onChange={(e) => setActiveCustomerId(e.target.value || null)}
            title="Choose customer"
            aria-label="Choose customer"
            style={{ maxWidth: 200 }}
          >
            <option value="">Choose customer</option>
            {reference.data?.customers.map((c) => (
              <option key={c.id as string} value={c.id as string}>{c.name as string}</option>
            ))}
          </select>
        ) : null}
        <button type="button" className="text-button" onClick={() => logout.mutate()}>
          Sign out
        </button>
      </div>
      <div className="keel-utilities">
        <div className="keel-status-chip">
          <span className={clsx('h-3 w-3 border', health.data?.ok ? 'bg-emerald-500 border-emerald-700' : 'bg-amber border-amber')} aria-hidden="true" />
          <span>{health.data?.ok ? 'Healthy' : 'Needs attention'}</span>
        </div>
        <span className="min-w-0 truncate font-medium text-ink">{user.name}</span>
      </div>
    </header>
  );
}

export const TopBar = Keel;
