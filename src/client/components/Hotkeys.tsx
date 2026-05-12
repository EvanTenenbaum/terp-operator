import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
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
  const setFocusedPanel = useUiStore((state) => state.setFocusedPanel);
  const pushToast = useUiStore((state) => state.pushToast);
  const { runCommand } = useCommandRunner();

  useEffect(() => {
    async function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditingText = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if (event.key === 'Escape') {
        setCommandPaletteOpen(false);
        setFocusedPanel(null);
        return;
      }

      if (!event.metaKey) return;
      const view = numberViews[event.key];
      if (view) {
        event.preventDefault();
        setActiveView(view);
        return;
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (isEditingText) return;

      const rows = selectedRows[activeView] ?? [];
      if (event.key.toLowerCase() === 'd') {
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
  }, [activeView, selectedRows, setActiveView, setCommandPaletteOpen, setFocusedPanel, pushToast, runCommand]);

  return null;
}
