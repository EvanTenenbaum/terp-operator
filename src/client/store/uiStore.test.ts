// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from './uiStore';

const STORAGE_KEY = 'terp-agro-ui';

function readPersisted(): Record<string, unknown> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  // zustand persist envelope: { state: {...}, version: number }
  return (parsed?.state ?? parsed) as Record<string, unknown>;
}

describe('uiStore persist partialize (UX-A1 — shared workstation leakage)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Reset store to defaults so prior test mutations don't bleed in.
    useUiStore.setState({
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
      dismissedShadowBanner: false
    });
  });

  it('does NOT persist activeDrawerEntityByView (would leak customer/vendor/PO UUIDs)', () => {
    useUiStore.getState().setDrawerEntity('sales', 'customer', '11111111-2222-3333-4444-555555555555');
    const persisted = readPersisted();
    expect(persisted).not.toHaveProperty('activeDrawerEntityByView');
  });

  it('does NOT persist gridFilters (would leak operator-typed search text with names)', () => {
    useUiStore.getState().setGridFilter('clients', 'name:Acme phone:555');
    const persisted = readPersisted();
    expect(persisted).not.toHaveProperty('gridFilters');
  });

  it('continues to persist non-sensitive preference state (column prefs, nav, view)', () => {
    const store = useUiStore.getState();
    store.setGridColumnPrefs('view:sales', [{ colId: 'total', width: 200 }]);
    store.toggleSideNav();
    store.setActiveView('inventory');
    store.setActiveSettingsTab('requests');

    const persisted = readPersisted();
    expect(persisted).toHaveProperty('gridColumnPrefs');
    expect(persisted).toHaveProperty('sideNavCollapsed');
    expect(persisted).toHaveProperty('activeView');
    expect(persisted).toHaveProperty('activeSettingsTab');
    // drawerByView (view-related state from PR #66 family) is still preserved —
    // it stores per-(view+entity) drawer open/tab state keyed by storage key,
    // not the active entity reference itself.
    expect(persisted).toHaveProperty('drawerByView');
  });

  it('persists dismissedShadowBanner (per-user preference, non-sensitive)', () => {
    useUiStore.getState().setDismissedShadowBanner(true);
    const persisted = readPersisted();
    expect(persisted).toHaveProperty('dismissedShadowBanner', true);
  });
});
