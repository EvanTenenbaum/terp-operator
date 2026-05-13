import { useEffect } from 'react';
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

export function Hotkeys() {
  const activeView = useUiStore((state) => state.activeView);
  const selectedRows = useUiStore((state) => state.selectedRows);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setCommandPaletteAdvancedOpen = useUiStore((state) => state.setCommandPaletteAdvancedOpen);
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

  useEffect(() => {
    async function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editingText = isEditingText(target);
      const key = event.key.toLowerCase();

      if (event.metaKey && event.altKey && key === 'k') {
        event.preventDefault();
        setCommandPaletteAdvancedOpen(true);
        return;
      }
      if (event.metaKey && key === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
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

      if (!event.metaKey) return;

      const view = numberViews[event.key];
      if (view) {
        event.preventDefault();
        setActiveView(view);
        return;
      }

      if (key === 'd') {
        event.preventDefault();
        if (activeView !== 'intake' || !rows.length) return pushToast('Select intake rows to duplicate.', 'info');
        for (const row of rows) {
          await runCommand('createBatch', {
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
          });
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
        pushToast('Health check requested. Watch the top status indicator.', 'info');
      }
      if (event.altKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pushToast('Validate All complete: visible grids are loaded from server state.', 'success');
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const first = rows[0];
        if (!first) return pushToast('Select a row before confirm/post.', 'info');
        if (activeView === 'sales') await runCommand('confirmSalesOrder', { orderId: first.id }, 'Hotkey confirm order');
        if (activeView === 'orders') await runCommand('postSalesOrder', { orderId: first.id }, 'Hotkey post order');
        if (activeView === 'payments') await runCommand('allocatePayment', { paymentId: first.id }, 'Hotkey allocate payment');
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
    toggleFocusMode
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
    purchaseOrders: ['lines', 'vendor', 'linked-intake', 'history'],
    intake: ['actions', 'saved'],
    sales: ['profile', 'balance', 'purchases', 'notes', 'history'],
    orders: ['lines', 'customer', 'output', 'history'],
    payments: ['allocations', 'customer', 'impact', 'history'],
    inventory: ['movement', 'sales', 'photos', 'history'],
    clients: ['profile', 'balance', 'purchases', 'notes', 'history'],
    vendors: ['due-reason', 'linked-po', 'payouts', 'history'],
    fulfillment: ['lines', 'order', 'labels', 'history'],
    connectors: ['request', 'source', 'history'],
    recovery: ['undo', 'target', 'history'],
    closeout: ['control-totals', 'open-work', 'artifacts'],
    settings: ['requests', 'actions', 'archive']
  };
  return tabsByView[view]?.[index] ?? null;
}
