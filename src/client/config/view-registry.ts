/**
 * View Registry — Canonical view declarations.
 *
 * Purpose: Declare every view in the application — its template type, primary
 * entity, data source (tRPC procedure), URL path, title, and which slide-overs
 * are available. Templates consume this registry to know what to render.
 *
 * ARCH-3: One data source per view.
 * UX-3: One primary surface per view.
 *
 * Views import from this config. This config NEVER imports from view files.
 */

import type { ViewKey } from '../../shared/types';

// ─── Architecture Compliance Checklist ──────────────────────────────────────
// [ ] No per-view ColDef arrays — all definitions originate here
// [ ] No inline cell renderers — use stable components
// [ ] No per-view StatusActionTable — state machine governs visibility
// [ ] No direct db queries — all data through tRPC
// [ ] No new Zustand stores — useUiStore only
// ─────────────────────────────────────────────────────────────────────────────

// ─── View template types ────────────────────────────────────────────────────

/**
 * Template type determines the layout shell.
 *
 * - `primaryGrid`: FilterToolbar + SummaryStrip + PrimaryGrid + SlideOver + BulkActionBar
 *     Used for list-style views (PurchaseOrders, Sales, Inventory, etc.)
 * - `masterDetail`: Master list left + detail panel right. Used for Intake, PO lines.
 * - `dashboard`: Multi-zone widget composition. Used for DashboardView only.
 * - `wizard`: Step-by-step flow. Used for Pick, guided workflows.
 * - `report`: Read-only table with export. No cell editing, no bulk actions.
 */
export type ViewTemplate =
  | 'primaryGrid'
  | 'masterDetail'
  | 'dashboard'
  | 'wizard'
  | 'report';

// ─── View entry type ────────────────────────────────────────────────────────

