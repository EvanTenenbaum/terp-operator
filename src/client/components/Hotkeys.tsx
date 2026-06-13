import { useEffect } from 'react';
import { trpc } from '../api/trpc';
import { viewVisibleForUser } from '../accessPolicy';
import { drawerStateNameForState, useUiStore } from '../store/uiStore';
import { useCommandRunner } from './useCommandRunner';
import type { ViewKey } from '../../shared/types';

const numberViews: Record<string, ViewKey> = {
  '1': 'dashboard',
  '2': 'intake',
  '3': 'sales',
  '4': 'payments',
  '5': 'inventory',
  '6': 'clients'
};

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
        if (drawerState !== 'closed') {
          setDrawerState(activeView, 'closed');
          return;
        }
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (focusedPanelId || focusMode) {
          setFocusedPanel(null);
          setFocusMode(false);
          return;
        }
        return;
      }

      if (editingText) return;

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
        setActiveView(view);
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
            if (activeView === 'intake') await utils.queries.intakeQueue.invalidate();
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

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
    toggleDrawer,
    toggleFocusMode,
    me.data,
    utils
  ]);

  return null;
}

function isEditingText(target: HTMLElement | null) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const editable = target.closest('input, textarea, select, [contenteditable="true"]');
  return Boolean(editable);
}

function tabForIndex(view: ViewKey, index: number) {
  const tabsByView: Partial<Record<ViewKey, string[]>> = {
    dashboard: ['actions', 'saved'],
    reports: ['rows', 'export', 'saved'],
    purchaseOrders: ['relationship', 'lines', 'vendor', 'linked-intake', 'history'],
    intake: ['actions', 'saved'],
    sales: ['relationship', 'profile', 'balance', 'purchases', 'notes', 'history'],
    orders: ['relationship', 'lines', 'customer', 'output', 'history'],
    payments: ['relationship', 'allocations', 'customer', 'impact', 'history'],
    inventory: ['relationship', 'movement', 'sales', 'photos', 'history'],
    clients: ['relationship', 'profile', 'balance', 'purchases', 'notes', 'history'],
    vendors: ['relationship', 'due-reason', 'linked-po', 'payouts', 'history'],
    fulfillment: ['relationship', 'lines', 'order', 'labels', 'history'],
    connectors: ['relationship', 'request', 'source', 'history'],
    recovery: ['undo', 'target', 'history'],
    closeout: ['control-totals', 'open-work', 'artifacts'],
    settings: ['requests', 'actions', 'archive', 'strain-aliases', 'pricing']
  };
  return tabsByView[view]?.[index] ?? null;
}
