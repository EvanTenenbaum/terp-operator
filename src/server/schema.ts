import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable('organizations', {
  id: id(),
  name: varchar('name', { length: 180 }).notNull(),
  createdAt: now(),
  updatedAt: updated()
});

export const users = pgTable('users', {
  id: id(),
  name: varchar('name', { length: 160 }).notNull(),
  email: varchar('email', { length: 240 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 32 }).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'restrict' }),
  active: boolean('active').notNull().default(true),
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
  createdAt: now(),
  updatedAt: updated()
});

export const brands = pgTable('brands', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull(),
  alias: varchar('alias', { length: 80 }).notNull().default('Brand TBD'),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
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
  notes: text('notes'),
  createdAt: now(),
  updatedAt: updated()
});

export const savedFilters = pgTable('saved_filters', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
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
  createdAt: now(),
  updatedAt: updated()
});

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: id(),
    poNo: varchar('po_no', { length: 80 }).notNull().unique(),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
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
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'set null' }),
    purchaseOrderLineId: uuid('purchase_order_line_id').references(() => purchaseOrderLines.id, { onDelete: 'set null' }),
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
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'set null' }),
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
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
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
  status: varchar('status', { length: 32 }).notNull().default('draft'),
  createdAt: now(),
  updatedAt: updated()
});

export const invoices = pgTable('invoices', {
  id: id(),
  invoiceNo: varchar('invoice_no', { length: 80 }).notNull().unique(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  orderId: uuid('order_id').references(() => salesOrders.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 32 }).notNull().default('open'),
  total: numeric('total', { precision: 12, scale: 2 }).notNull(),
  amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  createdAt: now(),
  updatedAt: updated()
});

export const payments = pgTable('payments', {
  id: id(),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
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
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  createdAt: now()
});

export const vendorBills = pgTable('vendor_bills', {
  id: id(),
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'set null' }),
  purchaseReceiptId: uuid('purchase_receipt_id').references(() => purchaseReceipts.id, { onDelete: 'set null' }),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'set null' }),
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
    reversedByCommandId: uuid('reversed_by_command_id'),
    createdAt: now()
  },
  (table) => ({
    idempotencyIdx: uniqueIndex('command_journal_idempotency_idx').on(table.idempotencyKey),
    commandIdx: index('command_journal_command_idx').on(table.commandName),
    actorIdx: index('command_journal_actor_idx').on(table.actorId)
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

export type Organization = typeof organizations.$inferSelect;
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

// View: batch_media_summary (migration 0036). Queried via raw pool.query() in
// Phase D tRPC routes; no pgTable definition needed for views. Counts are
// returned as strings by node-postgres because COUNT() yields bigint in PG.
export type BatchMediaSummary = {
  batch_id: string;
  batch_code: string;
  name: string;
  published_media_count: string;
  draft_media_count: string;
  total_media_count: string;
  has_primary_photo: boolean;
  has_primary_video: boolean;
  media_updated_at: Date | null;
};
