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
  /** Optional filter preset buttons shown in the FilterToolbar. */
  filterPresets?: { key: string; label: string; filter: Record<string, unknown> }[];
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
  filterPresets: [
    { key: 'active', label: 'Active', filter: { status: ['draft', 'finalized', 'approved', 'ordered', 'partially_received'] } },
    { key: 'ordered', label: 'Ordered', filter: { status: ['ordered', 'partially_received'] } },
    { key: 'finalized', label: 'Finalized', filter: { status: ['finalized', 'approved'] } },
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

const dashboardView: ViewEntry = {
  viewKey: 'dashboard',
  entity: '',
  template: 'dashboard',
  primaryProcedure: 'queries.dashboard',
  urlPath: '/',
  title: 'Dashboard',
  allowedSlideOvers: [],
};

// ─── ReportsView ─────────────────────────────────────────────────────────────

const reportsView: ViewEntry = {
  viewKey: 'reports',
  entity: '',
  template: 'report',
  primaryProcedure: 'queries.reports',
  urlPath: '/reports',
  title: 'Reports',
  allowedSlideOvers: [],
};

// ─── IntakeView ──────────────────────────────────────────────────────────────

const intakeView: ViewEntry = {
  viewKey: 'intake',
  entity: 'batch',
  template: 'masterDetail',
  primaryProcedure: 'queries.grid',
  urlPath: '/intake',
  title: 'Intake',
  allowedSlideOvers: ['batch', 'item', 'vendor'],
};

// ─── MatchmakingView ─────────────────────────────────────────────────────────

const matchmakingView: ViewEntry = {
  viewKey: 'matchmaking',
  entity: 'matchmakingMatch',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/matchmaking',
  title: 'Matchmaking',
  allowedSlideOvers: ['matchmakingMatch', 'sale', 'purchaseOrder'],
};

// ─── OrdersView ──────────────────────────────────────────────────────────────

const ordersView: ViewEntry = {
  viewKey: 'orders',
  entity: 'sale',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/orders',
  title: 'Orders',
  allowedSlideOvers: ['sale', 'customer'],
};

// ─── PaymentsView ────────────────────────────────────────────────────────────

const paymentsView: ViewEntry = {
  viewKey: 'payments',
  entity: 'payment',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/payments',
  title: 'Payments',
  allowedSlideOvers: ['payment', 'invoice', 'customer'],
};

// ─── InventoryView ───────────────────────────────────────────────────────────

const inventoryView: ViewEntry = {
  viewKey: 'inventory',
  entity: 'batch',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/inventory',
  title: 'Inventory',
  allowedSlideOvers: ['batch', 'item'],
};

// ─── ClientsView ─────────────────────────────────────────────────────────────

const clientsView: ViewEntry = {
  viewKey: 'clients',
  entity: 'customer',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/customers',
  title: 'Customers',
  allowedSlideOvers: ['customer', 'sale'],
};

// ─── VendorsView ─────────────────────────────────────────────────────────────

const vendorsView: ViewEntry = {
  viewKey: 'vendors',
  entity: 'vendor',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/vendors',
  title: 'Vendors',
  allowedSlideOvers: ['vendor', 'purchaseOrder'],
};

// ─── FulfillmentView ─────────────────────────────────────────────────────────

const fulfillmentView: ViewEntry = {
  viewKey: 'fulfillment',
  entity: 'fulfillmentLine',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/fulfillment',
  title: 'Fulfillment',
  allowedSlideOvers: ['fulfillmentLine', 'sale', 'pickList'],
};

// ─── ConnectorsView ──────────────────────────────────────────────────────────

const connectorsView: ViewEntry = {
  viewKey: 'connectors',
  entity: 'connectorRequest',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/connector-requests',
  title: 'Connector Requests',
  allowedSlideOvers: ['connectorRequest'],
};

// ─── RecoveryView ────────────────────────────────────────────────────────────

const recoveryView: ViewEntry = {
  viewKey: 'recovery',
  entity: 'correctionJournalEntry',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/correction-journal',
  title: 'Correction Journal',
  allowedSlideOvers: ['correctionJournalEntry'],
};

// ─── CloseoutView ────────────────────────────────────────────────────────────

const closeoutView: ViewEntry = {
  viewKey: 'closeout',
  entity: '',
  template: 'report',
  primaryProcedure: 'queries.closeout',
  urlPath: '/closeout',
  title: 'Period Closeout',
  allowedSlideOvers: [],
};

// ─── RefereesView ────────────────────────────────────────────────────────────

const refereesView: ViewEntry = {
  viewKey: 'referees',
  entity: 'refereeCredit',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/referee-credits',
  title: 'Referee Credits',
  allowedSlideOvers: ['refereeCredit'],
};

// ─── ProcessorsView ──────────────────────────────────────────────────────────

const processorsView: ViewEntry = {
  viewKey: 'processors',
  entity: 'user',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/staff',
  title: 'Staff',
  allowedSlideOvers: ['user'],
};

// ─── CreditReviewView ────────────────────────────────────────────────────────

const creditReviewView: ViewEntry = {
  viewKey: 'credit-review',
  entity: 'invoiceDispute',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/credit-review',
  title: 'Credit Review',
  allowedSlideOvers: ['invoiceDispute', 'invoice', 'customer'],
};

// ─── PhotographyView ─────────────────────────────────────────────────────────

const photographyView: ViewEntry = {
  viewKey: 'photography',
  entity: 'photographyQueue',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/photography-queue',
  title: 'Photography Queue',
  allowedSlideOvers: ['photographyQueue', 'batch'],
};

// ─── ContactsView ────────────────────────────────────────────────────────────

const contactsView: ViewEntry = {
  viewKey: 'contacts',
  entity: 'customer',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/contacts',
  title: 'Contacts',
  allowedSlideOvers: ['customer', 'sale'],
};

// ─── ContactsCustomerOrdersView ──────────────────────────────────────────────

const contactsCustomerOrdersView: ViewEntry = {
  viewKey: 'contacts-customer-orders',
  entity: 'sale',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/contacts/customer-orders',
  title: 'Customer Orders',
  allowedSlideOvers: ['sale'],
};

// ─── SettingsView ────────────────────────────────────────────────────────────

const settingsView: ViewEntry = {
  viewKey: 'settings',
  entity: '',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/settings',
  title: 'Settings',
  allowedSlideOvers: [],
};

// ─── PickView ────────────────────────────────────────────────────────────────

const pickView: ViewEntry = {
  viewKey: 'pick',
  entity: 'pickList',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/pick-lists',
  title: 'Pick Lists',
  allowedSlideOvers: ['pickList', 'fulfillmentLine', 'sale'],
};

// ─── FulfillmentPicksView ────────────────────────────────────────────────────

const fulfillmentPicksView: ViewEntry = {
  viewKey: 'fulfillment-picks',
  entity: 'pickList',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/fulfillment/picks',
  title: 'Fulfillment Picks',
  allowedSlideOvers: ['pickList'],
};

// ─── FulfillmentLinesView ────────────────────────────────────────────────────

const fulfillmentLinesView: ViewEntry = {
  viewKey: 'fulfillment-lines',
  entity: 'fulfillmentLine',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/fulfillment/lines',
  title: 'Fulfillment Lines',
  allowedSlideOvers: ['fulfillmentLine', 'sale'],
};

// ─── PurchaseReceiptsView ────────────────────────────────────────────────────

const purchaseReceiptsView: ViewEntry = {
  viewKey: 'purchaseReceipts',
  entity: 'purchaseReceipt',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/purchase-receipts',
  title: 'Purchase Receipts',
  allowedSlideOvers: ['purchaseReceipt', 'purchaseOrder', 'vendor'],
};

// ─── ItemsView ───────────────────────────────────────────────────────────────

const itemsView: ViewEntry = {
  viewKey: 'items',
  entity: 'item',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/items',
  title: 'Items',
  allowedSlideOvers: ['item'],
};

// ─── DisputesView ────────────────────────────────────────────────────────────

const disputesView: ViewEntry = {
  viewKey: 'disputes',
  entity: 'invoiceDispute',
  template: 'primaryGrid',
  primaryProcedure: 'queries.grid',
  urlPath: '/invoice-disputes',
  title: 'Invoice Disputes',
  allowedSlideOvers: ['invoiceDispute', 'invoice', 'customer'],
};

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
  dashboard: dashboardView,
  reports: reportsView,
  intake: intakeView,
  matchmaking: matchmakingView,
  orders: ordersView,
  payments: paymentsView,
  inventory: inventoryView,
  clients: clientsView,
  vendors: vendorsView,
  fulfillment: fulfillmentView,
  connectors: connectorsView,
  recovery: recoveryView,
  closeout: closeoutView,
  referees: refereesView,
  processors: processorsView,
  'credit-review': creditReviewView,
  photography: photographyView,
  contacts: contactsView,
  'contacts-customer-orders': contactsCustomerOrdersView,
  settings: settingsView,
  pick: pickView,
  'fulfillment-picks': fulfillmentPicksView,
  'fulfillment-lines': fulfillmentLinesView,
  purchaseReceipts: purchaseReceiptsView,
  items: itemsView,
  disputes: disputesView,
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
