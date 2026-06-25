import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { trpc } from './api/trpc';
import { Agentation } from 'agentation';
import { CommandPalette } from './components/CommandPalette';
import { ContextDrawer } from './components/ContextDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfirmRoot } from './components/ConfirmRoot';
import { FeedbackCapture } from './components/FeedbackCapture';
import { Hotkeys } from './components/Hotkeys';
import { IdentityRibbon } from './components/IdentityRibbon';
import { ReportsRouteShell } from './components/ReportsRouteShell';
import { Keel, SideNav } from './components/Shell';
import { ToastCenter } from './components/ToastCenter';
import { useUiStore } from './store/uiStore';
import { CONNECTOR_SURFACES_ENABLED } from './featureFlags';
import { SocketProvider } from './context/SocketContext';
import { DashboardView } from './templates/DashboardView';
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
  InvoiceDisputesView,
  OrdersView,
  PaymentsView,
  PurchaseOrdersView,
  PurchaseReceiptsView,
  RecoveryView,
  SettingsView,
  VendorPayablesView
} from './views/OperationsViews';
import { RefereesView } from './views/RefereesView';
import { ProcessorsView } from './views/ProcessorsView';
import { ItemsView } from './views/ItemsView';
import { CreditReviewView } from './views/CreditReviewView';
import { MediaView } from './views/MediaView';
import { PickView } from './views/PickView';
import { MediaUploadMobileRoute } from './components/MediaUploadMobile';
import { ContactsView } from './views/ContactsView';
import { ContactProfileView } from './views/ContactProfileView';
// BE-014 / TER-1591 DEFERRED: MergeCandidatesView route is temporarily
// redirected to /contacts (see route table below). Import is preserved so
// the component is wired and ready when BE-014 ships — tree-shaking will
// exclude it until the route is activated. Suppress the unused-import lint.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { MergeCandidatesView } from './views/MergeCandidatesView';
import { MobileShell } from './components/mobile/MobileShell';
import { MobileDashboardView } from './views/mobile/MobileDashboardView';
import { MobileInventoryView } from './views/mobile/MobileInventoryView';
import { MobileCatalogView } from './views/mobile/MobileCatalogView';
import { MobilePaymentsView } from './views/mobile/MobilePaymentsView';
import { MobileContactsView } from './views/mobile/MobileContactsView';
import { MobileContactProfileView } from './views/mobile/MobileContactProfileView';
// UX-L01/R01: PickView mounts inside the mobile shell at /mobile/pick
// UX-R02: minimal /mobile/intake — verify + flag only
import { MobileIntakeView } from './views/mobile/MobileIntakeView';

// Phase 0b — CAP-007 / CAP-008 canvas grammar feature flag.
// Default: enabled. Set VITE_CANVAS_GRAMMAR_ENABLED=false to revert to pre-canvas shell.
const CANVAS_GRAMMAR_ENABLED = import.meta.env.VITE_CANVAS_GRAMMAR_ENABLED !== 'false';

// TER-1664 / UX-A12 (Execution Decision 4): connector/processor surfaces are
// MVP-out. While CONNECTOR_SURFACES_ENABLED is false, direct visits to
// /connectors and /processors land on Settings → Requests — the canonical
// home for connector-request review. ConnectorsView / ProcessorsView stay
// imported and route-ready so flipping the flag restores both lanes.
function SettingsRequestsRedirect() {
  const navigate = useNavigate();
  const setActiveSettingsTab = useUiStore((state) => state.setActiveSettingsTab);
  useEffect(() => {
    setActiveSettingsTab('requests');
    navigate('/settings', { replace: true });
  }, [navigate, setActiveSettingsTab]);
  return null;
}

// Sync URL with activeView state.
// Nested routes intentionally use the first path segment as activeView
// (e.g. /photography/mobile/:batchId -> photography).
function LocationSync() {
  const location = useLocation();
  const setActiveView = useUiStore((state) => state.setActiveView);

  useEffect(() => {
    const path = location.pathname.slice(1).split('/')[0] || 'dashboard';
    setActiveView(path as import('../shared/types').ViewKey);
  }, [location, setActiveView]);

  return null;
}

