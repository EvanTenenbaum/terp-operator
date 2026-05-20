import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { DrawerEntityRef, DrawerState, DrawerStateName, GridRow, QuickLaunchMode, RouteHistoryEntry, SettingsTab, ViewKey } from '../../shared/types';

interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

export interface GridColumnPref {
  colId: string;
  hide?: boolean;
  width?: number;
  pinned?: 'left' | 'right' | null;
  sort?: 'asc' | 'desc' | null;
  sortIndex?: number | null;
}

interface UiState {
  activeView: ViewKey;
  activeCustomerId: string | null;
  activeQuickLaunch: QuickLaunchMode | null;
  activeSettingsTab: SettingsTab;
  salesRequestText: string;
  selectedRows: Partial<Record<ViewKey, GridRow[]>>;
  commandPaletteOpen: boolean;
  commandPaletteAdvancedOpen: boolean;
  rightPanelOpen: boolean;
  sideNavCollapsed: boolean;
  drilldownMetric: string | null;
  collapsedPanels: Record<string, boolean>;
  focusedPanelId: string | null;
  focusMode: boolean;
  drawerByView: Record<string, DrawerState>;
  activeDrawerEntityByView: Partial<Record<ViewKey, DrawerEntityRef>>;
  gridFilters: Partial<Record<ViewKey, string>>;
  gridColumnPrefs: Record<string, GridColumnPref[]>;
  routeHistory: RouteHistoryEntry[];
  toasts: Toast[];
  announcement: string;
  setActiveView: (view: ViewKey) => void;
  setActiveCustomerId: (customerId: string | null) => void;
  setActiveQuickLaunch: (mode: QuickLaunchMode | null) => void;
  setActiveSettingsTab: (tab: SettingsTab) => void;
  setSalesRequestText: (text: string) => void;
  setSelectedRows: (view: ViewKey, rows: GridRow[]) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setCommandPaletteAdvancedOpen: (open: boolean) => void;
  toggleSideNav: () => void;
  setDrilldownMetric: (metric: string | null) => void;
  togglePanelCollapsed: (panelId: string) => void;
  setFocusedPanel: (panelId: string | null) => void;
  setFocusMode: (focused: boolean) => void;
  toggleFocusMode: () => void;
  setDrawerEntity: (view: ViewKey, entityType: string, entityId?: string | null) => void;
  setDrawerState: (view: ViewKey, stateName: DrawerStateName) => void;
  setDrawerTab: (view: ViewKey, tab: string) => void;
  toggleDrawer: (view: ViewKey) => void;
  cycleDrawer: (view: ViewKey) => void;
  setGridFilter: (view: ViewKey, filter: string) => void;
  setGridColumnPrefs: (tableKey: string, prefs: GridColumnPref[]) => void;
  resetGridColumnPrefs: (tableKey: string) => void;
  pushRouteHistory: (entry: Omit<RouteHistoryEntry, 'timestamp'>) => void;
  goBackRouteHistory: () => void;
  pushToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
  immer((set) => ({
    activeView: 'dashboard',
    activeCustomerId: null,
    activeQuickLaunch: 'sale',
    activeSettingsTab: 'requests',
    salesRequestText: '',
    selectedRows: {},
    commandPaletteOpen: false,
    commandPaletteAdvancedOpen: false,
    rightPanelOpen: false,
    sideNavCollapsed: false,
    drilldownMetric: null,
    collapsedPanels: {},
    focusedPanelId: null,
    focusMode: false,
    drawerByView: {},
    activeDrawerEntityByView: {},
    gridFilters: {},
    gridColumnPrefs: {},
    routeHistory: [],
    toasts: [],
    announcement: '',
    setActiveView: (view) =>
      set((state) => {
        if (state.activeView !== view) {
          const activeDrawer = currentDrawerForState(state, state.activeView);
          const activeEntity = activeEntityForState(state, state.activeView);
          pushRouteEntry(state, {
            view: state.activeView,
            entityType: activeEntity.entityType,
            entityId: activeEntity.entityId,
            drawerState: activeDrawer.state,
            activeTab: activeDrawer.activeTab
          });
        }
        state.activeView = view;
        state.focusedPanelId = null;
        state.focusMode = false;
        state.activeQuickLaunch = launchForView(view) ?? state.activeQuickLaunch ?? 'sale';
        state.announcement = `Opened ${view}.`;
      }),
    setActiveCustomerId: (customerId) =>
      set((state) => {
        state.activeCustomerId = customerId;
        if (customerId) state.announcement = 'Customer workspace opened.';
      }),
    setActiveQuickLaunch: (mode) =>
      set((state) => {
        state.activeQuickLaunch = mode ?? state.activeQuickLaunch ?? 'sale';
      }),
    setActiveSettingsTab: (tab) =>
      set((state) => {
        state.activeSettingsTab = tab;
      }),
    setSalesRequestText: (text) =>
      set((state) => {
        state.salesRequestText = text;
      }),
    setSelectedRows: (view, rows) =>
      set((state) => {
        state.selectedRows[view] = rows;
        const entity = rows[0] ? inferDrawerEntity(view, rows[0]) : { entityType: 'queue', entityId: null };
        state.activeDrawerEntityByView[view] = entity;
        const key = drawerStorageKey(view, entity);
        state.drawerByView[key] ??= defaultDrawerState(defaultTabForEntity(entity.entityType));
        if (rows.length && state.drawerByView[key].state === 'peek') state.drawerByView[key].state = 'standard';
      }),
    setCommandPaletteOpen: (open) =>
      set((state) => {
        state.commandPaletteOpen = open;
        if (!open) state.commandPaletteAdvancedOpen = false;
      }),
    setCommandPaletteAdvancedOpen: (open) =>
      set((state) => {
        state.commandPaletteAdvancedOpen = open;
        state.commandPaletteOpen = open || state.commandPaletteOpen;
      }),
    toggleSideNav: () =>
      set((state) => {
        state.sideNavCollapsed = !state.sideNavCollapsed;
        state.announcement = state.sideNavCollapsed ? 'Navigation collapsed.' : 'Navigation expanded.';
      }),
    setDrilldownMetric: (metric) =>
      set((state) => {
        state.drilldownMetric = metric;
      }),
    togglePanelCollapsed: (panelId) =>
      set((state) => {
        state.collapsedPanels[panelId] = !state.collapsedPanels[panelId];
        state.announcement = state.collapsedPanels[panelId] ? 'Panel minimized.' : 'Panel expanded.';
      }),
    setFocusedPanel: (panelId) =>
      set((state) => {
        state.focusedPanelId = panelId;
        state.focusMode = Boolean(panelId);
        state.announcement = panelId ? 'Panel expanded for focus.' : 'Workspace restored.';
      }),
    setFocusMode: (focused) =>
      set((state) => {
        state.focusMode = focused;
        if (!focused) state.focusedPanelId = null;
        state.announcement = focused ? 'Focus mode on.' : 'Focus mode off.';
      }),
    toggleFocusMode: () =>
      set((state) => {
        const focused = !(state.focusMode || state.focusedPanelId);
        state.focusMode = focused;
        if (!focused) state.focusedPanelId = null;
        state.announcement = focused ? 'Focus mode on.' : 'Focus mode off.';
      }),
    setDrawerEntity: (view, entityType, entityId = null) =>
      set((state) => {
        const entity = { entityType, entityId };
        state.activeDrawerEntityByView[view] = entity;
        const key = drawerStorageKey(view, entity);
        state.drawerByView[key] ??= defaultDrawerState(defaultTabForEntity(entityType));
      }),
    setDrawerState: (view, stateName) =>
      set((state) => {
        const entity = activeEntityForState(state, view);
        const key = drawerStorageKey(view, entity);
        state.drawerByView[key] ??= defaultDrawerState(defaultTabForEntity(entity.entityType));
        state.drawerByView[key].state = stateName;
        state.announcement = stateName === 'closed' ? 'Context drawer closed.' : `Context drawer ${stateName}.`;
      }),
    setDrawerTab: (view, tab) =>
      set((state) => {
        const entity = activeEntityForState(state, view);
        const key = drawerStorageKey(view, entity);
        state.drawerByView[key] ??= defaultDrawerState(defaultTabForEntity(entity.entityType));
        state.drawerByView[key].activeTab = tab;
        if (state.drawerByView[key].state === 'closed') state.drawerByView[key].state = 'peek';
        state.announcement = `Opened ${tab} drawer tab.`;
      }),
    toggleDrawer: (view) =>
      set((state) => {
        const entity = activeEntityForState(state, view);
        const key = drawerStorageKey(view, entity);
        state.drawerByView[key] ??= defaultDrawerState(defaultTabForEntity(entity.entityType));
        const current = state.drawerByView[key].state;
        state.drawerByView[key].state = current === 'closed' ? 'peek' : current === 'peek' ? 'standard' : 'closed';
        state.announcement = state.drawerByView[key].state === 'closed' ? 'Context drawer closed.' : `Context drawer ${state.drawerByView[key].state}.`;
      }),
    cycleDrawer: (view) =>
      set((state) => {
        const entity = activeEntityForState(state, view);
        const key = drawerStorageKey(view, entity);
        state.drawerByView[key] ??= defaultDrawerState(defaultTabForEntity(entity.entityType));
        const current = state.drawerByView[key].state;
        state.drawerByView[key].state = current === 'standard' ? 'wide' : current === 'wide' ? 'focus' : 'standard';
        state.announcement = `Context drawer ${state.drawerByView[key].state}.`;
      }),
    setGridFilter: (view, filter) =>
      set((state) => {
        state.gridFilters[view] = filter;
        state.announcement = filter ? `Filtered ${view}.` : `Cleared ${view} filter.`;
      }),
    setGridColumnPrefs: (tableKey, prefs) =>
      set((state) => {
        state.gridColumnPrefs[tableKey] = prefs;
      }),
    resetGridColumnPrefs: (tableKey) =>
      set((state) => {
        delete state.gridColumnPrefs[tableKey];
        state.announcement = 'Column layout reset.';
      }),
    pushRouteHistory: (entry) =>
      set((state) => {
        pushRouteEntry(state, entry);
      }),
    goBackRouteHistory: () =>
      set((state) => {
        const entry = state.routeHistory.pop();
        if (!entry) {
          state.announcement = 'No previous workspace.';
          return;
        }
        state.activeView = entry.view;
        const entity = { entityType: entry.entityType, entityId: entry.entityId };
        state.activeDrawerEntityByView[entry.view] = entity;
        state.drawerByView[drawerStorageKey(entry.view, entity)] = {
          state: entry.drawerState,
          activeTab: entry.activeTab
        };
        state.focusedPanelId = null;
        state.focusMode = false;
        state.announcement = `Returned to ${entry.view}.`;
      }),
    pushToast: (message, tone = 'info') =>
      set((state) => {
        const id = crypto.randomUUID();
        state.toasts.push({ id, message, tone });
        state.announcement = message;
      }),
    dismissToast: (id) =>
      set((state) => {
        state.toasts = state.toasts.filter((toast) => toast.id !== id);
      })
  })),
  {
    name: 'terp-agro-ui',
    partialize: (state) => ({
      activeView: state.activeView,
      sideNavCollapsed: state.sideNavCollapsed,
      collapsedPanels: state.collapsedPanels,
      activeQuickLaunch: state.activeQuickLaunch,
      activeSettingsTab: state.activeSettingsTab,
      drawerByView: state.drawerByView,
      activeDrawerEntityByView: state.activeDrawerEntityByView,
      gridFilters: state.gridFilters,
      gridColumnPrefs: state.gridColumnPrefs
    })
  }
  )
);

