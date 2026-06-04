export type Role = 'owner' | 'manager' | 'operator' | 'viewer';

export type Status =
  | 'draft'
  | 'ready'
  | 'posted'
  | 'needs_fix'
  | 'reversed'
  | 'confirmed'
  | 'reserved'
  | 'fulfilled'
  | 'cancelled'
  | 'open'
  | 'scheduled'
  | 'paid'
  | 'approved'
  | 'accepted'
  | 'ordered'
  | 'planned'
  | 'received'
  | 'partially_received'
  | 'held'
  | 'damaged'
  | 'returned'
  | 'in_transit'
  | 'failed'
  | 'rejected'
  | 'routed'
  | 'matched'
  | 'dismissed'
  | 'watch'
  | 'normal'
  | 'high'
  | 'held_for_match'
  | 'locked'
  | 'archived';

export type OwnershipStatus = 'C' | 'OFC' | 'UNKNOWN';
export type ArrivalStatus = 'pending' | 'arrived' | 'cancelled';
export type QuickLaunchMode = 'sale' | 'purchaseOrder' | 'receiving' | 'moneyIn' | 'moneyOut' | 'customerNeed' | 'vendorSupply';
export type SettingsTab = 'requests' | 'actions' | 'archive' | 'strain-aliases' | 'credit-engine' | 'pricing';

export type PaymentMethod = 'cash' | 'check' | 'card' | 'crypto' | 'wire';

export type DrawerStateName = 'closed' | 'peek' | 'standard' | 'wide' | 'focus';

export interface DrawerEntityRef {
  entityType: string;
  entityId: string | null;
}

export interface DrawerState {
  state: DrawerStateName;
  activeTab: string;
}

export interface RouteHistoryEntry {
  view: ViewKey;
  entityType: string;
  entityId: string | null;
  drawerState: DrawerStateName;
  activeTab: string;
  timestamp: number;
}

export type ViewKey =
  | 'dashboard'
  | 'reports'
  | 'purchaseOrders'
  | 'intake'
  | 'sales'
  | 'matchmaking'
  | 'orders'
  | 'payments'
  | 'inventory'
  | 'clients'
  | 'vendors'
  | 'fulfillment'
  | 'connectors'
  | 'recovery'
  | 'closeout'
  | 'referees'
  | 'processors'
  | 'credit-review'
  | 'photography'
  | 'contacts' // CAP-033 / TER-1564 — entity profiles directory + per-contact view
  | 'contacts-customer-orders' // CAP-029 / TER-1564: order history sub-grid in ContactCustomerPanel
  | 'settings'
  | 'pick'; // CAP-030 / TER-1513

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /**
   * Explicit work-loop assignment (`sales` | `intake` | `warehouse` | `operator`).
   *
   * Set by operators/admins via the user record. When null/undefined, the
   * client falls back to the legacy substring derivation on email/name (see
   * `legacyWorkLoopFromSubstring` in `src/client/accessPolicy.ts`) so users
   * without an explicit backfill don't lose their navigation. New users
   * created post-migration `0044_users_work_loop.sql` should always have this
   * set explicitly.
   */
  workLoop: string | null;
}

export interface CommandResult {
  ok: boolean;
  commandId: string;
  affectedIds: string[];
  toast?: string;
  delta?: Record<string, unknown>;
  /** CAP-030 / TER-1518 — orderId for pick-event routing (set by pick commands). */
  orderId?: string;
  /**
   * TER-1659: non-blocking advisory warnings the UI should surface alongside
   * the success toast (e.g. credit limit exceeded, below-floor pricing).
   * Returning warnings does NOT change `ok` — the command still succeeded.
   */
  warnings?: string[];
}

export interface HealthStatus {
  ok: boolean;
  database: 'ok' | 'down';
  journal: 'ok' | 'down';
  websocket: 'ok' | 'degraded';
  checkedAt: string;
  warnings: string[];
}

export interface KpiMetric {
  key: string;
  label: string;
  value: string;
  definition: string;
  severity: 'good' | 'watch' | 'bad' | 'neutral';
  minRole?: 'manager' | 'owner';  // absent = visible to all roles
}

export interface DashboardData {
  metrics: KpiMetric[];
  pendingQueues: Array<{ key: string; label: string; count: number }>;
  recentActivity: Array<{ id: string; commandName: string; actorName: string; createdAt: string; toast: string | null }>;
  moneyBuckets: Array<{ bucket: string; amount: string; definition: string }>;
  health: HealthStatus;
}

export interface GridRow {
  id: string;
  status?: Status;
  validationIssues?: string[];
  [key: string]: unknown;
}

export type PricingBasis = 'percent' | 'dollar';

export interface PricingRuleEntry {
  basis: PricingBasis;
  amount: number;
}

/**
 * Pricing configuration for a single product category.
 * `rule` applies when the line matches this category but not a specific subcategory.
 * `subcategories` maps subcategory names to their own flat pricing rules.
 * Depth is intentionally two levels: category → subcategory (no deeper nesting).
 */
export interface CategoryPricingEntry {
  rule?: PricingRuleEntry;
  subcategories?: Record<string, PricingRuleEntry>;
}

export interface CustomerPricingRule {
  default?: PricingRuleEntry;
  categories?: Record<string, CategoryPricingEntry>;
}

export type LandedCostBasisName = 'fixed' | 'pick-low' | 'pick-mid' | 'pick-high' | 'manual' | 'override';

export interface PricingRuleApplication {
  basis: PricingBasis;
  amount: number;
  source: 'customer-subcategory' | 'customer-category' | 'customer-default'
        | 'settings-subcategory' | 'settings-category' | 'settings-default' | 'fallback';
  category?: string;
  subcategory?: string;  // populated when source is *-subcategory
}

// ─── Contacts system (CAP-033 / TER-1564) ───────────────────────────────────

export type ContactKind = 'individual' | 'business';
export type ContactRole = 'customer' | 'vendor' | 'referee' | 'processor' | 'contractor' | 'employee';
export type AppointmentType = 'meeting' | 'call' | 'delivery' | 'pickup' | 'vacation' | 'job' | 'other';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';
export type PreferredContactMethod = 'email' | 'phone' | 'text' | 'any';

export interface Contact {
  id: string;
  name: string;
  displayName: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  email: string | null;
  address: string | null;
  companyName: string | null;
  contactKind: ContactKind;
  preferredContactMethod: PreferredContactMethod;
  notes: string | null;
  tags: string[];
  isCustomer: boolean;
  isVendor: boolean;
  isReferee: boolean;
  isProcessor: boolean;
  isContractor: boolean;
  isEmployee: boolean;
  active: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  archivedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  contactId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  location: string | null;
  createdBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactLedgerEntry {
  id: string;
  contactId: string;
  kind: string;
  amount: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  commandId: string | null;
  createdAt: string;
  /** Computed at read time via SUM(amount) OVER window; not stored. */
  runningBalance?: string;
}

export interface ContactMergeCandidate {
  id: string;
  contactAId: string;
  contactBId: string;
  matchReason: 'name_match' | 'email_match' | string;
  reviewed: boolean;
  dismissed: boolean;
  mergedInto: string | null;
  createdAt: string;
}