function AppContent() {
  const me = trpc.auth.me.useQuery();
  const focusedPanelId = useUiStore((state) => state.focusedPanelId);
  const focusMode = useUiStore((state) => state.focusMode);
  const navigate = useNavigate();
  const prevMeData = useRef(me.data);

  // UX-R04: Auto-redirect mobile viewports to the mobile shell.
  // Maps desktop routes to mobile equivalents before falling back to /mobile/dashboard.
  // Skipped if user has explicitly chosen desktop (localStorage flag).
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.innerWidth < 768 &&
      !localStorage.getItem('terp-prefer-desktop')
    ) {
      // UX-R04: map desktop → mobile equivalents where they exist
      const DESKTOP_TO_MOBILE: Record<string, string> = {
        payments: '/mobile/payments',
        inventory: '/mobile/inventory',
        pick: '/mobile/pick',
        intake: '/mobile/intake',
        catalog: '/mobile/catalog',
      };
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/mobile')) return;
      const firstSegment = currentPath.slice(1).split('/')[0] ?? '';
      // contacts/:id → /mobile/contacts/:id
      if (firstSegment === 'contacts') {
        const rest = currentPath.slice('/contacts'.length);
        navigate('/mobile/contacts' + rest, { replace: true });
        return;
      }
      const mobileTarget = DESKTOP_TO_MOBILE[firstSegment];
      navigate(mobileTarget ?? '/mobile/dashboard', { replace: true });
    }
    // Mount-only: redirect mobile users once on initial load
  }, []);

  // SX-J09 / SX-K05: After login, redirect to the correct view.
  // The <Navigate> inside Routes and the mobile-redirect useEffect (empty deps)
  // may not fire correctly during the login transition.
  useEffect(() => {
    if (me.data && !prevMeData.current) {
      const path = window.location.pathname;
      const isMobile =
        typeof window !== 'undefined' &&
        window.innerWidth < 768 &&
        !localStorage.getItem('terp-prefer-desktop');

      // Desktop/mobile at / → dashboard
      if (path === '/') {
        navigate(isMobile ? '/mobile/dashboard' : '/dashboard', { replace: true });
        prevMeData.current = me.data;
        return;
      }

      // SX-K05: Mobile viewport at a desktop path — apply mobile redirect
      if (isMobile && !path.startsWith('/mobile')) {
        const DESKTOP_TO_MOBILE: Record<string, string> = {
          payments: '/mobile/payments',
          inventory: '/mobile/inventory',
          pick: '/mobile/pick',
          intake: '/mobile/intake',
          catalog: '/mobile/catalog',
        };
        const firstSegment = path.slice(1).split('/')[0] ?? '';
        if (firstSegment === 'contacts') {
          const rest = path.slice('/contacts'.length);
          navigate('/mobile/contacts' + rest, { replace: true });
        } else {
          navigate(DESKTOP_TO_MOBILE[firstSegment] ?? '/mobile/dashboard', { replace: true });
        }
      }
    }
    prevMeData.current = me.data;
  }, [me.data, navigate]);

  if (me.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-panel text-sm text-zinc-600">Loading TERP Operator...</div>;
  }

  if (!me.data) return <LoginView />;

  // Show a top banner when the server becomes unreachable after login.
  // failureCount > 0 avoids flicker on the first background refetch failure.
  const isServerUnreachable = me.isError && me.failureCount > 0;

  return (
    // GH #329: SocketProvider manages the socket.io connection, all event handlers,
    // and exposes subscribeOrder/unsubscribeOrder so views can join per-order rooms.
    <SocketProvider>
      <div className="flex h-screen overflow-hidden bg-white text-ink">
        {isServerUnreachable && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-xs text-center py-1.5">
            Connection lost — changes may not save.{' '}
            <button className="underline ml-2" onClick={() => me.refetch()}>Reconnect</button>
          </div>
        )}
        <LocationSync />
        <SideNav user={me.data} />
        <div className="flex min-w-0 flex-1 flex-col">
          {CANVAS_GRAMMAR_ENABLED && <Keel user={me.data} />}
          {CANVAS_GRAMMAR_ENABLED && <IdentityRibbon />}
          <div className={clsx(CANVAS_GRAMMAR_ENABLED && 'canvas-shell', CANVAS_GRAMMAR_ENABLED && (focusedPanelId || focusMode) && 'canvas-shell-focus')}>
            <main className={clsx('min-h-0 flex-1 overflow-auto', CANVAS_GRAMMAR_ENABLED && (focusedPanelId || focusMode) ? 'p-2' : 'p-4')}>
              <Outlet />
            </main>
            {CANVAS_GRAMMAR_ENABLED && <ContextDrawer />}
          </div>
        </div>
        <Hotkeys />
        <CommandPalette />
        <ToastCenter />
        <ConfirmRoot />
        <FeedbackCapture />
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
      </div>
    </SocketProvider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Mobile shell — no SideNav, no Keel, handles its own auth */}
          <Route path="/mobile/*" element={<MobileShell />}>
            <Route path="dashboard" element={<MobileDashboardView />} />
            <Route path="inventory" element={<MobileInventoryView />} />
            <Route path="catalog"   element={<MobileCatalogView />} />
            <Route path="payments"  element={<MobilePaymentsView />} />
            <Route path="contacts"  element={<MobileContactsView />} />
            <Route path="contacts/:id" element={<MobileContactProfileView />} />
            {/* UX-L01/R01: pick flow mounted in mobile shell — warehouse operator tab */}
            <Route path="pick"      element={<PickView />} />
            {/* UX-R02: minimal intake verify + flag only */}
            <Route path="intake"    element={<MobileIntakeView />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>
          {/* Desktop layout route — AppContent wraps all desktop views via Outlet */}
          {/* path="/*" gives children a splat context: splat="dashboard" matches child path="dashboard" */}
          <Route path="/*" element={<AppContent />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardView />} />
            <Route path="reports" element={<ReportsRouteShell />} />
            <Route path="purchaseOrders" element={<PurchaseOrdersView />} />
            <Route path="purchaseReceipts" element={<PurchaseReceiptsView />} />
            <Route path="intake" element={<IntakeView />} />
            <Route path="sales" element={<SalesView />} />
            <Route path="matchmaking" element={<MatchmakingView />} />
            <Route path="orders" element={<OrdersView />} />
            <Route path="payments" element={<PaymentsView />} />
            <Route path="inventory" element={<InventoryView />} />
            <Route path="clients" element={<ClientLedgerView />} />
            <Route path="vendors" element={<VendorPayablesView />} />
            <Route path="fulfillment" element={<FulfillmentView />} />
            {/* TER-1664 / UX-A12: flagged-off connector surface → Settings → Requests */}
            <Route path="connectors" element={CONNECTOR_SURFACES_ENABLED ? <ConnectorsView /> : <SettingsRequestsRedirect />} />
            <Route path="recovery" element={<RecoveryView />} />
            <Route path="closeout" element={<CloseoutView />} />
            <Route path="referees" element={<RefereesView />} />
            {/* TER-1664 / UX-A12: flagged-off processor surface → Settings → Requests */}
            <Route path="processors" element={CONNECTOR_SURFACES_ENABLED ? <ProcessorsView /> : <SettingsRequestsRedirect />} />
            <Route path="items" element={<ItemsView />} />
            <Route path="disputes" element={<InvoiceDisputesView />} />
            <Route path="credit-review" element={<CreditReviewView />} />
            <Route path="photography" element={<MediaView />} />
            <Route path="photography/mobile/:batchId" element={<MediaUploadMobileRoute />} />
            <Route path="pick" element={<PickView />} />
            <Route path="contacts" element={<ContactsView />} />
            {/*
              BE-014 / TER-1591 DEFERRED: The contact deduplication detection
              job that populates contact_merge_candidates has not shipped.
              Redirect direct URL visits back to /contacts so the surface
              is not reachable while the signal can never fire.  When BE-014
              lands, replace this Navigate with the real MergeCandidatesView
              route (component is preserved and ready — see MergeCandidatesView.tsx).
              See UX-A06 / Execution Decision 5.
            */}
            <Route path="contacts/merge-candidates" element={<Navigate to="/contacts" replace />} />
            <Route path="contacts/:id" element={<ContactProfileView />} />
            <Route path="settings" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