export function drawerStorageKey(view: ViewKey, entity: DrawerEntityRef) {
  return entity.entityType === 'queue' || !entity.entityId ? `${view}:queue` : `${view}:${entity.entityType}:${entity.entityId}`;
}

export function defaultDrawerState(activeTab = 'profile'): DrawerState {
  return { state: 'closed', activeTab };
}

export const queueDrawerEntity: DrawerEntityRef = { entityType: 'queue', entityId: null };

export function defaultTabForEntity(entityType: string) {
  const tabs: Record<string, string> = {
    queue: 'actions',
    customer: 'balance',
    vendor: 'profile',
    lot: 'movement',
    order: 'lines',
    po: 'lines',
    vendorBill: 'due-reason',
    payment: 'allocations',
    pick: 'lines',
    connector: 'request',
    recovery: 'undo',
    closeout: 'control-totals',
    report: 'rows',
    settings: 'requests'
  };
  return tabs[entityType] ?? 'profile';
}

export function activeEntityForState(state: Pick<UiState, 'activeDrawerEntityByView'>, view: ViewKey): DrawerEntityRef {
  return state.activeDrawerEntityByView[view] ?? queueDrawerEntity;
}

export function storedDrawerForState(state: Pick<UiState, 'activeDrawerEntityByView' | 'drawerByView'>, view: ViewKey): DrawerState | undefined {
  const entity = activeEntityForState(state, view);
  return state.drawerByView[drawerStorageKey(view, entity)];
}

