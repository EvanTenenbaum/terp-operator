import { logger } from '@/client/services/logger';
/**
 * FE-L3 (issue #36): cross-tab uiStore sync.
 *
 * Without this listener, two tabs share the same Zustand-persisted
 * `localStorage:terp-agro-ui` blob but never reconcile in-memory state. A
 * mutation in tab 1 (e.g. toggling `showMargin` or `sideNavCollapsed`) writes
 * to localStorage, but tab 2's running store keeps its stale snapshot until
 * the page reloads — at which point the most recent writer wins arbitrarily.
 *
 * Fix: when the browser fires a `storage` event for our persist key (these
 * events fire only in OTHER tabs/windows by spec), call
 * `useUiStore.persist.rehydrate()` to re-read the persisted slice in this
 * tab. Only the persisted partialize allowlist (activeView, sideNavCollapsed,
 * collapsedPanels, activeQuickLaunch, activeSettingsTab, drawerByView,
 * gridColumnPrefs, dismissedShadowBanner, showMargin) is replayed — transient
 * state (drawer entity, grid filters per UX-A1/#15) is untouched, preserving
 * the shared-workstation leakage guarantees from PR #80/#89.
 *
 * Edge cases handled:
 *   - Unrelated keys → ignored (no rehydrate).
 *   - `newValue: null` (key cleared, e.g. by logout/storage.clear) → ignored
 *     to avoid clobbering the live store with defaults.
 *   - Rehydrate rejection (corrupt/incompatible persisted blob from another
 *     tab) → warning logged; this tab continues with its current state.
 *   - SSR / non-browser environments → no-op (guarded by `typeof window`).
 *   - Double-registration → idempotent; the second call is a no-op cleanup.
 */
import { useUiStore } from './uiStore';

const STORAGE_KEY = 'terp-agro-ui';

let registered = false;

export function registerUiStoreStorageSync(): () => void {
  if (typeof window === 'undefined') {
    return () => {
      /* no-op in non-browser env */
    };
  }

  if (registered) {
    // Idempotent: a second registration in the same tab returns a no-op
    // cleanup so callers can still pair register/cleanup without double-firing
    // the listener on every storage event.
    return () => {
      /* no-op: original registration is still active */
    };
  }

  const handler = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY) return;
    // newValue === null indicates the key was removed (e.g. on logout via
    // localStorage.clear() or removeItem). Rehydrating against an absent key
    // would reset this tab's store to defaults, which would itself be a
    // surprising cross-tab side effect. The login/logout boundary is handled
    // by the auth flow, not by this sync.
    if (event.newValue === null) return;

    try {
      const result = useUiStore.persist.rehydrate();
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch((err) => {
          logger.warn('uiStore storage rehydration failed', { error: String(err) });
        });
      }
    } catch (err) {
      logger.warn('uiStore storage rehydration failed', { error: String(err) });
    }
  };

  window.addEventListener('storage', handler);
  registered = true;

  return () => {
    window.removeEventListener('storage', handler);
    registered = false;
  };
}
