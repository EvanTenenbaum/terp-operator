import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: id(),
  name: varchar('name', { length: 160 }).notNull(),
  email: varchar('email', { length: 240 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 32 }).notNull(),
  active: boolean('active').notNull().default(true),
  // Explicit work-loop assignment — see migrations/0044_users_work_loop.sql.
  // Null means "fall back to the legacy substring heuristic on email/name"
  // (see legacyWorkLoopFromSubstring in src/client/accessPolicy.ts).
  workLoop: varchar('work_loop', { length: 32 }),
  // Contacts system link (CAP-033 / TER-1564, migration 0054).
  // Lazy reference because `contacts` is declared later in this file.
  contactId: uuid('contact_id').references((): AnyPgColumn => contacts.id),
  createdAt: now(),
  updatedAt: updated()
});

export const vendors = pgTable('vendors', {
  id: id(),
  name: varchar('name', { length: 180 }).notNull(),
  alias: varchar('alias', { length: 80 }),
  termsDays: integer('terms_days').notNull().default(14),
  consignmentDefault: boolean('consignment_default').notNull().default(false),
  contact: text('contact'),
  notes: text('notes'),
  // Contacts system link (CAP-033 / TER-1564). Lazy reference; `contacts` declared later.
  contactId: uuid('contact_id').references((): AnyPgColumn => contacts.id),
  createdAt: now(),
  updatedAt: updated()
});

export const brands = pgTable('brands', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull(),
  alias: varchar('alias', { length: 80 }).notNull().default('Brand TBD'),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  // TER-1585 (CMD-VENDOR auto-brand wiring): nullable FK to the vendor that
  // "owns" this brand. When a vendor is created without an explicit brand, the
  // command bus auto-creates a default brand and sets this FK. Intake commands
  // use this column to resolve the correct brand for a given vendor.
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by').references(() => users.id),
  createdAt: now(),
  updatedAt: updated()
});

export const customers = pgTable('customers', {
  id: id(),
  name: varchar('name', { length: 180 }).notNull(),
  creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }).notNull().default('0'),
  balance: numeric('balance', { precision: 12, scale: 2 }).notNull().default('0'),
  tags: text('tags').array().notNull().default([]),
  pricingRule: jsonb('pricing_rule').$type<Record<string, unknown>>().notNull().default({}),
  notes: text('notes'),
  engineMax: numeric('engine_max', { precision: 12, scale: 2 }),
  // GH #293: These credit engine UUID columns reference other tables.
  // FK constraints exist in DB (from migration 0033; named in 0060).
  // .references() calls added here so Drizzle reflects the FK graph.
  stanceId: uuid('stance_id').references(() => creditEngineStances.id, { onDelete: 'set null' }),
  creditLimitSource: varchar('credit_limit_source', { length: 16 }).notNull().default('manual'),
  engineEnabled: boolean('engine_enabled').notNull().default(false),
  engineDisabledAt: timestamp('engine_disabled_at', { withTimezone: true }),
  engineDisabledBy: uuid('engine_disabled_by').references(() => users.id, { onDelete: 'set null' }),
  engineDisabledReason: text('engine_disabled_reason'),
  lastAssessmentId: uuid('last_assessment_id').references((): AnyPgColumn => customerCreditAssessments.id, { onDelete: 'set null' }),
  creditLimitManualSetAt: timestamp('credit_limit_manual_set_at', { withTimezone: true }),
  creditLimitManualSetBy: uuid('credit_limit_manual_set_by').references(() => users.id, { onDelete: 'set null' }),
  creditLimitManualReason: text('credit_limit_manual_reason'),
  creditLimitReminderDays: integer('credit_limit_reminder_days'),
  creditLimitLastReviewedAt: timestamp('credit_limit_last_reviewed_at', { withTimezone: true }),
  creditLimitSnoozeCount: integer('credit_limit_snooze_count').notNull().default(0),
  // Contacts system link (CAP-033 / TER-1564). Lazy reference; `contacts` declared later.
  contactId: uuid('contact_id').references((): AnyPgColumn => contacts.id),
  createdAt: now(),
  updatedAt: updated()
});

export const savedFilters = pgTable('saved_filters', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  targetView: varchar('target_view', { length: 32 }).notNull(),
  filterDefinition: jsonb('filter_definition').notNull(),
  schemaVersion: integer('schema_version').notNull().default(1),
  isGlobal: boolean('is_global').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: uuid('deleted_by').references(() => users.id),
  createdAt: now(),
  updatedAt: updated()
});

// UX-A04 / CAP-024 / Execution Decision 2 (docs/ux-audit-2026-06-12.md):
// Server-side per-user draft persistence for UI working sets. Quick Ledger
// drafts (viewKey 'quickLedger') are stored here — NEVER in localStorage —
// per the shared-workstation PII rationale (drafts carry counterparty names).
// See migrations/0082_user_view_drafts.sql.
export const userViewDrafts = pgTable(
  'user_view_drafts',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    viewKey: varchar('view_key', { length: 32 }).notNull().default('quickLedger'),
    drafts: jsonb('drafts').notNull().default(sql`'[]'::jsonb`),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    userViewIdx: uniqueIndex('user_view_drafts_user_view_uniq').on(table.userId, table.viewKey)
  })
);

export const tagCatalog = pgTable(
  'tag_catalog',
  {
    id: id(),
    slug: varchar('slug', { length: 80 }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    color: varchar('color', { length: 32 }).notNull().default('gray'),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    slugIdx: uniqueIndex('tag_catalog_slug_idx').on(table.slug),
    activeIdx: index('tag_catalog_active_idx').on(table.isActive)
  })
);

export const items = pgTable('items', {
  id: id(),
  sku: varchar('sku', { length: 80 }).notNull().unique(),
  name: varchar('name', { length: 180 }).notNull(),
  alias: varchar('alias', { length: 180 }),
  category: varchar('category', { length: 80 }).notNull(),
  tags: text('tags').array().notNull().default([]),
  pricingRule: jsonb('pricing_rule').$type<Record<string, unknown>>().notNull().default({}),
  status: varchar('status', { length: 24 }).notNull().default('active'),
  description: text('description'),
  createdAt: now(),
  updatedAt: updated()
});

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: id(),
    poNo: varchar('po_no', { length: 80 }).notNull().unique(),
    // GH #297: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0059).
    // Deleting a vendor that has purchase orders is now rejected; callers must
    // archive or reassign orders before removing the vendor.
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    expectedDate: timestamp('expected_date', { withTimezone: true }),
    orderedAt: timestamp('ordered_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
    orderedBy: uuid('ordered_by').references(() => users.id, { onDelete: 'set null' }),
    paymentTerms: varchar('payment_terms', { length: 32 }).notNull().default('vendor_terms'),
    prepaymentAmount: numeric('prepayment_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    buyerNotes: text('buyer_notes'),
    internalNotes: text('internal_notes'),
    externalNotes: text('external_notes'),
    refereeRelationshipId: uuid('referee_relationship_id'),
    refereeCreditAmount: numeric('referee_credit_amount', { precision: 12, scale: 2 }),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    statusIdx: index('purchase_orders_status_idx').on(table.status),
    vendorIdx: index('purchase_orders_vendor_idx').on(table.vendorId)
  })
);