export function drawerStateNameForState(state: Pick<UiState, 'activeDrawerEntityByView' | 'drawerByView'>, view: ViewKey): DrawerStateName {
  return storedDrawerForState(state, view)?.state ?? 'closed';
}

export function currentDrawerForState(state: Pick<UiState, 'activeDrawerEntityByView' | 'drawerByView'>, view: ViewKey): DrawerState {
  const entity = activeEntityForState(state, view);
  return state.drawerByView[drawerStorageKey(view, entity)] ?? defaultDrawerState(defaultTabForEntity(entity.entityType));
}

function launchForView(view: ViewKey): QuickLaunchMode | null {
  if (['reports', 'settings', 'connectors', 'recovery', 'closeout'].includes(view)) return null;
  if (view === 'purchaseOrders') return 'purchaseOrder';
  if (view === 'sales' || view === 'orders') return 'sale';
  if (view === 'matchmaking') return 'customerNeed';
  if (view === 'intake' || view === 'inventory' || view === 'fulfillment') return 'receiving';
  if (view === 'payments' || view === 'clients') return 'moneyIn';
  if (view === 'vendors') return 'moneyOut';
  return null;
}

function inferDrawerEntity(view: ViewKey, row: GridRow): DrawerEntityRef {
  if (view === 'sales' && row.customerId) return { entityType: 'customer', entityId: String(row.customerId) };
  if (view === 'matchmaking' && row.customerNeedId) return { entityType: 'customerNeed', entityId: String(row.customerNeedId) };
  if (view === 'matchmaking' && row.vendorSupplyId) return { entityType: 'vendorSupply', entityId: String(row.vendorSupplyId) };
  if (view === 'matchmaking') return { entityType: row.needCode ? 'customerNeed' : row.supplyCode ? 'vendorSupply' : 'match', entityId: row.id };
  if (view === 'clients') return { entityType: 'customer', entityId: row.customerId ? String(row.customerId) : row.id };
  if (view === 'vendors') return { entityType: 'vendorBill', entityId: row.id };
  if (view === 'purchaseOrders') return { entityType: 'po', entityId: row.id };
  if (view === 'intake' || view === 'inventory') return { entityType: 'lot', entityId: row.id };
  if (view === 'orders') return { entityType: 'order', entityId: row.id };
  if (view === 'payments') return { entityType: 'payment', entityId: row.id };
  if (view === 'fulfillment') return { entityType: 'pick', entityId: row.id };
  if (view === 'connectors') return { entityType: 'connector', entityId: row.id };
  if (view === 'recovery') return { entityType: 'recovery', entityId: row.id };
  if (view === 'closeout') return { entityType: 'closeout', entityId: row.id };
  if (view === 'settings') return { entityType: 'settings', entityId: row.id };
  if (view === 'reports') return { entityType: 'report', entityId: row.id };
  if (row.vendorId) return { entityType: 'vendor', entityId: String(row.vendorId) };
  if (row.customerId) return { entityType: 'customer', entityId: String(row.customerId) };
  return { entityType: 'queue', entityId: null };
}

function pushRouteEntry(state: UiState, entry: Omit<RouteHistoryEntry, 'timestamp'>) {
  state.routeHistory.push({ ...entry, timestamp: Date.now() });
  if (state.routeHistory.length > 20) state.routeHistory = state.routeHistory.slice(-20);
}