export interface ViewEntry {
  /** View key — must match a value from `src/shared/types.ts` ViewKey. */
  viewKey: ViewKey;
  /** Primary entity driving column definitions and state machine. */
  entity: string;
  /** Template type — determines which layout shell renders. */
  template: ViewTemplate;
  /** tRPC procedure name that serves the primary grid data. */
  primaryProcedure: string;
  /** URL path segment (e.g. '/purchase-orders' for `/app/purchase-orders`). */
  urlPath: string;
  /** Human-readable view title (shown in breadcrumb and document title). */
  title: string;
  /** Slide-over entity types available in this view (empty = no slide-over). */
  allowedSlideOvers: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PurchaseOrdersView (worked example) ────────────────────────────────────

const purchaseOrdersView: ViewEntry = {
  viewKey: 'purchaseOrders',
  entity: 'purchaseOrder',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/purchase-orders',
  title: 'Purchase Orders',
  allowedSlideOvers: [
    'purchaseOrder',   // PO detail (lines, vendor, history tabs)
    'vendor',          // Vendor context
    'intakeBatch',     // Receipt detail (when viewing a received PO's intake)
  ],
};

// ─── SalesView (worked example) ─────────────────────────────────────────────

const salesView: ViewEntry = {
  viewKey: 'sales',
  entity: 'sale',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/sales',
  title: 'Sales',
  allowedSlideOvers: [
    'sale',            // Sales order detail (lines, customer, history tabs)
    'customer',        // Customer context (credit, history, photography)
    'batch',           // Inventory batch detail (from line item)
    'fulfillment',     // Fulfillment status (from order)
  ],
};

// ─── DashboardView ───────────────────────────────────────────────────────────
// TODO: add Dashboard view entry
// const dashboardView: ViewEntry = {
//   viewKey: 'dashboard',
//   entity: 'dashboard',
//   template: 'dashboard',
//   primaryProcedure: 'queries.dashboard',
//   urlPath: '/',
//   title: 'Dashboard',
//   allowedSlideOvers: [],
// };

// ─── IntakeView ──────────────────────────────────────────────────────────────
// TODO: add Intake view entry

// ─── InventoryView ───────────────────────────────────────────────────────────
// TODO: add Inventory view entry

// ─── PaymentsView ────────────────────────────────────────────────────────────
// TODO: add Payments view entry

// ─── VendorsView ─────────────────────────────────────────────────────────────
// TODO: add Vendors view entry

// ─── ClientsView ─────────────────────────────────────────────────────────────
// TODO: add Clients view entry

// ─── CloseoutView ────────────────────────────────────────────────────────────
// TODO: add Closeout view entry

// ─── RecoveryView ────────────────────────────────────────────────────────────
// TODO: add Recovery view entry

// ─── ConnectorsView ──────────────────────────────────────────────────────────
// TODO: add Connectors view entry

// ─── FulfillmentView ─────────────────────────────────────────────────────────
// TODO: add Fulfillment view entry

// ─── MatchmakingView ─────────────────────────────────────────────────────────
// TODO: add Matchmaking view entry

// ─── OrdersView ──────────────────────────────────────────────────────────────
// TODO: add Orders view entry

// ─── RefereesView ────────────────────────────────────────────────────────────
// TODO: add Referees view entry

// ─── ProcessorsView ──────────────────────────────────────────────────────────
// TODO: add Processors view entry

// ─── PhotographyView ─────────────────────────────────────────────────────────
// TODO: add Photography view entry

// ─── PurchaseReceiptsView ────────────────────────────────────────────────────
// TODO: add PurchaseReceipts view entry

// ─── ItemsView ───────────────────────────────────────────────────────────────
// TODO: add Items view entry

// ─── DisputesView ────────────────────────────────────────────────────────────
// TODO: add Disputes view entry

// ─── SettingsView ────────────────────────────────────────────────────────────
// TODO: add Settings view entry

// ─── PickView ────────────────────────────────────────────────────────────────
// TODO: add Pick view entry

// ─── ContactsView ────────────────────────────────────────────────────────────
// TODO: add Contacts view entry

// ─── ReportsView ─────────────────────────────────────────────────────────────
// TODO: add Reports view entry

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW REGISTRY MAP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lookup map from ViewKey → ViewEntry.
 * Templates and routing consume from this map — views never import each other.
 */
export const viewRegistry: Record<ViewKey, ViewEntry> = {
  purchaseOrders: purchaseOrdersView,
  sales: salesView,
  // TODO: add remaining view entries (~25 views)
  dashboard: undefined as unknown as ViewEntry,
  reports: undefined as unknown as ViewEntry,
  intake: undefined as unknown as ViewEntry,
  matchmaking: undefined as unknown as ViewEntry,
  orders: undefined as unknown as ViewEntry,
  payments: undefined as unknown as ViewEntry,
  inventory: undefined as unknown as ViewEntry,
  clients: undefined as unknown as ViewEntry,
  vendors: undefined as unknown as ViewEntry,
  fulfillment: undefined as unknown as ViewEntry,
  connectors: undefined as unknown as ViewEntry,
  recovery: undefined as unknown as ViewEntry,
  closeout: undefined as unknown as ViewEntry,
  referees: undefined as unknown as ViewEntry,
  processors: undefined as unknown as ViewEntry,
  'credit-review': undefined as unknown as ViewEntry,
  photography: undefined as unknown as ViewEntry,
  contacts: undefined as unknown as ViewEntry,
  'contacts-customer-orders': undefined as unknown as ViewEntry,
  settings: undefined as unknown as ViewEntry,
  pick: undefined as unknown as ViewEntry,
  'fulfillment-picks': undefined as unknown as ViewEntry,
  'fulfillment-lines': undefined as unknown as ViewEntry,
  purchaseReceipts: undefined as unknown as ViewEntry,
  items: undefined as unknown as ViewEntry,
  disputes: undefined as unknown as ViewEntry,
};

/**
 * Get a view entry by key. Returns undefined if not yet registered.
 */
export function getViewEntry(key: ViewKey): ViewEntry | undefined {
  return viewRegistry[key];
}

/**
 * Get all registered (non-placeholder) view entries.
 */
export function getRegisteredViews(): ViewEntry[] {
  return Object.values(viewRegistry).filter(
    (v): v is ViewEntry => v !== undefined && typeof v === 'object'
  );
}
