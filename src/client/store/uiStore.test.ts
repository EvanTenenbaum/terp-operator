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

const DEFAULT_STATE = {
  activeView: 'dashboard' as const,
  activeCustomerId: null,
  activeQuickLaunch: 'sale' as const,
  activeSettingsTab: 'requests' as const,
  salesRequestText: '',
  selectedRows: {},
  commandPaletteOpen: false,
  commandPaletteAdvancedOpen: false,
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
  dismissedShadowBanner: false,
  showMargin: true,
  lastUsedDrawerStateByView: {}
};

describe('uiStore persist partialize (UX-A1 — shared workstation leakage)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Reset store to defaults so prior test mutations don't bleed in.
    useUiStore.setState(DEFAULT_STATE);
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

describe('uiStore showMargin (#63 — operator margin visibility toggle)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState(DEFAULT_STATE);
  });

  it('defaults showMargin to true (operators see margin by default)', () => {
    expect(useUiStore.getState().showMargin).toBe(true);
  });

  it('setShowMargin(false) flips the flag in memory', () => {
    useUiStore.getState().setShowMargin(false);
    expect(useUiStore.getState().showMargin).toBe(false);
  });

  it('persists showMargin (benign per-user UX preference)', () => {
    useUiStore.getState().setShowMargin(false);
    const persisted = readPersisted();
    expect(persisted).toHaveProperty('showMargin', false);
  });

  it('persists showMargin === true when toggled back on', () => {
    useUiStore.getState().setShowMargin(false);
    useUiStore.getState().setShowMargin(true);
    const persisted = readPersisted();
    expect(persisted).toHaveProperty('showMargin', true);
  });
});

describe('uiStore toggleDrawer (TER-1630 — binary open/close at preferred width)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState(DEFAULT_STATE);
    // Ensure a stable queue entity is active for the sales view
    useUiStore.getState().setDrawerEntity('sales', 'queue');
  });

  it('opens to standard when closed and no lastUsed is set', () => {
    // Ensure closed
    useUiStore.getState().setDrawerState('sales', 'closed');
    useUiStore.getState().toggleDrawer('sales');
    expect(useUiStore.getState().lastUsedDrawerStateByView['sales']).toBeUndefined();
    const view = useUiStore.getState();
    // Drawer should now be open at 'standard'
    const entity = view.activeDrawerEntityByView['sales'];
    expect(entity).toBeDefined();
    // drawerByView entry state should be 'standard'
    // Use drawerStateNameForState via getState()
    const s = useUiStore.getState();
    const key = Object.keys(s.drawerByView)[0];
    expect(s.drawerByView[key]?.state).toBe('standard');
  });

  it('opens to lastUsed state when one has been saved for the view', () => {
    // Manually prime lastUsedDrawerStateByView to 'wide'
    useUiStore.setState({ lastUsedDrawerStateByView: { sales: 'wide' } });
    useUiStore.getState().setDrawerState('sales', 'closed');
    useUiStore.getState().toggleDrawer('sales');
    const s = useUiStore.getState();
    const key = Object.keys(s.drawerByView)[0];
    expect(s.drawerByView[key]?.state).toBe('wide');
  });

  it('closes when open and saves the current state as lastUsed', () => {
    // Open to 'wide'
    useUiStore.getState().setDrawerState('sales', 'wide');
    // Toggle to close
    useUiStore.getState().toggleDrawer('sales');
    const s = useUiStore.getState();
    const key = Object.keys(s.drawerByView)[0];
    expect(s.drawerByView[key]?.state).toBe('closed');
    expect(s.lastUsedDrawerStateByView['sales']).toBe('wide');
  });

  it('round-trip: close saves lastUsed, re-open restores it', () => {
    useUiStore.getState().setDrawerState('sales', 'focus');
    useUiStore.getState().toggleDrawer('sales'); // close → saves 'focus'
    useUiStore.getState().toggleDrawer('sales'); // open → restores 'focus'
    const s = useUiStore.getState();
    const key = Object.keys(s.drawerByView)[0];
    expect(s.drawerByView[key]?.state).toBe('focus');
  });

  it('announcement is "Context drawer closed." when closing', () => {
    useUiStore.getState().setDrawerState('sales', 'standard');
    useUiStore.getState().toggleDrawer('sales');
    expect(useUiStore.getState().announcement).toBe('Context drawer closed.');
  });

  it('announcement names the target state when opening', () => {
    useUiStore.setState({ lastUsedDrawerStateByView: { sales: 'peek' } });
    useUiStore.getState().setDrawerState('sales', 'closed');
    useUiStore.getState().toggleDrawer('sales');
    expect(useUiStore.getState().announcement).toBe('Context drawer peek.');
  });
});

