import { useEffect, useCallback } from 'react';
import { trpc } from '../api/trpc';
import { viewVisibleForUser } from '../accessPolicy';
import { drawerStateNameForState, useUiStore } from '../store/uiStore';
import { useCommandRunner } from './useCommandRunner';
import { navShortcuts, requireShortcut } from '../shortcuts/registry';
import { ShortcutsOverlay } from '../shortcuts/ShortcutsOverlay';
import type { ViewKey } from '../../shared/types';

// UX-T07: ⌘1–⌘6 lane bindings are derived from the shortcuts registry —
// the registry's Navigation entries are the single source of truth shared
// with the SideNav badges (Shell.tsx) and the '?' overlay.
const NAV_SHORTCUTS = navShortcuts();
const numberViews: Record<string, ViewKey> = Object.fromEntries(
  NAV_SHORTCUTS.map((shortcut) => [shortcut.combo.replace('⌘', ''), shortcut.view as ViewKey])
);

/**
 * UX-T07: every combo this handler implements, pinned to its registry row.
 * requireShortcut() throws at import time if a row is missing, and the
 * registry-sync test (src/client/shortcuts/registry.sync.test.tsx) asserts
 * this list and the registry are a bijection — a binding added on either
 * side without the other fails fast.
 */
export const HOTKEYS_HANDLED_SHORTCUT_IDS: readonly string[] = [
  ...NAV_SHORTCUTS.map((shortcut) => shortcut.id),
  requireShortcut('palette.commands').id,
  requireShortcut('palette.entities').id,
  requireShortcut('palette.advanced').id,
  requireShortcut('grid.quickFilter').id,
  requireShortcut('drawer.toggle').id,
  requireShortcut('drawer.cycleWidth').id,
  requireShortcut('drawer.tabs').id,
  requireShortcut('workspace.focusMode').id,
  requireShortcut('action.commitPrimary').id,
  requireShortcut('workspace.escape').id,
  requireShortcut('intake.duplicate').id,
  requireShortcut('intake.markReady').id,
  requireShortcut('intake.process').id,
  requireShortcut('sales.toggleMargin').id,
  requireShortcut('system.healthCheck').id,
  requireShortcut('system.validateAll').id,
  requireShortcut('help.shortcuts').id
];

/**
 * Views served by `queries.grid` (mirrors the server's `viewSchema` enum in
 * src/server/routers/queries.ts). Used by the Validate All hotkey (UX-A02) to
 * scope the refetch to the active view instead of nuking the whole cache.
 */
const GRID_QUERY_VIEWS = [
  'reports',
  'intake',
  'purchaseOrders',
  'sales',
  'matchmaking',
  'orders',
  'payments',
  'inventory',
  'clients',
  'vendors',
  'fulfillment',
  'connectors',
  'recovery',
  'closeout',
  'referees',
  'processors',
  'photography',
  'purchaseReceipts',
  'items',
  'disputes'
] as const;
type GridQueryView = (typeof GRID_QUERY_VIEWS)[number];

function gridQueryViewFor(view: ViewKey): GridQueryView | null {
  return (GRID_QUERY_VIEWS as readonly string[]).includes(view) ? (view as GridQueryView) : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'server unreachable';
}

