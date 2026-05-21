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
  | 'settings';

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
}

export interface HealthStatus {
  ok: boolean;
  database: 'ok' | 'down';
  journal: 'ok' | 'down';
  websocket: 'ok';
  checkedAt: string;
  warnings: string[];
}

export interface KpiMetric {
  key: string;
  label: string;
  value: string;
  definition: string;
  severity: 'good' | 'watch' | 'bad' | 'neutral';
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

export interface CustomerPricingRule {
  default?: PricingRuleEntry;
  categories?: Record<string, PricingRuleEntry>;
}

export type LandedCostBasisName = 'fixed' | 'pick-low' | 'pick-mid' | 'pick-high' | 'manual' | 'override';

export interface PricingRuleApplication {
  basis: PricingBasis;
  amount: number;
  source: 'customer-category' | 'customer-default' | 'settings-category' | 'settings-default' | 'fallback';
  category?: string;
}