describe('uiStore cycleDrawer (TER-1630 — shift-click cycles + persists lastUsed)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState(DEFAULT_STATE);
    useUiStore.getState().setDrawerEntity('sales', 'queue');
  });

  it('cycles standard → wide → focus → standard', () => {
    useUiStore.getState().setDrawerState('sales', 'standard');
    useUiStore.getState().cycleDrawer('sales');
    let key = Object.keys(useUiStore.getState().drawerByView)[0];
    expect(useUiStore.getState().drawerByView[key]?.state).toBe('wide');

    useUiStore.getState().cycleDrawer('sales');
    expect(useUiStore.getState().drawerByView[key]?.state).toBe('focus');

    useUiStore.getState().cycleDrawer('sales');
    expect(useUiStore.getState().drawerByView[key]?.state).toBe('standard');
  });

  it('persists the cycled-to state as lastUsedDrawerStateByView', () => {
    useUiStore.getState().setDrawerState('sales', 'standard');
    useUiStore.getState().cycleDrawer('sales');
    expect(useUiStore.getState().lastUsedDrawerStateByView['sales']).toBe('wide');
    useUiStore.getState().cycleDrawer('sales');
    expect(useUiStore.getState().lastUsedDrawerStateByView['sales']).toBe('focus');
  });
});

describe('uiStore lastUsedDrawerStateByView persistence (TER-1630)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiStore.setState(DEFAULT_STATE);
    useUiStore.getState().setDrawerEntity('sales', 'queue');
  });

  it('persists lastUsedDrawerStateByView to localStorage', () => {
    useUiStore.setState({ lastUsedDrawerStateByView: { sales: 'wide' } });
    // Trigger a persist flush by calling any persisted-state-mutating action
    useUiStore.getState().setShowMargin(true);
    const persisted = readPersisted();
    expect(persisted).toHaveProperty('lastUsedDrawerStateByView');
    expect((persisted.lastUsedDrawerStateByView as Record<string, string>)['sales']).toBe('wide');
  });

  it('does NOT reset lastUsedDrawerStateByView on resetSession (it is a UX preference)', () => {
    useUiStore.setState({ lastUsedDrawerStateByView: { sales: 'focus', inventory: 'wide' } });
    useUiStore.getState().resetSession();
    const s = useUiStore.getState();
    expect(s.lastUsedDrawerStateByView['sales']).toBe('focus');
    expect(s.lastUsedDrawerStateByView['inventory']).toBe('wide');
  });

  it('per-view isolation: changing lastUsed for one view does not affect another', () => {
    useUiStore.setState({ lastUsedDrawerStateByView: { sales: 'wide', inventory: 'focus' } });
    // toggleDrawer on inventory should not touch sales lastUsed
    useUiStore.getState().setDrawerEntity('inventory', 'queue');
    useUiStore.getState().setDrawerState('inventory', 'focus');
    useUiStore.getState().toggleDrawer('inventory'); // closes inventory
    const s = useUiStore.getState();
    expect(s.lastUsedDrawerStateByView['sales']).toBe('wide');
    expect(s.lastUsedDrawerStateByView['inventory']).toBe('focus');
  });
});