export function Hotkeys() {
  const activeView = useUiStore((state) => state.activeView);
  const selectedRows = useUiStore((state) => state.selectedRows);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setCommandPaletteAdvancedOpen = useUiStore((state) => state.setCommandPaletteAdvancedOpen);
  const openPalette = useUiStore((state) => state.openPalette);
  const setFocusedPanel = useUiStore((state) => state.setFocusedPanel);
  const commandPaletteOpen = useUiStore((state) => state.commandPaletteOpen);
  const focusedPanelId = useUiStore((state) => state.focusedPanelId);
  const focusMode = useUiStore((state) => state.focusMode);
  const toggleFocusMode = useUiStore((state) => state.toggleFocusMode);
  const setFocusMode = useUiStore((state) => state.setFocusMode);
  const drawerState = useUiStore((state) => drawerStateNameForState(state, state.activeView));
  const toggleDrawer = useUiStore((state) => state.toggleDrawer);
  const cycleDrawer = useUiStore((state) => state.cycleDrawer);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const setDrawerTab = useUiStore((state) => state.setDrawerTab);
  const shortcutsOverlayOpen = useUiStore((state) => state.shortcutsOverlayOpen);
  const setShortcutsOverlayOpen = useUiStore((state) => state.setShortcutsOverlayOpen);
  const setShowMargin = useUiStore((state) => state.setShowMargin);
  const pushToast = useUiStore((state) => state.pushToast);
  const { runCommand } = useCommandRunner();
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();

  useEffect(() => {
    async function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editingText = isEditingText(target);
      const key = event.key.toLowerCase();

      // Guard Cmd+K (command palette) behind editingText — operators should not
      // accidentally open the palette while typing in a grid cell or search input.
      // Escape is intentionally left ungarded: its own condition checks (drawerState,
      // commandPaletteOpen, focusedPanelId) prevent it from acting when nothing is open.
      if (editingText && (event.metaKey && key === 'k')) return;

      if (event.metaKey && event.altKey && key === 'k') {
        event.preventDefault();
        setCommandPaletteAdvancedOpen(true);
        return;
      }
      if (event.metaKey && key === 'k') {
        event.preventDefault();
        // TER-1633: unified spotlight — ⌘K always opens on Commands tab
        openPalette('commands');
        return;
      }
      // TER-1633: ⌘⇧F opens the unified spotlight on the Entities tab
      if (event.metaKey && event.shiftKey && key === 'f') {
        event.preventDefault();
        openPalette('entities');
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        // SX-I12: Esc consumes one layer per press. Check in the documented
        // order (overlay first, then drawer, then palette, then focus) and
        // stop propagation so focus traps on child elements (ContextDrawer,
        // ShortcutsOverlay) do not also fire for the same keydown.
        let handled = false;
        if (shortcutsOverlayOpen) {
          setShortcutsOverlayOpen(false);
          handled = true;
        } else if (drawerState !== 'closed') {
          setDrawerState(activeView, 'closed');
          handled = true;
        } else if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          handled = true;
        } else if (focusedPanelId || focusMode) {
          setFocusedPanel(null);
          setFocusMode(false);
          handled = true;
        }
        if (handled) {
          event.stopPropagation();
        }
        return;
      }

      if (editingText) return;

      // UX-C01: '?' (Shift+/ outside text fields) toggles the keyboard
      // shortcuts overlay, generated from the UX-T07 registry.
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key === '?') {
        event.preventDefault();
        setShortcutsOverlayOpen(!shortcutsOverlayOpen);
        return;
      }

      // UX-F10: ⌥M toggles Sales workspace margin/cost column visibility
      // (uiStore.showMargin, persisted per #63). Truthful toast — the flag
      // only gates margin/cost columns and the internal sheet's cost line in
      // the Sales workspace; customer-facing exports are gated independently.
      if (event.altKey && !event.metaKey && !event.ctrlKey && (event.code === 'KeyM' || key === 'm')) {
        event.preventDefault();
        const next = !useUiStore.getState().showMargin;
        setShowMargin(next);
        pushToast(
          next
            ? 'Margin shown — cost & margin columns are visible in the Sales workspace.'
            : 'Margin hidden — cost & margin columns are hidden in the Sales workspace.',
          'info'
        );
        return;
      }

      if (event.code === 'BracketRight') {
        event.preventDefault();
        if (event.shiftKey) cycleDrawer(activeView);
        else toggleDrawer(activeView);
        return;
      }

      if (/^Digit[1-5]$/.test(event.code) && drawerState !== 'closed' && !event.metaKey) {
        event.preventDefault();
        const tabIndex = Number(event.code.replace('Digit', '')) - 1;
        const tab = tabForIndex(activeView, tabIndex);
        if (tab) setDrawerTab(activeView, tab);
        return;
      }

      const rows = selectedRows[activeView] ?? [];

      if (!event.metaKey && key === 'f') {
        event.preventDefault();
        toggleFocusMode();
        return;
      }

      // UX-A07: '/' focuses the active OperatorGrid quick-filter input.
      // Typing contexts are already excluded by the editingText guard above;
      // the palette gets its own search box, so skip while it is open.
      if (!event.metaKey && !event.altKey && !event.ctrlKey && event.key === '/') {
        if (commandPaletteOpen) return;
        const filterInput = document.querySelector<HTMLInputElement>('[data-grid-quick-filter]');
        if (!filterInput) return;
        event.preventDefault();
        filterInput.focus();
        filterInput.select();
        return;
      }

      if (!event.metaKey) return;

      const view = numberViews[event.key];
      if (view) {
        event.preventDefault();
        if (me.data && !viewVisibleForUser(view, me.data)) {
          pushToast('That lane is not part of this operator workspace.', 'info');
          return;
        }
        window.location.assign("/" + view);
        return;
      }

      // Guard destructive/command hotkeys when a modal dialog is open.
      // Escape, Cmd+K, and navigation hotkeys (Cmd+1-6) intentionally remain
      // unguarded — operators may still navigate or close the dialog.
      if (document.querySelector('[role="dialog"]')) return;

      if (key === 'd') {
        event.preventDefault();
        if (activeView !== 'intake' || !rows.length) return pushToast('Select intake rows to duplicate.', 'info');
        // TER-1658: createBatch now requires a PO line. Skip rows without one
        // (manual/legacy intake rows that predate the PO-first policy).
        for (const row of rows) {
          if (!row.purchaseOrderLineId) {
            pushToast(`${row.name ?? 'Batch'} cannot be duplicated: no PO line. Create batches from a purchase order.`, 'info');
            continue;
          }
          await runCommand('createBatch', {
            purchaseOrderLineId: row.purchaseOrderLineId,
            purchaseOrderId: row.purchaseOrderId ?? undefined,
            name: `${row.name ?? 'Batch'} copy`,
            category: row.category,
            vendorId: row.vendorId,
            shorthand: row.shorthand,
            intakeQty: row.intakeQty,
            unitCost: row.unitCost,
            unitPrice: row.unitPrice,
            uom: row.uom,
            ownershipStatus: row.ownershipStatus,
            location: row.location,
            status: 'draft'
          }, 'Hotkey duplicate intake row');
        }
      }
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        if (activeView !== 'intake' || !rows.length) return pushToast('Select intake rows to mark Ready.', 'info');
        for (const row of rows) await runCommand('updateBatch', { id: row.id, status: 'ready' }, 'Batch mark selected rows Ready');
      }
      if (event.altKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        if (activeView !== 'intake' || !rows.length) return pushToast('Select intake rows before Process Intake.', 'info');
        await runCommand('postPurchaseReceipt', { batchIds: rows.map((row) => row.id) }, 'Hotkey process intake');
      }
      if (event.altKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        // UX-A01: real server health check — a fresh, uncached round-trip to
        // the existing auth.me query. Pass/fail is reported truthfully.
        try {
          const user = await utils.client.auth.me.query();
          if (user) {
            pushToast(`Server reachable — signed in as ${user.name} (${user.email}).`, 'success');
          } else {
            pushToast('Server reachable, but no active session. Sign in again.', 'error');
          }
        } catch (error) {
          pushToast(`Health check failed: ${errorMessage(error)}.`, 'error');
        }
        return;
      }
      if (event.altKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        // UX-A02: genuine revalidation — invalidate (and await the refetch of)
        // the active view's grid query via tRPC utils. The toast fires only
        // after the refetch settles, with a truthful message.
        try {
          const gridView = gridQueryViewFor(activeView);
          if (gridView) {
            await utils.queries.grid.invalidate({ view: gridView });
            if (activeView === 'intake') await utils.intake.intakeQueue.invalidate();
            pushToast(`Validate All: refetched the ${activeView} grid from the server.`, 'success');
          } else {
            // Views without a queries.grid projection (dashboard, contacts,
            // settings, pick, credit-review): refresh their query family.
            await utils.queries.invalidate();
            pushToast('Validate All: refetched server data for the active view.', 'success');
          }
        } catch (error) {
          pushToast(`Validate All failed: ${errorMessage(error)}.`, 'error');
        }
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        // UX-A03: ⌘↵ commits the visible StatusActionBar primary for the
        // current selection. The bar's button is the rendered output of the
        // view's status decision table (resolveStatusActions), so this routes
        // through the exact same rules — across the full selection — instead
        // of firing a hardcoded command on rows[0].
        const primaryButton = document.querySelector<HTMLButtonElement>('[data-status-action-primary]');
        if (primaryButton) {
          if (primaryButton.disabled) {
            pushToast(primaryButton.title || 'The primary action is unavailable for this selection.', 'info');
            return;
          }
          primaryButton.click();
          return;
        }
        const reasonPill = document.querySelector<HTMLElement>('[data-status-action-reason]');
        if (reasonPill?.textContent) {
          pushToast(reasonPill.textContent, 'info');
          return;
        }
        if (!rows.length) {
          pushToast('Select rows first — ⌘↵ commits the primary action for the selection.', 'info');
          return;
        }
        pushToast('No primary action applies to the current selection in this view.', 'info');
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    activeView,
    commandPaletteOpen,
    cycleDrawer,
    drawerState,
    focusMode,
    focusedPanelId,
    openPalette,
    pushToast,
    runCommand,
    selectedRows,
    setActiveView,
    setCommandPaletteAdvancedOpen,
    setCommandPaletteOpen,
    setDrawerState,
    setDrawerTab,
    setFocusedPanel,
    setFocusMode,
    setShortcutsOverlayOpen,
    setShowMargin,
    shortcutsOverlayOpen,
    toggleDrawer,
    toggleFocusMode,
    me.data,
    utils
  ]);

  // UX-C01: the shortcuts overlay is mounted alongside the global key handler
  // so every shell that binds hotkeys also gets the '?' help surface.
  return <ShortcutsOverlay />;
}

