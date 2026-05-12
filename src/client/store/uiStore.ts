import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import type { GridRow, QuickLaunchMode, ViewKey } from '../../shared/types';

interface Toast {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface UiState {
  activeView: ViewKey;
  activeCustomerId: string | null;
  activeQuickLaunch: QuickLaunchMode | null;
  salesRequestText: string;
  selectedRows: Partial<Record<ViewKey, GridRow[]>>;
  commandPaletteOpen: boolean;
  rightPanelOpen: boolean;
  sideNavCollapsed: boolean;
  drilldownMetric: string | null;
  collapsedPanels: Record<string, boolean>;
  focusedPanelId: string | null;
  toasts: Toast[];
  announcement: string;
  setActiveView: (view: ViewKey) => void;
  setActiveCustomerId: (customerId: string | null) => void;
  setActiveQuickLaunch: (mode: QuickLaunchMode | null) => void;
  setSalesRequestText: (text: string) => void;
  setSelectedRows: (view: ViewKey, rows: GridRow[]) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleSideNav: () => void;
  setDrilldownMetric: (metric: string | null) => void;
  togglePanelCollapsed: (panelId: string) => void;
  setFocusedPanel: (panelId: string | null) => void;
  pushToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
  immer((set) => ({
    activeView: 'dashboard',
    activeCustomerId: null,
    activeQuickLaunch: 'sale',
    salesRequestText: '',
    selectedRows: {},
    commandPaletteOpen: false,
    rightPanelOpen: false,
    sideNavCollapsed: false,
    drilldownMetric: null,
    collapsedPanels: {},
    focusedPanelId: null,
    toasts: [],
    announcement: '',
    setActiveView: (view) =>
      set((state) => {
        state.activeView = view;
        state.focusedPanelId = null;
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
    setSalesRequestText: (text) =>
      set((state) => {
        state.salesRequestText = text;
      }),
    setSelectedRows: (view, rows) =>
      set((state) => {
        state.selectedRows[view] = rows;
      }),
    setCommandPaletteOpen: (open) =>
      set((state) => {
        state.commandPaletteOpen = open;
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
        state.announcement = panelId ? 'Panel expanded for focus.' : 'Workspace restored.';
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
      sideNavCollapsed: state.sideNavCollapsed,
      collapsedPanels: state.collapsedPanels,
      activeQuickLaunch: state.activeQuickLaunch
    })
  }
  )
);

function launchForView(view: ViewKey): QuickLaunchMode | null {
  if (view === 'purchaseOrders') return 'purchaseOrder';
  if (view === 'sales' || view === 'orders') return 'sale';
  if (view === 'intake' || view === 'inventory' || view === 'fulfillment') return 'receiving';
  if (view === 'payments' || view === 'clients') return 'moneyIn';
  if (view === 'vendors') return 'moneyOut';
  return null;
}
