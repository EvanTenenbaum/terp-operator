import {
  Archive,
  BadgeDollarSign,
  Boxes,
  ClipboardList,
  Gauge,
  History,
  Inbox,
  Landmark,
  PackageCheck,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  ShoppingCart,
  Truck
} from 'lucide-react';
import clsx from 'clsx';
import { trpc } from '../api/trpc';
import { useUiStore } from '../store/uiStore';
import type { SessionUser, ViewKey } from '../../shared/types';

const navItems: Array<{ view: ViewKey; label: string; hotkey?: string; icon: typeof Gauge }> = [
  { view: 'dashboard', label: 'Dashboard', hotkey: '⌘1', icon: Gauge },
  { view: 'purchaseOrders', label: 'Purchase Orders', icon: PackagePlus },
  { view: 'intake', label: 'Intake', hotkey: '⌘2', icon: ClipboardList },
  { view: 'sales', label: 'Sales', hotkey: '⌘3', icon: ShoppingCart },
  { view: 'payments', label: 'Payments', hotkey: '⌘4', icon: BadgeDollarSign },
  { view: 'inventory', label: 'Inventory', hotkey: '⌘5', icon: Boxes },
  { view: 'clients', label: 'Client Ledger', hotkey: '⌘6', icon: ReceiptText },
  { view: 'orders', label: 'Orders', icon: Inbox },
  { view: 'vendors', label: 'Vendor Payouts', icon: Landmark },
  { view: 'fulfillment', label: 'Fulfillment', icon: PackageCheck },
  { view: 'connectors', label: 'Connectors', icon: Truck },
  { view: 'recovery', label: 'Recovery', icon: History },
  { view: 'closeout', label: 'Closeout', icon: Archive }
];

export function SideNav({ user }: { user: SessionUser }) {
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const sideNavCollapsed = useUiStore((state) => state.sideNavCollapsed);
  const toggleSideNav = useUiStore((state) => state.toggleSideNav);
  const visibleNav = navItems.filter((item) => navVisibleForUser(item.view, user));

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
        {visibleNav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.view}
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
    </nav>
  );
}

function navVisibleForUser(view: ViewKey, user: SessionUser) {
  if (user.role === 'owner' || user.role === 'manager') return true;
  if (user.role === 'viewer') return ['dashboard', 'purchaseOrders', 'sales', 'orders', 'payments', 'inventory', 'clients', 'vendors', 'fulfillment', 'connectors'].includes(view);
  const email = user.email.toLowerCase();
  const name = user.name.toLowerCase();
  if (email.includes('sales') || name.includes('sales')) return ['dashboard', 'sales', 'orders', 'inventory', 'clients', 'connectors', 'payments'].includes(view);
  if (email.includes('intake') || name.includes('intake')) return ['dashboard', 'purchaseOrders', 'intake', 'inventory', 'fulfillment', 'vendors', 'connectors'].includes(view);
  return ['dashboard', 'purchaseOrders', 'intake', 'sales', 'orders', 'payments', 'inventory', 'clients', 'vendors', 'fulfillment', 'connectors'].includes(view);
}

export function TopBar({ user }: { user: SessionUser }) {
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const utils = trpc.useContext();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => utils.auth.me.invalidate()
  });
  const health = trpc.queries.health.useQuery(undefined, { refetchInterval: 30_000 });

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-white px-4">
      <button type="button" className="command-search" onClick={() => setCommandPaletteOpen(true)}>
        <span className="text-zinc-500">⌘K</span>
        <span>Search commands, rows, and actions</span>
      </button>
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className={clsx('h-3 w-3 border', health.data?.ok ? 'bg-emerald-500 border-emerald-700' : 'bg-amber border-amber')} aria-hidden="true" />
          <span>{health.data?.ok ? 'Healthy' : 'Needs attention'}</span>
        </div>
        <span className="text-zinc-300">|</span>
        <span className="font-medium text-ink">{user.name}</span>
        <span className="rounded border border-line px-2 py-0.5 text-xs uppercase text-zinc-700">{user.role}</span>
        <button type="button" className="text-button" onClick={() => logout.mutate()}>
          Sign out
        </button>
      </div>
    </header>
  );
}
