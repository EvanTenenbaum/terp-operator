export type Role = 'owner' | 'manager' | 'operator' | 'viewer';

export type Status =
  | 'draft'
  | 'ready'
  | 'posted'
  | 'needs_fix'
  | 'reversed'
  | 'confirmed'
  | 'fulfilled'
  | 'cancelled'
  | 'open'
  | 'scheduled'
  | 'paid'
  | 'approved'
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
  | 'locked'
  | 'archived';

export type OwnershipStatus = 'C' | 'OFC' | 'UNKNOWN';
export type ArrivalStatus = 'pending' | 'arrived' | 'cancelled';
export type QuickLaunchMode = 'sale' | 'purchaseOrder' | 'receiving' | 'moneyIn' | 'moneyOut';
export type SettingsTab = 'requests' | 'actions' | 'archive';

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
  | 'orders'
  | 'payments'
  | 'inventory'
  | 'clients'
  | 'vendors'
  | 'fulfillment'
  | 'connectors'
  | 'recovery'
  | 'closeout'
  | 'settings';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
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