export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: id(),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'cascade' }).notNull(),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    productName: varchar('product_name', { length: 180 }).notNull(),
    category: varchar('category', { length: 80 }).notNull(),
    subcategory: varchar('subcategory', { length: 80 }),
    tags: text('tags').array().notNull().default([]),
    qty: numeric('qty', { precision: 12, scale: 3 }).notNull().default('0'),
    receivedQty: numeric('received_qty', { precision: 12, scale: 3 }).notNull().default('0'),
    uom: varchar('uom', { length: 24 }).notNull().default('lb'),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
    costRangeLow: numeric('cost_range_low', { precision: 12, scale: 2 }),
    costRangeHigh: numeric('cost_range_high', { precision: 12, scale: 2 }),
    sourceCode: varchar('source_code', { length: 120 }),
    shorthand: varchar('shorthand', { length: 120 }),
    legacyMarker: varchar('legacy_marker', { length: 120 }),
    ownershipStatus: varchar('ownership_status', { length: 16 }).notNull().default('UNKNOWN'),
    notes: text('notes'),
    internalNotes: text('internal_notes'),
    externalNotes: text('external_notes'),
    status: varchar('status', { length: 32 }).notNull().default('planned'),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    poIdx: index('purchase_order_lines_po_idx').on(table.purchaseOrderId),
    statusIdx: index('purchase_order_lines_status_idx').on(table.status)
  })
);

export const batches = pgTable(
  'batches',
  {
    id: id(),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'restrict' }),
    // GH #376: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0075).
    // Deleting a purchase order that has batches is now rejected.
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    // GH #376: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0075).
    // Deleting a purchase order line that has batches is now rejected.
    purchaseOrderLineId: uuid('purchase_order_line_id').references(() => purchaseOrderLines.id, { onDelete: 'restrict' }),
    batchCode: varchar('batch_code', { length: 80 }).notNull().unique(),
    sourceCode: varchar('source_code', { length: 120 }),
    shorthand: varchar('shorthand', { length: 120 }),
    name: varchar('name', { length: 180 }).notNull(),
    category: varchar('category', { length: 80 }).notNull(),
    subcategory: varchar('subcategory', { length: 80 }),
    brandAlias: varchar('brand_alias', { length: 80 }),
    vendorAlias: varchar('vendor_alias', { length: 80 }),
    tags: text('tags').array().notNull().default([]),
    intakeQty: numeric('intake_qty', { precision: 12, scale: 3 }).notNull().default('0'),
    availableQty: numeric('available_qty', { precision: 12, scale: 3 }).notNull().default('0'),
    reservedQty: numeric('reserved_qty', { precision: 12, scale: 3 }).notNull().default('0'),
    uom: varchar('uom', { length: 24 }).notNull().default('lb'),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull().default('0'),
    location: varchar('location', { length: 120 }).notNull().default('vault'),
    lotCode: varchar('lot_code', { length: 120 }),
    intakeDate: timestamp('intake_date', { withTimezone: true }),
    ticketCost: numeric('ticket_cost', { precision: 12, scale: 2 }),
    priceRange: varchar('price_range', { length: 120 }),
    notes: text('notes'),
    legacyMarker: varchar('legacy_marker', { length: 120 }),
    expirationDate: timestamp('expiration_date', { withTimezone: true }),
    ownershipStatus: varchar('ownership_status', { length: 16 }).notNull().default('UNKNOWN'),
    arrivalConfirmed: boolean('arrival_confirmed').notNull().default(false),
    arrivalStatus: varchar('arrival_status', { length: 32 }).notNull().default('pending'),
    validationIssues: jsonb('validation_issues').$type<string[]>().notNull().default([]),
    mediaStatus: varchar('media_status', { length: 32 }).notNull().default('open'),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    sortId: integer('sort_id'),
    photoUrl: text('photo_url'),
    casePack: integer('case_pack'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    statusIdx: index('batches_status_idx').on(table.status),
    vendorIdx: index('batches_vendor_idx').on(table.vendorId),
    categoryIdx: index('batches_category_idx').on(table.category)
  })
);

export const inventoryMovements = pgTable('inventory_movements', {
  id: id(),
  batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'cascade' }).notNull(),
  commandId: uuid('command_id'),
  kind: varchar('kind', { length: 48 }).notNull(),
  qtyDelta: numeric('qty_delta', { precision: 12, scale: 3 }).notNull(),
  reason: text('reason'),
  createdAt: now()
});

export const purchaseReceipts = pgTable('purchase_receipts', {
  id: id(),
  receiptNo: varchar('receipt_no', { length: 80 }).notNull().unique(),
  // GH #376: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0075).
  // Deleting a vendor that has purchase receipts is now rejected.
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'restrict' }),
  // GH #376: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0075).
  // Deleting a purchase order that has purchase receipts is now rejected.
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 32 }).notNull().default('posted'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: now(),
  updatedAt: updated()
});

export const purchaseReceiptLines = pgTable('purchase_receipt_lines', {
  id: id(),
  receiptId: uuid('receipt_id').references(() => purchaseReceipts.id, { onDelete: 'cascade' }).notNull(),
  batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'cascade' }).notNull(),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull()
});

