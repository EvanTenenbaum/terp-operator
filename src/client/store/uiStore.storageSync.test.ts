// @vitest-environment jsdom
/**
 * FE-L3 (issue #36): multi-tab uiStore sync.
 *
 * Two tabs share the same `localStorage:terp-agro-ui` blob via Zustand persist.
 * Without an event-driven reconciliation, tab 2 silently keeps a stale snapshot
 * of state (e.g. `showMargin`, `sideNavCollapsed`, `gridColumnPrefs`) until it
 * reloads — at which point tab 1's mutations win arbitrarily.
 *
 * Fix: when another tab writes a new value to localStorage for the persist key,
 * call `useUiStore.persist.rehydrate()` so the listening tab re-reads the
 * persisted slice. Only the persisted partialize allowlist is replayed — transient
 * state (drawer entity, grid filters per #15) is unaffected.
 *
 * Sensitive state guard (UX-A1, #15): tests in uiStore.test.ts verify the
 * partialize allowlist; this file verifies the cross-tab sync without
 * re-asserting the allowlist.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useUiStore } from './uiStore';
import { registerUiStoreStorageSync } from './uiStoreStorageSync';

const STORAGE_KEY = 'terp-agro-ui';

function persistedEnvelope(state: Record<string, unknown>, version = 0): string {
  return JSON.stringify({ state, version });
}

function snapshotDefaults(): void {
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
    dismissedShadowBanner: false,
    showMargin: true
  });
}

describe('uiStore cross-tab storage sync (FE-L3, #36)', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    window.localStorage.clear();
    snapshotDefaults();
    cleanup = registerUiStoreStorageSync();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('rehydrates the store when another tab writes a new persisted blob', async () => {
    // Tab 2 represents this tab; tab 1 wrote showMargin: false to localStorage.
    expect(useUiStore.getState().showMargin).toBe(true);

    const newBlob = persistedEnvelope({
      activeView: 'dashboard',
      sideNavCollapsed: false,
      collapsedPanels: {},
      activeQuickLaunch: 'sale',
      activeSettingsTab: 'requests',
      drawerByView: {},
      gridColumnPrefs: {},
      dismissedShadowBanner: false,
      showMargin: false
    });
    window.localStorage.setItem(STORAGE_KEY, newBlob);

    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: newBlob, storageArea: window.localStorage })
    );

    // `rehydrate()` returns a Promise; flush microtasks before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(useUiStore.getState().showMargin).toBe(false);
  });

  it('rehydrates sideNavCollapsed when tab 1 toggles it', async () => {
    expect(useUiStore.getState().sideNavCollapsed).toBe(false);

    const newBlob = persistedEnvelope({
      activeView: 'dashboard',
      sideNavCollapsed: true,
      collapsedPanels: {},
      activeQuickLaunch: 'sale',
      activeSettingsTab: 'requests',
      drawerByView: {},
      gridColumnPrefs: {},
      dismissedShadowBanner: false,
      showMargin: true
    });
    window.localStorage.setItem(STORAGE_KEY, newBlob);
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: newBlob, storageArea: window.localStorage })
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(useUiStore.getState().sideNavCollapsed).toBe(true);
  });

  it('ignores storage events for unrelated keys (no rehydrate, no throw)', async () => {
    const initial = useUiStore.getState().showMargin;
    const rehydrateSpy = vi.spyOn(useUiStore.persist, 'rehydrate');

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'some-other-app-key',
        newValue: persistedEnvelope({ showMargin: false }),
        storageArea: window.localStorage
      })
    );

    await Promise.resolve();
    expect(rehydrateSpy).not.toHaveBeenCalled();
    expect(useUiStore.getState().showMargin).toBe(initial);
    rehydrateSpy.mockRestore();
  });

  it('ignores cleared-key storage events (newValue === null, e.g. logout)', async () => {
    const rehydrateSpy = vi.spyOn(useUiStore.persist, 'rehydrate');

    expect(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: null,
          storageArea: window.localStorage
        })
      );
    }).not.toThrow();

    await Promise.resolve();
    expect(rehydrateSpy).not.toHaveBeenCalled();
    rehydrateSpy.mockRestore();
  });

  it('swallows rehydrate errors so a corrupt blob in another tab does not crash this tab', async () => {
    // Force rehydrate() to reject — simulates a corrupted/incompatible persisted blob.
    const rehydrateSpy = vi
      .spyOn(useUiStore.persist, 'rehydrate')
      .mockRejectedValueOnce(new Error('synthetic rehydrate failure'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const newBlob = persistedEnvelope({ showMargin: false });
    window.localStorage.setItem(STORAGE_KEY, newBlob);
    expect(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: newBlob,
          storageArea: window.localStorage
        })
      );
    }).not.toThrow();

    // Flush the rejected promise.
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rehydrateSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();

    rehydrateSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('returns a cleanup function that detaches the listener', async () => {
    cleanup?.();
    cleanup = undefined;

    const rehydrateSpy = vi.spyOn(useUiStore.persist, 'rehydrate');
    const newBlob = persistedEnvelope({ showMargin: false });
    window.localStorage.setItem(STORAGE_KEY, newBlob);
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: newBlob, storageArea: window.localStorage })
    );

    await Promise.resolve();
    expect(rehydrateSpy).not.toHaveBeenCalled();
    rehydrateSpy.mockRestore();
  });

  it('is idempotent — calling registerUiStoreStorageSync twice does not double-fire rehydrate', async () => {
    // Already registered once in beforeEach; register a second time.
    const second = registerUiStoreStorageSync();
    const rehydrateSpy = vi.spyOn(useUiStore.persist, 'rehydrate');

    const newBlob = persistedEnvelope({ showMargin: false });
    window.localStorage.setItem(STORAGE_KEY, newBlob);
    window.dispatchEvent(
      new StorageEvent('storage', { key: STORAGE_KEY, newValue: newBlob, storageArea: window.localStorage })
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(rehydrateSpy).toHaveBeenCalledTimes(1);

    second();
    rehydrateSpy.mockRestore();
  });
});
