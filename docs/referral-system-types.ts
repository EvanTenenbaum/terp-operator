// TypeScript type definitions for Referee Credit System
// Location: src/shared/types.ts (additions) and src/server/schema.ts (Drizzle schema)

// =============================================================================
// Shared Types (src/shared/types.ts additions)
// =============================================================================

export type RefereeEntityType = 'customer' | 'vendor';
export type RefereeFeeType = 'percentage' | 'fixed' | 'hybrid';
export type RefereeTransactionType = 'purchase_order' | 'sales_order';
export type RefereeCreditStatus = 'accrued' | 'paid' | 'voided';

export interface Referee {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  balance: string; // numeric as string for precision
  lifetimeEarned: string;
  paymentMethod: string;
  paymentDetails: string | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefereeRelationship {
  id: string;
  refereeId: string;
  entityType: RefereeEntityType;
  entityId: string;
  feeType: RefereeFeeType;
  feePercentage: string | null;
  feeFixedAmount: string | null;
  applyByDefault: boolean;
  active: boolean;
  notes: string | null;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefereeCredit {
  id: string;
  refereeId: string;
  refereeRelationshipId: string;
  transactionType: RefereeTransactionType;
  transactionId: string;
  transactionNo: string;
  transactionTotal: string;
  feeType: RefereeFeeType;
  feePercentage: string | null;
  feeFixedAmount: string | null;
  creditAmount: string;
  status: RefereeCreditStatus;
  paidViaTransactionId: string | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  voidedReason: string | null;
  commandId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Extended types with joined data for UI display
export interface RefereeWithStats extends Referee {
  activeRelationships: number;
  unpaidCredits: number;
  lastPayoutDate: Date | null;
}

export interface RefereeRelationshipWithDetails extends RefereeRelationship {
  refereeName: string;
  entityName: string;
  creditsGenerated: string; // total credits from this relationship
}

export interface RefereeCreditWithDetails extends RefereeCredit {
  refereeName: string;
  entityName: string;
  entityType: RefereeEntityType;
}

// =============================================================================
// Command Payload Types (src/shared/commandCatalog.ts additions)
// =============================================================================

export interface CreateRefereePayload {
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  paymentMethod?: string;
  paymentDetails?: string;
  notes?: string;
}

export interface UpdateRefereePayload {
  refereeId: string;
  name?: string;
  email?: string;
  phone?: string;
  taxId?: string;
  paymentMethod?: string;
  paymentDetails?: string;
  notes?: string;
  active?: boolean;
}

export interface AddRefereeRelationshipPayload {
  refereeId: string;
  entityType: RefereeEntityType;
  entityId: string;
  feeType: RefereeFeeType;
  feePercentage?: number; // percentage value (5.00 for 5%)
  feeFixedAmount?: number;
  applyByDefault?: boolean;
  notes?: string;
  effectiveFrom?: string; // ISO date string
}

export interface UpdateRefereeRelationshipPayload {
  relationshipId: string;
  feeType?: RefereeFeeType;
  feePercentage?: number;
  feeFixedAmount?: number;
  applyByDefault?: boolean;
  notes?: string;
  active?: boolean;
  effectiveUntil?: string;
}

export interface DeactivateRefereeRelationshipPayload {
  relationshipId: string;
}

export interface VoidRefereeCreditPayload {
  creditId: string;
  reason: string;
}

// Modified existing command payloads to include referee fields
export interface PostPurchaseOrderPayloadExtended {
  // ... existing PO fields ...
  refereeRelationshipId?: string; // optional - only if checkbox checked
  logRefereeCredit?: boolean; // whether to create credit
}

export interface ConfirmSalesOrderPayloadExtended {
  // ... existing sales fields ...
  refereeRelationshipId?: string;
  logRefereeCredit?: boolean;
}

export interface PostTransactionLedgerRowPayloadExtended {
  direction: 'receiving' | 'paying';
  entityType: 'customer' | 'vendor' | 'staff' | 'other' | 'referee'; // added 'referee'
  entityId?: string;
  entityName?: string;
  transactionType: string;
  allocationTargetType: string;
  allocationTargetId?: string;
  date: string;
  method: string;
  bucket: string;
  amount: number;
  reference?: string;
  notes?: string;
  // New fields for referee payouts:
  payRefereeCredits?: string[]; // array of credit IDs to mark as paid
}

// =============================================================================
// Query Result Types (for tRPC queries)
// =============================================================================

export interface RefereeProfileQueryResult {
  referee: Referee;
  relationships: Array<RefereeRelationshipWithDetails>;
  credits: Array<RefereeCreditWithDetails>;
  payoutHistory: Array<{
    id: string;
    date: Date;
    amount: string;
    method: string;
    reference: string | null;
    creditCount: number; // how many credits were paid
  }>;
}

export interface RefereeBalanceSummary {
  totalUnpaid: string;
  totalPaid: string;
  lifetimeEarned: string;
  creditCount: {
    accrued: number;
    paid: number;
    voided: number;
  };
}

// =============================================================================
// Drizzle Schema Additions (src/server/schema.ts)
// =============================================================================

import { pgTable, uuid, varchar, numeric, boolean, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const referees = pgTable(
  'referees',
  {
    id: id(),
    name: varchar('name', { length: 180 }).notNull(),
    email: varchar('email', { length: 240 }),
    phone: varchar('phone', { length: 80 }),
    taxId: varchar('tax_id', { length: 80 }),
    balance: numeric('balance', { precision: 12, scale: 2 }).notNull().default('0'),
    lifetimeEarned: numeric('lifetime_earned', { precision: 12, scale: 2 }).notNull().default('0'),
    paymentMethod: varchar('payment_method', { length: 32 }).default('check'),
    paymentDetails: text('payment_details'),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    activeIdx: index('referees_active_idx').on(table.active),
    balanceIdx: index('referees_balance_idx').on(table.balance),
    nameIdx: index('referees_name_idx').on(table.name)
  })
);

export const refereeRelationships = pgTable(
  'referee_relationships',
  {
    id: id(),
    refereeId: uuid('referee_id').references(() => referees.id, { onDelete: 'cascade' }).notNull(),
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    feeType: varchar('fee_type', { length: 16 }).notNull().default('percentage'),
    feePercentage: numeric('fee_percentage', { precision: 5, scale: 2 }),
    feeFixedAmount: numeric('fee_fixed_amount', { precision: 12, scale: 2 }),
    applyByDefault: boolean('apply_by_default').notNull().default(true),
    active: boolean('active').notNull().default(true),
    notes: text('notes'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    refereeIdx: index('referee_relationships_referee_idx').on(table.refereeId),
    entityIdx: index('referee_relationships_entity_idx').on(table.entityType, table.entityId),
    activeUniqueIdx: uniqueIndex('referee_relationships_active_unique').on(
      table.refereeId,
      table.entityType,
      table.entityId
    )
  })
);

export const refereeCredits = pgTable(
  'referee_credits',
  {
    id: id(),
    refereeId: uuid('referee_id').references(() => referees.id, { onDelete: 'cascade' }).notNull(),
    refereeRelationshipId: uuid('referee_relationship_id')
      .references(() => refereeRelationships.id, { onDelete: 'cascade' })
      .notNull(),
    transactionType: varchar('transaction_type', { length: 32 }).notNull(),
    transactionId: uuid('transaction_id').notNull(),
    transactionNo: varchar('transaction_no', { length: 80 }).notNull(),
    transactionTotal: numeric('transaction_total', { precision: 12, scale: 2 }).notNull(),
    feeType: varchar('fee_type', { length: 16 }).notNull(),
    feePercentage: numeric('fee_percentage', { precision: 5, scale: 2 }),
    feeFixedAmount: numeric('fee_fixed_amount', { precision: 12, scale: 2 }),
    creditAmount: numeric('credit_amount', { precision: 12, scale: 2 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('accrued'),
    paidViaTransactionId: uuid('paid_via_transaction_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedReason: text('voided_reason'),
    commandId: uuid('command_id'),
    notes: text('notes'),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    refereeIdx: index('referee_credits_referee_idx').on(table.refereeId),
    statusIdx: index('referee_credits_status_idx').on(table.status),
    transactionIdx: index('referee_credits_transaction_idx').on(table.transactionType, table.transactionId),
    unpaidIdx: index('referee_credits_unpaid_idx').on(table.refereeId, table.status),
    transactionUniqueIdx: uniqueIndex('referee_credits_transaction_unique').on(
      table.transactionType,
      table.transactionId
    )
  })
);

// Type inference from Drizzle schema
export type Referee = typeof referees.$inferSelect;
export type RefereeRelationship = typeof refereeRelationships.$inferSelect;
export type RefereeCredit = typeof refereeCredits.$inferSelect;

// =============================================================================
// React Component Prop Types
// =============================================================================

export interface RefereeGridProps {
  referees: RefereeWithStats[];
  onSelectReferee: (refereeId: string) => void;
  onAddReferee: () => void;
  onQuickPayout: (refereeId: string) => void;
}

export interface RefereeProfilePanelProps {
  refereeId: string;
  onClose: () => void;
  onEdit: () => void;
  onPayout: () => void;
}

export interface RefereeCheckboxProps {
  entityType: RefereeEntityType;
  entityId: string;
  transactionTotal: number;
  relationship: RefereeRelationshipWithDetails | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export interface RefereeRelationshipFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<RefereeRelationship>;
  refereeId?: string;
  entityType?: RefereeEntityType;
  entityId?: string;
  onSave: (data: AddRefereeRelationshipPayload | UpdateRefereeRelationshipPayload) => Promise<void>;
  onCancel: () => void;
}

export interface RefereeCreditHistoryProps {
  refereeId: string;
  credits: RefereeCreditWithDetails[];
  filters: {
    status?: RefereeCreditStatus;
    dateFrom?: Date;
    dateTo?: Date;
  };
  onFilterChange: (filters: any) => void;
  onMarkPaid: (creditIds: string[]) => void;
  onVoid: (creditId: string, reason: string) => void;
}

// =============================================================================
// Helper Functions / Utilities
// =============================================================================

export function calculateRefereeCredit(
  transactionTotal: number,
  feeType: RefereeFeeType,
  feePercentage: number | null,
  feeFixedAmount: number | null
): number {
  switch (feeType) {
    case 'percentage':
      if (!feePercentage) throw new Error('Percentage fee required');
      return Math.round((transactionTotal * (feePercentage / 100)) * 100) / 100;
    case 'fixed':
      if (!feeFixedAmount) throw new Error('Fixed amount required');
      return feeFixedAmount;
    case 'hybrid':
      if (!feePercentage || !feeFixedAmount) throw new Error('Both percentage and fixed amount required');
      const percentPart = Math.round((transactionTotal * (feePercentage / 100)) * 100) / 100;
      return percentPart + feeFixedAmount;
    default:
      throw new Error(`Invalid fee type: ${feeType}`);
  }
}

export function formatRefereeFeeSummary(
  feeType: RefereeFeeType,
  feePercentage: number | null,
  feeFixedAmount: number | null,
  transactionTotal?: number
): string {
  switch (feeType) {
    case 'percentage':
      if (!feePercentage) return 'No fee';
      const amount = transactionTotal
        ? ` = $${calculateRefereeCredit(transactionTotal, feeType, feePercentage, null).toFixed(2)}`
        : '';
      return `${feePercentage}%${amount}`;
    case 'fixed':
      if (!feeFixedAmount) return 'No fee';
      return `$${feeFixedAmount.toFixed(2)} per transaction`;
    case 'hybrid':
      if (!feePercentage || !feeFixedAmount) return 'No fee';
      const hybridAmount = transactionTotal
        ? ` = $${calculateRefereeCredit(transactionTotal, feeType, feePercentage, feeFixedAmount).toFixed(2)}`
        : '';
      return `${feePercentage}% + $${feeFixedAmount.toFixed(2)}${hybridAmount}`;
  }
}

export function validateRefereeRelationship(
  feeType: RefereeFeeType,
  feePercentage: number | null,
  feeFixedAmount: number | null
): string | null {
  if (feeType === 'percentage') {
    if (!feePercentage || feePercentage <= 0 || feePercentage > 100) {
      return 'Percentage must be between 0.01 and 100';
    }
  } else if (feeType === 'fixed') {
    if (!feeFixedAmount || feeFixedAmount < 0) {
      return 'Fixed amount must be greater than or equal to 0';
    }
  } else if (feeType === 'hybrid') {
    if (!feePercentage || feePercentage <= 0 || feePercentage > 100) {
      return 'Percentage must be between 0.01 and 100';
    }
    if (!feeFixedAmount || feeFixedAmount < 0) {
      return 'Fixed amount must be greater than or equal to 0';
    }
  }
  return null;
}

// =============================================================================
// tRPC Query Types
// =============================================================================

export interface RefereeQueryInput {
  refereeId: string;
}

export interface RefereeCreditsQueryInput {
  refereeId?: string;
  status?: RefereeCreditStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface RefereeRelationshipsQueryInput {
  refereeId?: string;
  entityType?: RefereeEntityType;
  entityId?: string;
  activeOnly?: boolean;
}

// =============================================================================
// Command Catalog Additions
// =============================================================================

// Add to commandNames array:
export const newCommandNames = [
  'createReferee',
  'updateReferee',
  'addRefereeRelationship',
  'updateRefereeRelationship',
  'deactivateRefereeRelationship',
  'voidRefereeCredit'
] as const;

// Add to commandLabels:
export const newCommandLabels: Record<string, string> = {
  createReferee: 'Create referee',
  updateReferee: 'Update referee',
  addRefereeRelationship: 'Add referee relationship',
  updateRefereeRelationship: 'Update referee relationship',
  deactivateRefereeRelationship: 'Deactivate referee relationship',
  voidRefereeCredit: 'Void referee credit'
};

// Add to commandMinRole:
export const newCommandMinRoles: Record<string, string> = {
  createReferee: 'manager',
  updateReferee: 'manager',
  addRefereeRelationship: 'manager',
  updateRefereeRelationship: 'manager',
  deactivateRefereeRelationship: 'manager',
  voidRefereeCredit: 'owner'
};

// Add to reversalPolicies:
export const newReversalPolicies: Record<string, { disposition: string; guidance: string }> = {
  createReferee: {
    disposition: 'terminal',
    guidance: 'Deactivate referee instead of deleting'
  },
  updateReferee: {
    disposition: 'terminal',
    guidance: 'Make corrective update to referee record'
  },
  addRefereeRelationship: {
    disposition: 'terminal',
    guidance: 'Deactivate relationship via deactivateRefereeRelationship'
  },
  updateRefereeRelationship: {
    disposition: 'terminal',
    guidance: 'Make corrective update to relationship'
  },
  deactivateRefereeRelationship: {
    disposition: 'terminal',
    guidance: 'Cannot reactivate; create new relationship if needed'
  },
  voidRefereeCredit: {
    disposition: 'terminal',
    guidance: 'Voided credits are permanent; cannot be un-voided'
  }
};

// =============================================================================
// Transaction Type for Referee Payouts
// =============================================================================

export const refereePayoutTransactionType = {
  slug: 'referee_payout',
  label: 'Referee Payout',
  direction: 'paying' as const,
  allowedEntityTypes: ['referee'] as const,
  defaultMethod: 'check',
  defaultBucket: 'accounting',
  defaultAllocationIntent: 'unapplied',
  requiresApproval: true,
  isSystem: true
};

// =============================================================================
// End of Type Definitions
// =============================================================================