export const salesOrders = pgTable('sales_orders', {
  id: id(),
  orderNo: varchar('order_no', { length: 80 }).notNull().unique(),
  // GH #297: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0059).
  // Deleting a customer that has sales orders is now rejected.
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  pricingStrategy: varchar('pricing_strategy', { length: 80 }).notNull().default('standard'),
  internalMargin: numeric('internal_margin', { precision: 12, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
  deliveryWindow: text('delivery_window'),
  notes: text('notes'),
  packed: boolean('packed').notNull().default(false),
  inventoryPosted: boolean('inventory_posted').notNull().default(false),
  paymentFollowup: boolean('payment_followup').notNull().default(false),
  legacyStatusMarkers: varchar('legacy_status_markers', { length: 180 }),
  validationIssues: jsonb('validation_issues').$type<string[]>().notNull().default([]),
  refereeRelationshipId: uuid('referee_relationship_id'),
  refereeCreditAmount: numeric('referee_credit_amount', { precision: 12, scale: 2 }),
  vendorApprovalPending: boolean('vendor_approval_pending').notNull().default(false),
  marginWaivedTotal: numeric('margin_waived_total', { precision: 12, scale: 2 }).notNull().default('0'),
  lossRecognizedTotal: numeric('loss_recognized_total', { precision: 12, scale: 2 }).notNull().default('0'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: now(),
  updatedAt: updated()
});

export const salesOrderLines = pgTable('sales_order_lines', {
  id: id(),
  orderId: uuid('order_id').references(() => salesOrders.id, { onDelete: 'cascade' }).notNull(),
  batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'set null' }),
  itemName: varchar('item_name', { length: 180 }).notNull(),
  displayName: varchar('display_name', { length: 180 }),
  qty: numeric('qty', { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  sourceRowKey: varchar('source_row_key', { length: 180 }),
  unresolvedSourceText: varchar('unresolved_source_text', { length: 180 }),
  legacyStatusMarker: varchar('legacy_status_marker', { length: 80 }),
  packed: boolean('packed').notNull().default(false),
  inventoryPosted: boolean('inventory_posted').notNull().default(false),
  paymentFollowup: boolean('payment_followup').notNull().default(false),
  validationIssues: jsonb('validation_issues').$type<string[]>().notNull().default([]),
  unitCostResolved: boolean('unit_cost_resolved').notNull().default(false),
  landedCostBasis: varchar('landed_cost_basis', { length: 32 }),
  landedCostReason: text('landed_cost_reason'),
  priceFloor: numeric('price_floor', { precision: 12, scale: 2 }),
  belowFloorReason: varchar('below_floor_reason', { length: 32 }),
  belowFloorNote: text('below_floor_note'),
  vendorApprovalState: varchar('vendor_approval_state', { length: 32 }).notNull().default('none'),
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  pickReleasedAt: timestamp('pick_released_at', { withTimezone: true }),
  pickReleasedBy: uuid('pick_released_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: now(),
  updatedAt: updated()
});

export const systemSettings = pgTable('system_settings', {
  id: id(),
  key: varchar('key', { length: 80 }).notNull().unique(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: now(),
  updatedAt: updated()
});

export const invoices = pgTable('invoices', {
  id: id(),
  invoiceNo: varchar('invoice_no', { length: 80 }).notNull().unique(),
  // GH #376: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0075).
  // Deleting a customer that has invoices is now rejected.
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
  // GH #376: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0075).
  // Deleting a sales order that has invoices is now rejected.
  orderId: uuid('order_id').references(() => salesOrders.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 32 }).notNull().default('open'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(),
  amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  createdAt: now(),
  updatedAt: updated()
});

export const payments = pgTable('payments', {
  id: id(),
  // GH #376: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0075).
  // Deleting a customer that has payments is now rejected.
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
  method: varchar('method', { length: 32 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  unappliedAmount: numeric('unapplied_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  reference: varchar('reference', { length: 180 }),
  locationBucket: varchar('location_bucket', { length: 120 }),
  notes: text('notes'),
  direction: varchar('direction', { length: 32 }).notNull().default('money_in'),
  category: varchar('category', { length: 80 }).notNull().default('client_payment'),
  allocationIntent: varchar('allocation_intent', { length: 80 }).notNull().default('fifo'),
  impactPreview: text('impact_preview'),
  status: varchar('status', { length: 32 }).notNull().default('posted'),
  createdAt: now(),
  updatedAt: updated()
});

export const paymentAllocations = pgTable('payment_allocations', {
  id: id(),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'cascade' }).notNull(),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  // GH #298: amount must be strictly positive (enforced by DB CHECK via migration 0057).
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  createdAt: now()
}, (table) => ({
  amountPositive: check('payment_allocations_amount_positive', sql`${table.amount} > 0`)
}));

export const vendorBills = pgTable('vendor_bills', {
  id: id(),
  // GH #376: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0075).
  // Deleting a vendor that has vendor bills is now rejected.
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'restrict' }),
  // GH #376: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0075).
  // Deleting a purchase receipt that has vendor bills is now rejected.
  purchaseReceiptId: uuid('purchase_receipt_id').references(() => purchaseReceipts.id, { onDelete: 'restrict' }),
  // GH #376: Changed from ON DELETE SET NULL → ON DELETE RESTRICT (migration 0075).
  // Deleting a purchase order that has vendor bills is now rejected.
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'restrict' }),
  billNo: varchar('bill_no', { length: 80 }).notNull().unique(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('open'),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  termsDays: integer('terms_days').notNull().default(14),
  consignmentTriggered: boolean('consignment_triggered').notNull().default(false),
  dueReason: text('due_reason'),
  discrepancyNotes: text('discrepancy_notes'),
  createdAt: now(),
  updatedAt: updated()
});

export const vendorPayments = pgTable('vendor_payments', {
  id: id(),
  vendorBillId: uuid('vendor_bill_id').references(() => vendorBills.id, { onDelete: 'cascade' }).notNull(),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  method: varchar('method', { length: 32 }).notNull().default('cash'),
  reference: varchar('reference', { length: 180 }),
  status: varchar('status', { length: 32 }).notNull().default('posted'),
  createdAt: now()
});

export const pickLists = pgTable('pick_lists', {
  id: id(),
  pickNo: varchar('pick_no', { length: 80 }).notNull().unique(),
  orderId: uuid('order_id').references(() => salesOrders.id, { onDelete: 'cascade' }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('open'),
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  labelFormat: varchar('label_format', { length: 16 }).notNull().default('4x6'),
  unitsPerBag: integer('units_per_bag').notNull().default(1),
  labelsPrinted: boolean('labels_printed').notNull().default(false),
  manifestPath: text('manifest_path'),
  tracking: text('tracking'),
  createdAt: now(),
  updatedAt: updated()
});

export const fulfillmentLines = pgTable('fulfillment_lines', {
  id: id(),
  pickListId: uuid('pick_list_id').references(() => pickLists.id, { onDelete: 'cascade' }).notNull(),
  orderLineId: uuid('order_line_id').references(() => salesOrderLines.id, { onDelete: 'cascade' }).notNull(),
  batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'set null' }),
  expectedQty: numeric('expected_qty', { precision: 12, scale: 3 }).notNull(),
  actualQty: numeric('actual_qty', { precision: 12, scale: 3 }).notNull().default('0'),
  actualWeight: numeric('actual_weight', { precision: 12, scale: 3 }).notNull().default('0'),
  bagCode: varchar('bag_code', { length: 80 }),
  status: varchar('status', { length: 32 }).notNull().default('open'),
  warehouseAlerts: jsonb('warehouse_alerts').$type<Array<Record<string, unknown>>>().notNull().default([]),
  statusExtended: varchar('status_extended', { length: 32 }),
  createdAt: now(),
  updatedAt: updated()
});

export const connectorRequests = pgTable('connector_requests', {
  id: id(),
  source: varchar('source', { length: 80 }).notNull(),
  requestType: varchar('request_type', { length: 80 }).notNull(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: varchar('status', { length: 32 }).notNull().default('open'),
  routedTo: varchar('routed_to', { length: 80 }),
  operatorNotes: text('operator_notes'),
  reviewHistory: jsonb('review_history').$type<Array<Record<string, unknown>>>().notNull().default([]),
  safetyNote: text('safety_note').notNull().default('No ledger change until an operator posts the routed row.'),
  createdAt: now(),
  updatedAt: updated()
});

export const customerNeeds = pgTable(
  'customer_needs',
  {
    id: id(),
    needCode: varchar('need_code', { length: 80 }).notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    productName: varchar('product_name', { length: 180 }).notNull(),
    category: varchar('category', { length: 80 }).notNull(),
    subcategory: varchar('subcategory', { length: 80 }),
    tags: text('tags').array().notNull().default([]),
    qtyMin: numeric('qty_min', { precision: 12, scale: 3 }).notNull().default('1'),
    qtyMax: numeric('qty_max', { precision: 12, scale: 3 }),
    targetPrice: numeric('target_price', { precision: 12, scale: 2 }),
    neededBy: timestamp('needed_by', { withTimezone: true }),
    urgency: varchar('urgency', { length: 32 }).notNull().default('normal'),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    needCodeIdx: uniqueIndex('customer_needs_code_idx').on(table.needCode),
    customerIdx: index('customer_needs_customer_idx').on(table.customerId),
    statusIdx: index('customer_needs_status_idx').on(table.status),
    categoryIdx: index('customer_needs_category_idx').on(table.category)
  })
);

export const vendorSupply = pgTable(
  'vendor_supply',
  {
    id: id(),
    supplyCode: varchar('supply_code', { length: 80 }).notNull(),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
    productName: varchar('product_name', { length: 180 }).notNull(),
    category: varchar('category', { length: 80 }).notNull(),
    subcategory: varchar('subcategory', { length: 80 }),
    tags: text('tags').array().notNull().default([]),
    availableQty: numeric('available_qty', { precision: 12, scale: 3 }).notNull().default('1'),
    askingPrice: numeric('asking_price', { precision: 12, scale: 2 }),
    availableDate: timestamp('available_date', { withTimezone: true }),
    location: varchar('location', { length: 120 }),
    grade: varchar('grade', { length: 80 }),
    terms: text('terms'),
    notes: text('notes'),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    supplyCodeIdx: uniqueIndex('vendor_supply_code_idx').on(table.supplyCode),
    vendorIdx: index('vendor_supply_vendor_idx').on(table.vendorId),
    statusIdx: index('vendor_supply_status_idx').on(table.status),
    categoryIdx: index('vendor_supply_category_idx').on(table.category)
  })
);

export const matchmakingMatches = pgTable(
  'matchmaking_matches',
  {
    id: id(),
    customerNeedId: uuid('customer_need_id').references(() => customerNeeds.id, { onDelete: 'cascade' }).notNull(),
    vendorSupplyId: uuid('vendor_supply_id').references(() => vendorSupply.id, { onDelete: 'cascade' }).notNull(),
    score: integer('score').notNull().default(0),
    reasons: text('reasons').array().notNull().default([]),
    status: varchar('status', { length: 32 }).notNull().default('open'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    pairIdx: uniqueIndex('matchmaking_matches_pair_idx').on(table.customerNeedId, table.vendorSupplyId),
    needIdx: index('matchmaking_matches_need_idx').on(table.customerNeedId),
    supplyIdx: index('matchmaking_matches_supply_idx').on(table.vendorSupplyId),
    statusIdx: index('matchmaking_matches_status_idx').on(table.status),
    scoreIdx: index('matchmaking_matches_score_idx').on(table.score)
  })
);

export const matchmakingSettings = pgTable('matchmaking_settings', {
  id: id(),
  matchQualityFloor: integer('match_quality_floor').notNull().default(35),
  workQueueThreshold: integer('work_queue_threshold').notNull().default(75),
  historyLookbackDays: integer('history_lookback_days').notNull().default(90),
  repeatThreshold: integer('repeat_threshold').notNull().default(3),
  gapFloorQty: integer('gap_floor_qty').notNull().default(0),
  showClientsColumn: boolean('show_clients_column').notNull().default(false),
  showVendorsColumn: boolean('show_vendors_column').notNull().default(false),
  workQueueEnabled: boolean('work_queue_enabled').notNull().default(true),
  updatedAt: updated(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

export const creditOverrides = pgTable('credit_overrides', {
  id: id(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  reason: text('reason'),
  createdAt: now(),
  updatedAt: updated()
});

export const invoiceDisputes = pgTable('invoice_disputes', {
  id: id(),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('open'),
  reason: text('reason').notNull(),
  resolution: text('resolution'),
  createdAt: now(),
  updatedAt: updated()
});

export const clientLedgerEntries = pgTable('client_ledger_entries', {
  id: id(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
  kind: varchar('kind', { length: 48 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull(),
  note: text('note'),
  createdAt: now()
});

export const correctionJournalEntries = pgTable('correction_journal_entries', {
  id: id(),
  period: varchar('period', { length: 7 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  memo: text('memo').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('posted'),
  createdAt: now()
});

export const periodLocks = pgTable('period_locks', {
  id: id(),
  period: varchar('period', { length: 7 }).notNull().unique(),
  status: varchar('status', { length: 32 }).notNull().default('locked'),
  lockedBy: uuid('locked_by').references(() => users.id, { onDelete: 'set null' }),
  lockedAt: timestamp('locked_at', { withTimezone: true }).notNull().defaultNow()
});

export const archiveRuns = pgTable('archive_runs', {
  id: id(),
  period: varchar('period', { length: 7 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('archived'),
  controlTotals: jsonb('control_totals').$type<Record<string, unknown>>().notNull().default({}),
  csvPath: text('csv_path').notNull(),
  jsonlPath: text('jsonl_path').notNull(),
  pdfPath: text('pdf_path').notNull(),
  createdAt: now()
});

export const photographyQueue = pgTable('photography_queue', {
  id: id(),
  batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'cascade' }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('open'),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: now(),
  updatedAt: updated()
});

export const backupSnapshots = pgTable('backup_snapshots', {
  id: id(),
  label: varchar('label', { length: 180 }).notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  createdAt: now()
});

export const transactionTypes = pgTable(
  'transaction_types',
  {
    id: id(),
    slug: varchar('slug', { length: 80 }).notNull(),
    label: varchar('label', { length: 140 }).notNull(),
    direction: varchar('direction', { length: 24 }).notNull().default('receiving'),
    allowedEntityTypes: text('allowed_entity_types').array().notNull().default([]),
    defaultMethod: varchar('default_method', { length: 32 }).notNull().default('cash'),
    defaultBucket: varchar('default_bucket', { length: 120 }).notNull().default('cash-file-a'),
    defaultAllocationIntent: varchar('default_allocation_intent', { length: 80 }).notNull().default('fifo'),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    isSystem: boolean('is_system').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    slugIdx: uniqueIndex('transaction_types_slug_idx').on(table.slug),
    directionIdx: index('transaction_types_direction_idx').on(table.direction),
    activeIdx: index('transaction_types_active_idx').on(table.isActive)
  })
);

export const commandJournal = pgTable(
  'command_journal',
  {
    id: id(),
    commandName: varchar('command_name', { length: 80 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 180 }).notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: varchar('actor_name', { length: 180 }).notNull(),
    actorRole: varchar('actor_role', { length: 32 }).notNull(),
    reason: text('reason'),
    inputPayload: jsonb('input_payload').$type<Record<string, unknown>>().notNull().default({}),
    status: varchar('status', { length: 32 }).notNull(),
    affectedIds: text('affected_ids').array().notNull().default([]),
    beforeSnapshot: jsonb('before_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    afterSnapshot: jsonb('after_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb('result').$type<Record<string, unknown>>().notNull().default({}),
    error: text('error'),
    // GH #294: Self-referential FK added in migration 0061 (ON DELETE SET NULL).
    reversedByCommandId: uuid('reversed_by_command_id').references((): AnyPgColumn => commandJournal.id, { onDelete: 'set null' }),
    createdAt: now()
  },
  (table) => ({
    idempotencyIdx: uniqueIndex('command_journal_idempotency_idx').on(table.idempotencyKey),
    commandIdx: index('command_journal_command_idx').on(table.commandName),
    actorIdx: index('command_journal_actor_idx').on(table.actorId)
  })
);

export const documentSnapshots = pgTable(
  'document_snapshots',
  {
    id: id(),
    kind: varchar('kind', { length: 32 }).notNull(),
    sourceEntityType: varchar('source_entity_type', { length: 32 }).notNull(),
    sourceEntityId: uuid('source_entity_id').notNull(),
    commandId: uuid('command_id').references(() => commandJournal.id).notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    audience: varchar('audience', { length: 16 }).notNull(),
    snapshotJson: jsonb('snapshot_json').$type<Record<string, unknown>>().notNull(),
    projectionVersion: integer('projection_version').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    supersedesId: uuid('supersedes_id').references((): AnyPgColumn => documentSnapshots.id),
    createdBy: uuid('created_by').references(() => users.id),
    finalizedBy: uuid('finalized_by').references(() => users.id),
    voidedBy: uuid('voided_by').references(() => users.id),
    createdAt: now(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true })
  },
  (table) => ({
    entityIdx: index('document_snapshots_entity_idx').on(
      table.sourceEntityType, table.sourceEntityId, table.audience, table.status
    ),
    commandIdx: index('document_snapshots_command_idx').on(table.commandId),
    supersedesIdx: index('document_snapshots_supersedes_idx').on(table.supersedesId)
  })
);

export const session = pgTable('session', {
  sid: varchar('sid', { length: 255 }).primaryKey(),
  sess: jsonb('sess').notNull(),
  expire: timestamp('expire', { withTimezone: false }).notNull()
});

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
    // Contacts system link (CAP-033 / TER-1564). Lazy reference; `contacts` declared later.
    contactId: uuid('contact_id').references((): AnyPgColumn => contacts.id),
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
    amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
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
    paidAtIdx: index('referee_credits_paid_at_idx').on(table.paidAt),
    balanceCalcIdx: index('referee_credits_balance_calc_idx').on(table.refereeId, table.status),
    transactionUniqueIdx: uniqueIndex('referee_credits_transaction_unique').on(
      table.transactionType,
      table.transactionId
    )
  })
);

export const paymentProcessors = pgTable(
  'payment_processors',
  {
    id: id(),
    name: varchar('name', { length: 180 }).notNull(),
    processorType: varchar('processor_type', { length: 32 }).notNull(),
    feeType: varchar('fee_type', { length: 16 }).notNull().default('hybrid'),
    feePercentage: numeric('fee_percentage', { precision: 5, scale: 2 }),
    feeFixedAmount: numeric('fee_fixed_amount', { precision: 12, scale: 2 }),
    defaultUserSplit: numeric('default_user_split', { precision: 5, scale: 2 }).notNull(),
    defaultProcessorSplit: numeric('default_processor_split', { precision: 5, scale: 2 }).notNull(),
    notes: text('notes'),
    active: boolean('active').notNull().default(true),
    // Contacts system link (CAP-033 / TER-1564). Lazy reference; `contacts` declared later.
    contactId: uuid('contact_id').references((): AnyPgColumn => contacts.id),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    typeIdx: index('payment_processors_type_idx').on(table.processorType),
    activeIdx: index('payment_processors_active_idx').on(table.active)
  })
);

export const processorFees = pgTable(
  'processor_fees',
  {
    id: id(),
    processorId: uuid('processor_id').references(() => paymentProcessors.id, { onDelete: 'cascade' }).notNull(),
    transactionType: varchar('transaction_type', { length: 32 }).notNull(),
    transactionId: uuid('transaction_id').notNull(),
    transactionNo: varchar('transaction_no', { length: 80 }).notNull(),
    transactionAmount: numeric('transaction_amount', { precision: 12, scale: 2 }).notNull(),
    processingFeeTotal: numeric('processing_fee_total', { precision: 12, scale: 2 }).notNull(),
    userFeeShare: numeric('user_fee_share', { precision: 12, scale: 2 }).notNull(),
    processorFeeShare: numeric('processor_fee_share', { precision: 12, scale: 2 }).notNull(),
    userFeeStatus: varchar('user_fee_status', { length: 16 }).notNull().default('collectible'),
    userFeeCollectedAt: timestamp('user_fee_collected_at', { withTimezone: true }),
    processorFeeStatus: varchar('processor_fee_status', { length: 16 }).notNull().default('paid'),
    processorFeePaidAt: timestamp('processor_fee_paid_at', { withTimezone: true }),
    processorFeePaidVia: uuid('processor_fee_paid_via'),
    commandId: uuid('command_id'),
    notes: text('notes'),
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    processorIdx: index('processor_fees_processor_idx').on(table.processorId),
    transactionIdx: index('processor_fees_transaction_idx').on(table.transactionType, table.transactionId),
    userStatusIdx: index('processor_fees_user_status_idx').on(table.userFeeStatus),
    processorStatusIdx: index('processor_fees_processor_status_idx').on(table.processorFeeStatus),
    balanceCalcIdx: index('processor_fees_balance_calc_idx').on(table.processorId, table.userFeeStatus, table.processorFeeStatus)
  })
);

export const batchMedia = pgTable(
  'batch_media',
  {
    id: id(),
    batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'cascade' }).notNull(),
    // File information
    filePath: text('file_path').notNull(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    thumbnailPath: text('thumbnail_path'),
    mediumPath: text('medium_path'),
    // Media classification (CHECK constraints enforced in migration SQL)
    mediaType: varchar('media_type', { length: 20 }).notNull(),
    role: varchar('role', { length: 30 }).notNull().default('additional'),
    // Status & lifecycle (CHECK constraint enforced in migration SQL)
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    replacedAt: timestamp('replaced_at', { withTimezone: true }),
    replacedBy: uuid('replaced_by').references((): AnyPgColumn => batchMedia.id, { onDelete: 'set null' }),
    // Metadata
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    // Timestamps
    createdAt: now(),
    updatedAt: updated()
  },
  (table) => ({
    batchIdx: index('batch_media_batch_idx').on(table.batchId),
    statusIdx: index('batch_media_status_idx').on(table.status),
    roleIdx: index('batch_media_role_idx').on(table.role),
    replacedIdx: index('batch_media_replaced_idx')
      .on(table.replacedAt)
      .where(sql`${table.replacedAt} IS NOT NULL`),
    createdIdx: index('batch_media_created_idx').on(table.createdAt),
    uploadedByIdx: index('batch_media_uploaded_by_idx').on(table.uploadedBy),
    // Partial unique indexes ensure at most one published, non-replaced primary photo/video per batch
    primaryPhotoUnique: uniqueIndex('batch_media_primary_photo_unique')
      .on(table.batchId)
      .where(
        sql`${table.role} = 'primary_photo' AND ${table.status} = 'published' AND ${table.replacedAt} IS NULL`
      ),
    primaryVideoUnique: uniqueIndex('batch_media_primary_video_unique')
      .on(table.batchId)
      .where(
        sql`${table.role} = 'primary_video' AND ${table.status} = 'published' AND ${table.replacedAt} IS NULL`
      )
  })
);

export const mediaRetentionPolicies = pgTable('media_retention_policies', {
  id: id(),
  name: varchar('name', { length: 180 }).notNull(),
  description: text('description'),
  // CHECK constraint days_to_keep > 0 enforced in migration SQL
  daysToKeep: integer('days_to_keep').notNull(),
  // CHECK constraint applies_to IN ('draft', 'replaced') enforced in migration SQL
  appliesTo: varchar('applies_to', { length: 20 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: now(),
  updatedAt: updated()
});

export const mediaCleanupLog = pgTable('media_cleanup_log', {
  id: id(),
  policyId: uuid('policy_id').references(() => mediaRetentionPolicies.id, { onDelete: 'set null' }),
  filesDeleted: integer('files_deleted').notNull(),
  bytesFreed: bigint('bytes_freed', { mode: 'number' }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  success: boolean('success').notNull().default(true),
  errorMessage: text('error_message'),
  createdAt: now()
});

// Photo Upload Tokens — tokenized share links for photographer mobile upload
// (issue #73). See migrations/0042_photo_upload_tokens.sql and
// src/server/services/photoUploadTokens.ts for the security model.
export const photoUploadTokens = pgTable(
  'photo_upload_tokens',
  {
    id: id(),
    batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'cascade' }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    issuedBy: uuid('issued_by').references(() => users.id).notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    useCount: integer('use_count').notNull().default(0)
  },
  (table) => ({
    batchIdx: index('photo_upload_tokens_batch_idx').on(table.batchId),
    expiresIdx: index('photo_upload_tokens_expires_idx').on(table.expiresAt)
  })
);

// Issue #62: persisted customer sheet snapshots for the Sales Recent Sheets tab.
// rows_json is sanitized through src/shared/customerSheetSnapshot.ts before
// insert. Customer-facing (mode = 'catalog') snapshots must NEVER contain
// unitCost, estimatedMargin, internalMargin, or other internal-only data.
export const customerSheetSnapshots = pgTable(
  'customer_sheet_snapshots',
  {
    id: id(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
    mode: varchar('mode', { length: 16 }).notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: varchar('actor_name', { length: 180 }),
    itemCount: integer('item_count').notNull().default(0),
    rowsJson: jsonb('rows_json').$type<Array<Record<string, unknown>>>().notNull().default([]),
    notes: text('notes'),
    createdAt: now()
  },
  (table) => ({
    customerCreatedIdx: index('customer_sheet_snapshots_customer_created_idx').on(table.customerId, table.createdAt.desc())
  })
);

export type User = typeof users.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type SavedFilter = typeof savedFilters.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type SalesOrder = typeof salesOrders.$inferSelect;
export type CustomerNeed = typeof customerNeeds.$inferSelect;
export type VendorSupply = typeof vendorSupply.$inferSelect;
export type Referee = typeof referees.$inferSelect;
export type RefereeRelationship = typeof refereeRelationships.$inferSelect;
export type RefereeCredit = typeof refereeCredits.$inferSelect;
export type PaymentProcessor = typeof paymentProcessors.$inferSelect;
export type ProcessorFee = typeof processorFees.$inferSelect;

export type BatchMedia = typeof batchMedia.$inferSelect;
export type NewBatchMedia = typeof batchMedia.$inferInsert;
export type MediaRetentionPolicy = typeof mediaRetentionPolicies.$inferSelect;
export type NewMediaRetentionPolicy = typeof mediaRetentionPolicies.$inferInsert;
export type MediaCleanupLog = typeof mediaCleanupLog.$inferSelect;
export type NewMediaCleanupLog = typeof mediaCleanupLog.$inferInsert;

export type DocumentSnapshot = typeof documentSnapshots.$inferSelect;
export type NewDocumentSnapshot = typeof documentSnapshots.$inferInsert;

// ── Database Views ──────────────────────────────────────────────────────────
// Typed via Drizzle pgView for column-name visibility. Views are currently
// queried through raw pool.query() — the pgView types use Drizzle's camelCase
// column-name convention (which maps to the actual snake_case SQL columns).
// When querying via raw SQL, note that node-postgres returns bigint/numeric
// columns as strings; Drizzle-inferred types use number/string respectively.

// View: batch_media_summary (migration 0036)
export const batchMediaSummaryView = pgView('batch_media_summary', {
  batchId: uuid('batch_id').notNull(),
  batchCode: varchar('batch_code', { length: 80 }).notNull(),
  name: varchar('name', { length: 180 }).notNull(),
  publishedMediaCount: bigint('published_media_count', { mode: 'number' }).notNull(),
  draftMediaCount: bigint('draft_media_count', { mode: 'number' }).notNull(),
  totalMediaCount: bigint('total_media_count', { mode: 'number' }).notNull(),
  hasPrimaryPhoto: boolean('has_primary_photo').notNull(),
  hasPrimaryVideo: boolean('has_primary_video').notNull(),
  mediaUpdatedAt: timestamp('media_updated_at', { withTimezone: true }),
}).existing();

export type BatchMediaSummary = typeof batchMediaSummaryView.$inferSelect;

// View: batches_customer_safe (migration 0024)
export const batchesCustomerSafeView = pgView('batches_customer_safe', {
  id: uuid('id').notNull(),
  batchCode: varchar('batch_code', { length: 80 }).notNull(),
  name: varchar('name', { length: 180 }).notNull(),
  category: varchar('category', { length: 80 }).notNull(),
  subcategory: varchar('subcategory', { length: 80 }),
  tags: text('tags').array().notNull(),
  availableQty: numeric('available_qty', { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  location: varchar('location', { length: 120 }).notNull(),
  intakeDate: timestamp('intake_date', { withTimezone: true }),
  status: varchar('status', { length: 32 }).notNull(),
  photoUrl: text('photo_url'),
  mediaStatus: varchar('media_status', { length: 32 }).notNull(),
  brandName: varchar('brand_name', { length: 80 }),
  vendorName: varchar('vendor_name', { length: 80 }),
}).existing();

export type BatchesCustomerSafe = typeof batchesCustomerSafeView.$inferSelect;

// View: batches_operator (migration 0024). Selects b.* (all batches columns)
// plus joined brand/vendor names. Columns match the batches table exactly.
// CAUTION: If batches columns are added/renamed, this view picks them up
// automatically (b.*), but the TypeScript type must be updated manually.
export type BatchesOperator = Batch & {
  brandRealName: string | null;
  brandCurrentAlias: string | null;
  vendorRealName: string | null;
  vendorCurrentAlias: string | null;
};

// View: referee_summary (migration 0014)
export const refereeSummaryView = pgView('referee_summary', {
  id: uuid('id').notNull(),
  name: varchar('name', { length: 180 }).notNull(),
  email: varchar('email', { length: 240 }),
  phone: varchar('phone', { length: 80 }),
  balance: numeric('balance', { precision: 12, scale: 2 }).notNull(),
  lifetimeEarned: numeric('lifetime_earned', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 32 }),
  active: boolean('active').notNull(),
  activeRelationships: bigint('active_relationships', { mode: 'number' }).notNull(),
  unpaidCredits: bigint('unpaid_credits', { mode: 'number' }).notNull(),
  lastPayoutDate: timestamp('last_payout_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}).existing();

export type RefereeSummary = typeof refereeSummaryView.$inferSelect;

// ── Tables (continued) ──────────────────────────────────────────────────────

export const creditEngineStances = pgTable('credit_engine_stances', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull().unique(),
  description: text('description'),
  weightRevenueMomentum: integer('weight_revenue_momentum').notNull(),
  weightCashCollection: integer('weight_cash_collection').notNull(),
  weightProfitability: integer('weight_profitability').notNull(),
  weightDebtAging: integer('weight_debt_aging').notNull(),
  weightRepaymentVelocity: integer('weight_repayment_velocity').notNull(),
  weightTenureDepth: integer('weight_tenure_depth').notNull(),
  isSeeded: boolean('is_seeded').notNull().default(false),
  createdAt: now(),
  updatedAt: updated()
});

export const creditEngineConfig = pgTable('credit_engine_config', {
  id: id(),
  globalDefaultStanceId: uuid('global_default_stance_id')
    .notNull()
    .references(() => creditEngineStances.id, { onDelete: 'restrict' }),
  coldStartMinPostedInvoices: integer('cold_start_min_posted_invoices').notNull().default(3),
  coldStartMinTenureDays: integer('cold_start_min_tenure_days').notNull().default(60),
  manualOverrideReminderDefaultDays: integer('manual_override_reminder_default_days').notNull().default(60),
  manualOverrideSnoozeCapDays: integer('manual_override_snooze_cap_days').notNull().default(365),
  shadowMode: boolean('shadow_mode').notNull().default(true),
  updatedAt: updated(),
  updatedBy: uuid('updated_by').references(() => users.id)
});

export const customerCreditAssessments = pgTable('customer_credit_assessments', {
  id: id(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  stanceId: uuid('stance_id').notNull().references(() => creditEngineStances.id, { onDelete: 'restrict' }),
  scoreRevenueMomentum: integer('score_revenue_momentum').notNull(),
  scoreCashCollection: integer('score_cash_collection').notNull(),
  scoreProfitability: integer('score_profitability').notNull(),
  scoreDebtAging: integer('score_debt_aging').notNull(),
  scoreRepaymentVelocity: integer('score_repayment_velocity').notNull(),
  scoreTenureDepth: integer('score_tenure_depth').notNull(),
  confidenceRevenueMomentum: varchar('confidence_revenue_momentum', { length: 8 }).notNull(),
  confidenceCashCollection: varchar('confidence_cash_collection', { length: 8 }).notNull(),
  confidenceProfitability: varchar('confidence_profitability', { length: 8 }).notNull(),
  confidenceDebtAging: varchar('confidence_debt_aging', { length: 8 }).notNull(),
  confidenceRepaymentVelocity: varchar('confidence_repayment_velocity', { length: 8 }).notNull(),
  confidenceTenureDepth: varchar('confidence_tenure_depth', { length: 8 }).notNull(),
  overallScore: integer('overall_score').notNull(),
  baseAmount: numeric('base_amount', { precision: 12, scale: 2 }).notNull(),
  multiplier: numeric('multiplier', { precision: 5, scale: 2 }).notNull(),
  recommendedLimit: numeric('recommended_limit', { precision: 12, scale: 2 }).notNull(),
  engineMaxApplied: numeric('engine_max_applied', { precision: 12, scale: 2 }),
  finalLimit: numeric('final_limit', { precision: 12, scale: 2 }).notNull(),
  triggeredBy: varchar('triggered_by', { length: 32 }).notNull(),
  triggeredByCommandId: uuid('triggered_by_command_id').references(() => commandJournal.id),
  applied: boolean('applied').notNull(),
  idempotencyKey: text('idempotency_key').unique(),
  createdAt: now()
});

export const creditRecomputeQueue = pgTable('credit_recompute_queue', {
  // SQL column is `bigserial`. Drizzle bigserial mode 'bigint' returns it as a JS bigint
  // to avoid Number precision loss past 2^53.
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  enqueuedAt: timestamp('enqueued_at', { withTimezone: true }).notNull().defaultNow(),
  enqueuedBy: varchar('enqueued_by', { length: 64 }).notNull(),
  commandId: uuid('command_id').references(() => commandJournal.id),
  attempts: integer('attempts').notNull().default(0),
  lastAttemptedAt: timestamp('last_attempted_at', { withTimezone: true }),
  lastError: text('last_error'),
  status: varchar('status', { length: 16 }).notNull().default('pending')
});

export const creditEngineConfigHistory = pgTable('credit_engine_config_history', {
  id: id(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy: uuid('changed_by').notNull().references(() => users.id),
  commandId: uuid('command_id').references(() => commandJournal.id),
  preState: jsonb('pre_state').notNull(),
  postState: jsonb('post_state').notNull()
});

export const creditEngineStanceHistory = pgTable('credit_engine_stance_history', {
  id: id(),
  stanceId: uuid('stance_id').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy: uuid('changed_by').notNull().references(() => users.id),
  commandId: uuid('command_id').references(() => commandJournal.id),
  action: varchar('action', { length: 16 }).notNull(),
  preState: jsonb('pre_state'),
  postState: jsonb('post_state'),
  affectedCustomerCount: integer('affected_customer_count')
});

// TER-1587 (CAP-033 schema drift fix): declare composite PK so Drizzle types
// match the actual DB schema (migration 0033 defines PRIMARY KEY (user_id, banner_key)).
// GH #342: Added composite primaryKey constraint matching migration 0033 definition.
export const userDismissedBanners = pgTable('user_dismissed_banners', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bannerKey: varchar('banner_key', { length: 64 }).notNull(),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.bannerKey] })
}));

// Phase 9 — nightly safety-net audit row. One row per UTC day, UPSERTed by
// `runNightlyCreditEngineAudit`. See migrations/0040_credit_engine_daily_audit.sql.
export const creditEngineDailyAudit = pgTable('credit_engine_daily_audit', {
  day: date('day').primaryKey(),
  decisionsIssued: integer('decisions_issued').notNull().default(0),
  customersDrifted: integer('customers_drifted').notNull().default(0),
  stuckQueueItems: integer('stuck_queue_items').notNull().default(0),
  runStartedAt: timestamp('run_started_at', { withTimezone: true }).notNull(),
  runCompletedAt: timestamp('run_completed_at', { withTimezone: true }).notNull(),
  summary: jsonb('summary').notNull().default(sql`'{}'::jsonb`)
});

// Issue #18 slice 4 — nightly customers.balance reconciliation audit.
// One row per customer whose denormalized `customers.balance` drifted beyond
// the configured threshold ($0.01 default) from SUM(client_ledger_entries.amount).
// Written by `reconcileCustomerBalances` (src/server/services/balanceReconciliation.ts).
// See migrations/0045_customer_balance_reconciliation.sql.
export const customerBalanceReconciliation = pgTable('customer_balance_reconciliation', {
  id: id(),
  runId: uuid('run_id').notNull(),
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  expected: numeric('expected', { precision: 14, scale: 2 }).notNull(),
  actual: numeric('actual', { precision: 14, scale: 2 }).notNull(),
  drift: numeric('drift', { precision: 14, scale: 2 }).notNull(),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  customerIdx: index('customer_balance_recon_customer_idx').on(table.customerId, table.detectedAt),
  runIdx: index('customer_balance_recon_run_idx').on(table.runId)
}));

// ─── Contacts system (CAP-033 / TER-1564) ───────────────────────────────────
// Universal identity anchor for all entity types (customer, vendor, referee,
// processor, contractor, employee). Existing operational tables get a nullable
// `contact_id` FK; financial logic continues to read from those tables.
// See migrations/0054_contacts_system.sql.

export const contacts = pgTable('contacts', {
  id: id(),
  name: varchar('name', { length: 180 }).notNull(),
  displayName: varchar('display_name', { length: 180 }),
  phone: varchar('phone', { length: 40 }),
  secondaryPhone: varchar('secondary_phone', { length: 40 }),
  email: varchar('email', { length: 240 }),
  address: text('address'),
  companyName: varchar('company_name', { length: 180 }),
  contactKind: varchar('contact_kind', { length: 20 }).notNull().default('individual'),
  preferredContactMethod: varchar('preferred_contact_method', { length: 20 }).notNull().default('any'),
  notes: text('notes'),
  tags: text('tags').array().notNull().default([]),
  isCustomer: boolean('is_customer').notNull().default(false),
  isVendor: boolean('is_vendor').notNull().default(false),
  isReferee: boolean('is_referee').notNull().default(false),
  isProcessor: boolean('is_processor').notNull().default(false),
  isContractor: boolean('is_contractor').notNull().default(false),
  isEmployee: boolean('is_employee').notNull().default(false),
  active: boolean('active').notNull().default(true),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  archivedBy: uuid('archived_by').references(() => users.id),
  archivedReason: text('archived_reason'),
  createdAt: now(),
  updatedAt: updated()
}, (table) => ({
  nameIdx: index('contacts_name_idx').on(table.name),
  updatedAtIdx: index('contacts_updated_at_idx').on(table.updatedAt),
  // GH #341: partial index on active contacts (matches migration 0054 definition).
  activeIdx: index('contacts_active_idx').on(table.active).where(sql`${table.active} = true`),
  // GH #296: index on email for lookup and dedup queries.
  emailIdx: index('contacts_email_idx').on(table.email)
}));

export const appointments = pgTable('appointments', {
  id: id(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 240 }).notNull(),
  description: text('description'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  appointmentType: varchar('appointment_type', { length: 40 }).notNull().default('meeting'),
  status: varchar('status', { length: 32 }).notNull().default('scheduled'),
  location: text('location'),
  createdBy: uuid('created_by').references(() => users.id),
  notes: text('notes'),
  createdAt: now(),
  updatedAt: updated()
}, (table) => ({
  contactIdx: index('appointments_contact_idx').on(table.contactId),
  startsAtIdx: index('appointments_starts_at_idx').on(table.startsAt)
}));

export const contactLedgerEntries = pgTable('contact_ledger_entries', {
  id: id(),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 48 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  method: varchar('method', { length: 32 }),
  reference: varchar('reference', { length: 120 }),
  note: text('note'),
  commandId: uuid('command_id'),
  createdAt: now()
}, (table) => ({
  contactIdx: index('contact_ledger_contact_idx').on(table.contactId),
  createdAtIdx: index('contact_ledger_created_at_idx').on(table.contactId, table.createdAt)
}));

export const contactMergeCandidates = pgTable('contact_merge_candidates', {
  id: id(),
  contactAId: uuid('contact_a_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  contactBId: uuid('contact_b_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  matchReason: varchar('match_reason', { length: 80 }).notNull(),
  reviewed: boolean('reviewed').notNull().default(false),
  dismissed: boolean('dismissed').notNull().default(false),
  mergedInto: uuid('merged_into').references(() => contacts.id),
  createdAt: now()
}, (table) => ({
  pairUnique: uniqueIndex('contact_merge_candidates_pair_unique_idx').on(table.contactAId, table.contactBId)
}));

