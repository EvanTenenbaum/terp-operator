import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import clsx from 'clsx';
import { trpc } from './api/trpc';
import { Agentation } from 'agentation';
import { invalidateAffectedQueries } from './components/useCommandRunner';
import { CommandPalette } from './components/CommandPalette';
import { GlobalFinderPanel } from './components/GlobalFinderPanel';
import { ContextDrawer } from './components/ContextDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
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
import { RefereesView } from './views/RefereesView';
import { ProcessorsView } from './views/ProcessorsView';
import { CreditReviewView } from './views/CreditReviewView';
import { MediaView } from './views/MediaView';
import { PickView } from './views/PickView';
import { MediaUploadMobileRoute } from './components/MediaUploadMobile';
import { ContactsView } from './views/ContactsView';
import { ContactProfileView } from './views/ContactProfileView';

// Phase 0b — CAP-007 / CAP-008 canvas grammar feature flag.
// Default: enabled. Set VITE_CANVAS_GRAMMAR_ENABLED=false to revert to pre-canvas shell.
const CANVAS_GRAMMAR_ENABLED = import.meta.env.VITE_CANVAS_GRAMMAR_ENABLED !== 'false';

// Sync URL with activeView state.
// Nested routes intentionally use the first path segment as activeView
// (e.g. /photography/mobile/:batchId -> photography).
function LocationSync() {
  const location = useLocation();
  const setActiveView = useUiStore((state) => state.setActiveView);

  useEffect(() => {
    const path = location.pathname.slice(1).split('/')[0] || 'dashboard';
    setActiveView(path as any);
  }, [location, setActiveView]);

  return null;
}

function AppContent() {
  const me = trpc.auth.me.useQuery();
  const focusedPanelId = useUiStore((state) => state.focusedPanelId);
  const focusMode = useUiStore((state) => state.focusMode);
  const pushToast = useUiStore((state) => state.pushToast);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!me.data) return;
    const currentUserId = me.data.id;
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? '/', { withCredentials: true });
    socket.on('command:completed', (event: { toast?: string; actorId?: string; affectedIds?: string[] }) => {
      if (event.toast && event.actorId !== currentUserId) pushToast(event.toast, 'success');
      // Cross-tab targeted invalidation — see #44. The WS payload already
      // carries the affectedIds the originating command reported, so we can
      // refetch only the queries that reference those entities.
      void invalidateAffectedQueries(queryClient, event.affectedIds ?? []);
    });
    socket.on('command:failed', (event: { toast?: string; actorId?: string; affectedIds?: string[] }) => {
      if (event.toast && event.actorId !== currentUserId) pushToast(event.toast, 'error');
      void invalidateAffectedQueries(queryClient, event.affectedIds ?? []);
    });

    // CAP-030 / TER-1518 — pick-specific event channels.
    // pick:queue fires when the queue roster changes (release / recall).
    // pick:order:{orderId} fires when a specific order's pick state changes.
    // If socket is unavailable, react-query's refetch intervals cover updates.
    socket.on('pick:queue', () => {
      void queryClient.invalidateQueries({
        predicate: (query) => JSON.stringify(query.queryKey).includes('pickQueue')
      });
    });
    socket.onAny((event: string) => {
      if (event.startsWith('pick:order:')) {
        const orderId = event.slice('pick:order:'.length);
        if (orderId) void invalidateAffectedQueries(queryClient, [orderId]);
      }
    });

    return () => {
      socket.close();
    };
  }, [me.data, pushToast, queryClient]);

  if (me.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-panel text-sm text-zinc-600">Loading TERP Operator...</div>;
  }

  if (!me.data) return <LoginView />;

  return (
    <div className="flex h-screen overflow-hidden bg-white text-ink">
      <LocationSync />
      <SideNav user={me.data} />
      <div className="flex min-w-0 flex-1 flex-col">
        {CANVAS_GRAMMAR_ENABLED && <Keel user={me.data} />}
        {CANVAS_GRAMMAR_ENABLED && <IdentityRibbon />}
        <div className={clsx(CANVAS_GRAMMAR_ENABLED && 'canvas-shell', CANVAS_GRAMMAR_ENABLED && (focusedPanelId || focusMode) && 'canvas-shell-focus')}>
          <main className={clsx('min-h-0 flex-1 overflow-auto', CANVAS_GRAMMAR_ENABLED && (focusedPanelId || focusMode) ? 'p-2' : 'p-4')}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardView />} />
              <Route path="/reports" element={<ReportsRouteShell />} />
              <Route path="/purchaseOrders" element={<PurchaseOrdersView />} />
              <Route path="/intake" element={<IntakeView />} />
              <Route path="/sales" element={<SalesView />} />
              <Route path="/matchmaking" element={<MatchmakingView />} />
              <Route path="/orders" element={<OrdersView />} />
              <Route path="/payments" element={<PaymentsView />} />
              <Route path="/inventory" element={<InventoryView />} />
              <Route path="/clients" element={<ClientLedgerView />} />
              <Route path="/vendors" element={<VendorPayablesView />} />
              <Route path="/fulfillment" element={<FulfillmentView />} />
              <Route path="/connectors" element={<ConnectorsView />} />
              <Route path="/recovery" element={<RecoveryView />} />
              <Route path="/closeout" element={<CloseoutView />} />
              <Route path="/referees" element={<RefereesView />} />
              <Route path="/processors" element={<ProcessorsView />} />
              <Route path="/credit-review" element={<CreditReviewView />} />
              <Route path="/photography" element={<MediaView />} />
              <Route path="/photography/mobile/:batchId" element={<MediaUploadMobileRoute />} />
              {/* CAP-030 / TER-1503: warehouse pick queue (work-loop gated inside the view) */}
              <Route path="/pick" element={<PickView />} />
              <Route path="/contacts" element={<ContactsView />} />
              <Route path="/contacts/:id" element={<ContactProfileView />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
          {CANVAS_GRAMMAR_ENABLED && <ContextDrawer />}
        </div>
      </div>
      <Hotkeys />
      <CommandPalette />
      <GlobalFinderPanel />
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

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