function isEditingText(target: HTMLElement | null) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const editable = target.closest('input, textarea, select, [contenteditable="true"]');
  return Boolean(editable);
}

function tabForIndex(view: ViewKey, index: number) {
  // SX-I09: aligned with the rendered drawerTabs in ContextDrawer.tsx.
  // Each view maps to an entity type; the tab order here matches the
  // corresponding entry in drawerTabs exactly so digit hotkeys match
  // the numbers printed on the actual tabs.
  const tabsByView: Partial<Record<ViewKey, string[]>> = {
    // queue entity
    dashboard: ['actions', 'saved'],
    intake: ['actions', 'saved'],
    // report entity
    reports: ['rows', 'export', 'saved'],
    // po entity
    purchaseOrders: ['relationship', 'lines', 'vendor', 'linked-intake', 'history', 'commands'],
    // customer entity (clients view + sales drawer when customer is active)
    sales: ['relationship', 'timeline', 'profile', 'balance', 'credit'],
    clients: ['relationship', 'timeline', 'profile', 'balance', 'credit'],
    // order entity
    orders: ['relationship', 'timeline'],
    // payment entity
    payments: ['relationship'],
    // lot entity
    inventory: ['relationship', 'timeline', 'movement', 'sales', 'photos', 'history'],
    // vendor entity
    vendors: ['relationship', 'timeline', 'profile', 'open-bills', 'pos', 'history'],
    // pick entity
    fulfillment: ['relationship', 'lines', 'order', 'labels', 'history'],
    // connector entity
    connectors: ['relationship', 'request', 'source', 'history'],
    // recovery entity
    recovery: ['undo', 'target', 'history'],
    // closeout entity
    closeout: ['control-totals', 'open-work', 'artifacts'],
    // settings entity
    settings: ['requests', 'actions', 'archive']
  };
  return tabsByView[view]?.[index] ?? null;
}
