import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import clsx from 'clsx';
import { trpc } from './api/trpc';
import { Agentation } from 'agentation';
import { CommandPalette } from './components/CommandPalette';
import { ContextDrawer } from './components/ContextDrawer';
import { Hotkeys } from './components/Hotkeys';
import { IdentityRibbon } from './components/IdentityRibbon';
import { ReportsRouteShell } from './components/ReportsRouteShell';
import { Keel, SideNav } from './components/Shell';
import { ToastCenter } from './components/ToastCenter';
import { useUiStore } from './store/uiStore';
import { DashboardView } from './views/DashboardView';
import { IntakeView } from './views/IntakeView';
import { LoginView } from './views/LoginView';
import { MatchmakingView } from './views/MatchmakingView';
import { SalesView } from './views/SalesView';
import {
  ClientLedgerView,
  CloseoutView,
  ConnectorsView,
  FulfillmentView,
  InventoryView,
  OrdersView,
  PaymentsView,
  PurchaseOrdersView,
  RecoveryView,
  SettingsView,
  VendorPayablesView
} from './views/OperationsViews';

export function App() {
  const me = trpc.auth.me.useQuery();
  const activeView = useUiStore((state) => state.activeView);
  const focusedPanelId = useUiStore((state) => state.focusedPanelId);
  const focusMode = useUiStore((state) => state.focusMode);
  const pushToast = useUiStore((state) => state.pushToast);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!me.data) return;
    const currentUserId = me.data.id;
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? '/', { withCredentials: true });
    socket.on('command:completed', (event: { toast?: string; actorId?: string }) => {
      if (event.toast && event.actorId !== currentUserId) pushToast(event.toast, 'success');
      queryClient.invalidateQueries();
    });
    socket.on('command:failed', (event: { toast?: string; actorId?: string }) => {
      if (event.toast && event.actorId !== currentUserId) pushToast(event.toast, 'error');
      queryClient.invalidateQueries();
    });
    return () => {
      socket.close();
    };
  }, [me.data, pushToast, queryClient]);

  if (me.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-panel text-sm text-zinc-600">Loading TERP Agro...</div>;
  }

  if (!me.data) return <LoginView />;

  return (
    <div className="flex h-screen overflow-hidden bg-white text-ink">
      <SideNav user={me.data} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Keel user={me.data} />
        <IdentityRibbon />
        <div className={clsx('canvas-shell', (focusedPanelId || focusMode) && 'canvas-shell-focus')}>
          <main className={clsx('min-h-0 flex-1 overflow-auto', focusedPanelId || focusMode ? 'p-2' : 'p-4')}>
            {activeView === 'dashboard' ? <DashboardView /> : null}
            {activeView === 'reports' ? <ReportsRouteShell /> : null}
            {activeView === 'purchaseOrders' ? <PurchaseOrdersView /> : null}
            {activeView === 'intake' ? <IntakeView /> : null}
            {activeView === 'sales' ? <SalesView /> : null}
            {activeView === 'matchmaking' ? <MatchmakingView /> : null}
            {activeView === 'orders' ? <OrdersView /> : null}
            {activeView === 'payments' ? <PaymentsView /> : null}
            {activeView === 'inventory' ? <InventoryView /> : null}
            {activeView === 'clients' ? <ClientLedgerView /> : null}
            {activeView === 'vendors' ? <VendorPayablesView /> : null}
            {activeView === 'fulfillment' ? <FulfillmentView /> : null}
            {activeView === 'connectors' ? <ConnectorsView /> : null}
            {activeView === 'recovery' ? <RecoveryView /> : null}
            {activeView === 'closeout' ? <CloseoutView /> : null}
            {activeView === 'settings' ? <SettingsView /> : null}
          </main>
          <ContextDrawer />
        </div>
      </div>
      <Hotkeys />
      <CommandPalette />
      <ToastCenter />
      {import.meta.env.DEV && (
        <Agentation
          onCopy={(markdown) => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(markdown).catch(() => {
                fallbackCopy(markdown);
              });
            } else {
              fallbackCopy(markdown);
            }
            function fallbackCopy(text: string) {
              const ta = document.createElement('textarea');
              ta.value = text;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.select();
              try { document.execCommand('copy'); } catch {}
              document.body.removeChild(ta);
            }
          }}
        />
      )}
    </div>
  );
}
