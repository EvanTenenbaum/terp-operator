/**
 * Entity Column Map — Frontend field name → database column name.
 *
 * Purpose: Maps frontend field names (used in entity-schemas.ts and grid row
 * objects) to server-side database column names for server-side filtering,
 * sorting, and SQL generation.
 *
 * ARCH-9: All filtering is server-side. The server must know which database
 * column each frontend field maps to for safe WHERE clause generation.
 *
 * Every field listed in entity-schemas.ts that originates from a DB column
 * MUST have a mapping here. Computed/derived fields (e.g. 'vendorName' from
 * a JOIN) are documented with their derivation.
 */

// ─── Architecture Compliance Checklist ──────────────────────────────────────
// [ ] No per-view ColDef arrays — all definitions originate here
// [ ] No inline cell renderers — use stable components
// [ ] No per-view StatusActionTable — state machine governs visibility
// [ ] No direct db queries — all data through tRPC
// [ ] No new Zustand stores — useUiStore only
// ─────────────────────────────────────────────────────────────────────────────

// ─── Column mapping type ────────────────────────────────────────────────────

export interface ColumnMapping {
  /** Frontend field name (matches FieldDefinition.field in entity-schemas.ts). */
  field: string;
  /** Database column expression. For direct columns: `table.column`. */
  column: string;
  /** SQL type hint for the server filter engine. */
  sqlType: 'text' | 'numeric' | 'timestamp' | 'uuid' | 'boolean' | 'text[]';
  /** If true, this is a derived/computed field — column is the SQL expression. */
  derived?: boolean;
}

export interface EntityColumnMap {
  entity: string;
  /** Database table identifier. */
  table: string;
  /** Table alias used in the grid SQL query. */
  alias: string;
  /** Frontend field → DB column mappings. */
  columns: ColumnMapping[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY COLUMN MAPS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PurchaseOrder (worked example) ─────────────────────────────────────────
//
// Source table: purchase_orders (see src/server/schema.ts:178)
// Table alias in grid SQL: po
//
// The grid SQL joins vendors for vendorName:
//   LEFT JOIN vendors v ON v.id = po.vendor_id

export const purchaseOrderColumnMap: EntityColumnMap = {
  entity: 'purchaseOrder',
  table: 'purchase_orders',
  alias: 'po',
  columns: [
    // ── Direct columns (table.column match) ──
    { field: 'id',              column: 'po.id',              sqlType: 'uuid' },
    { field: 'poNo',            column: 'po.po_no',           sqlType: 'text' },
    { field: 'status',          column: 'po.status',          sqlType: 'text' },
    { field: 'total',           column: 'po.total',           sqlType: 'numeric' },
    { field: 'expectedDate',    column: 'po.expected_date',   sqlType: 'timestamp' },
    { field: 'orderedAt',       column: 'po.ordered_at',      sqlType: 'timestamp' },
    { field: 'receivedAt',      column: 'po.received_at',     sqlType: 'timestamp' },
    { field: 'cancelledAt',     column: 'po.cancelled_at',    sqlType: 'timestamp' },
    { field: 'finalizedAt',     column: 'po.finalized_at',    sqlType: 'timestamp' },
    { field: 'paymentTerms',    column: 'po.payment_terms',   sqlType: 'text' },
    { field: 'prepaymentAmount',column: 'po.prepayment_amount',sqlType: 'numeric' },
    { field: 'orderedBy',       column: 'po.ordered_by',      sqlType: 'uuid' },
    { field: 'buyerNotes',      column: 'po.buyer_notes',     sqlType: 'text' },
    { field: 'internalNotes',   column: 'po.internal_notes',  sqlType: 'text' },
    { field: 'externalNotes',   column: 'po.external_notes',  sqlType: 'text' },
    { field: 'vendorId',        column: 'po.vendor_id',       sqlType: 'uuid' },
    { field: 'refereeRelationshipId', column: 'po.referee_relationship_id', sqlType: 'uuid' },
    { field: 'refereeCreditAmount',   column: 'po.referee_credit_amount',   sqlType: 'numeric' },
    { field: 'createdAt',       column: 'po.created_at',      sqlType: 'timestamp' },
    { field: 'updatedAt',       column: 'po.updated_at',      sqlType: 'timestamp' },

    // ── Derived/computed columns (from JOINs) ──
    { field: 'vendorName',      column: 'v.name',             sqlType: 'text', derived: true },
  ],
};

// ─── Sale (SalesOrder) ──────────────────────────────────────────────────────
// Source table: sales_orders (schema.ts:336), alias: so
// JOINs: customers cus ON cus.id = so.customer_id

export const saleColumnMap: EntityColumnMap = {
  entity: 'sale',
  table: 'sales_orders',
  alias: 'so',
  columns: [
    { field: 'id',                     column: 'so.id',                       sqlType: 'uuid' },
    { field: 'orderNo',                column: 'so.order_no',                 sqlType: 'text' },
    { field: 'customerId',             column: 'so.customer_id',              sqlType: 'uuid' },
    { field: 'status',                 column: 'so.status',                   sqlType: 'text' },
    { field: 'pricingStrategy',        column: 'so.pricing_strategy',         sqlType: 'text' },
    { field: 'internalMargin',         column: 'so.internal_margin',          sqlType: 'numeric' },
    { field: 'total',                  column: 'so.total',                    sqlType: 'numeric' },
    { field: 'deliveryWindow',         column: 'so.delivery_window',          sqlType: 'text' },
    { field: 'notes',                  column: 'so.notes',                    sqlType: 'text' },
    { field: 'packed',                 column: 'so.packed',                   sqlType: 'boolean' },
    { field: 'inventoryPosted',        column: 'so.inventory_posted',         sqlType: 'boolean' },
    { field: 'paymentFollowup',        column: 'so.payment_followup',         sqlType: 'boolean' },
    { field: 'legacyStatusMarkers',    column: 'so.legacy_status_markers',    sqlType: 'text' },
    { field: 'validationIssues',       column: 'so.validation_issues',        sqlType: 'text[]' },
    { field: 'refereeRelationshipId',  column: 'so.referee_relationship_id',  sqlType: 'uuid' },
    { field: 'refereeCreditAmount',    column: 'so.referee_credit_amount',    sqlType: 'numeric' },
    { field: 'vendorApprovalPending',  column: 'so.vendor_approval_pending',  sqlType: 'boolean' },
    { field: 'marginWaivedTotal',      column: 'so.margin_waived_total',      sqlType: 'numeric' },
    { field: 'lossRecognizedTotal',    column: 'so.loss_recognized_total',    sqlType: 'numeric' },
    { field: 'postedAt',               column: 'so.posted_at',                sqlType: 'timestamp' },
    { field: 'fulfilledAt',            column: 'so.fulfilled_at',             sqlType: 'timestamp' },
    { field: 'archivedAt',             column: 'so.archived_at',              sqlType: 'timestamp' },
    { field: 'createdAt',              column: 'so.created_at',               sqlType: 'timestamp' },
    { field: 'updatedAt',              column: 'so.updated_at',               sqlType: 'timestamp' },
    // Derived
    { field: 'customerName',           column: 'cus.name',                    sqlType: 'text', derived: true },
  ],
};

// ─── Intake (Batch) ─────────────────────────────────────────────────────────
// Source table: batches (schema.ts:245), alias: b
// JOINs: vendors v ON v.id = b.vendor_id, items i ON i.id = b.item_id

export const intakeColumnMap: EntityColumnMap = {
  entity: 'intake',
  table: 'batches',
  alias: 'b',
  columns: [
    { field: 'id',                   column: 'b.id',                     sqlType: 'uuid' },
    { field: 'itemId',               column: 'b.item_id',                sqlType: 'uuid' },
    { field: 'vendorId',             column: 'b.vendor_id',              sqlType: 'uuid' },
    { field: 'brandId',              column: 'b.brand_id',               sqlType: 'uuid' },
    { field: 'purchaseOrderId',      column: 'b.purchase_order_id',      sqlType: 'uuid' },
    { field: 'purchaseOrderLineId',  column: 'b.purchase_order_line_id', sqlType: 'uuid' },
    { field: 'batchCode',            column: 'b.batch_code',             sqlType: 'text' },
    { field: 'sourceCode',           column: 'b.source_code',            sqlType: 'text' },
    { field: 'shorthand',            column: 'b.shorthand',              sqlType: 'text' },
    { field: 'name',                 column: 'b.name',                   sqlType: 'text' },
    { field: 'category',             column: 'b.category',               sqlType: 'text' },
    { field: 'subcategory',          column: 'b.subcategory',            sqlType: 'text' },
    { field: 'brandAlias',           column: 'b.brand_alias',            sqlType: 'text' },
    { field: 'vendorAlias',          column: 'b.vendor_alias',           sqlType: 'text' },
    { field: 'tags',                 column: 'b.tags',                   sqlType: 'text[]' },
    { field: 'intakeQty',            column: 'b.intake_qty',             sqlType: 'numeric' },
    { field: 'availableQty',         column: 'b.available_qty',          sqlType: 'numeric' },
    { field: 'reservedQty',          column: 'b.reserved_qty',           sqlType: 'numeric' },
    { field: 'uom',                  column: 'b.uom',                    sqlType: 'text' },
    { field: 'unitCost',             column: 'b.unit_cost',              sqlType: 'numeric' },
    { field: 'unitPrice',            column: 'b.unit_price',             sqlType: 'numeric' },
    { field: 'location',             column: 'b.location',               sqlType: 'text' },
    { field: 'lotCode',              column: 'b.lot_code',               sqlType: 'text' },
    { field: 'intakeDate',           column: 'b.intake_date',            sqlType: 'timestamp' },
    { field: 'ticketCost',           column: 'b.ticket_cost',            sqlType: 'numeric' },
    { field: 'priceRange',           column: 'b.price_range',            sqlType: 'text' },
    { field: 'notes',                column: 'b.notes',                  sqlType: 'text' },
    { field: 'legacyMarker',         column: 'b.legacy_marker',          sqlType: 'text' },
    { field: 'expirationDate',       column: 'b.expiration_date',        sqlType: 'timestamp' },
    { field: 'ownershipStatus',      column: 'b.ownership_status',       sqlType: 'text' },
    { field: 'arrivalConfirmed',     column: 'b.arrival_confirmed',      sqlType: 'boolean' },
    { field: 'arrivalStatus',        column: 'b.arrival_status',         sqlType: 'text' },
    { field: 'validationIssues',     column: 'b.validation_issues',      sqlType: 'text[]' },
    { field: 'mediaStatus',          column: 'b.media_status',           sqlType: 'text' },
    { field: 'status',               column: 'b.status',                 sqlType: 'text' },
    { field: 'sortId',               column: 'b.sort_id',                sqlType: 'numeric' },
    { field: 'photoUrl',             column: 'b.photo_url',              sqlType: 'text' },
    { field: 'casePack',             column: 'b.case_pack',              sqlType: 'numeric' },
    { field: 'postedAt',             column: 'b.posted_at',              sqlType: 'timestamp' },
    { field: 'archivedAt',           column: 'b.archived_at',            sqlType: 'timestamp' },
    { field: 'createdAt',            column: 'b.created_at',             sqlType: 'timestamp' },
    { field: 'updatedAt',            column: 'b.updated_at',             sqlType: 'timestamp' },
    // Derived
    { field: 'vendorName',           column: 'v.name',                   sqlType: 'text', derived: true },
    { field: 'itemName',             column: 'i.name',                   sqlType: 'text', derived: true },
  ],
};

// ─── Vendor ─────────────────────────────────────────────────────────────────
// Source table: vendors (schema.ts:45), alias: v

export const vendorColumnMap: EntityColumnMap = {
  entity: 'vendor',
  table: 'vendors',
  alias: 'v',
  columns: [
    { field: 'id',                 column: 'v.id',                   sqlType: 'uuid' },
    { field: 'name',               column: 'v.name',                 sqlType: 'text' },
    { field: 'alias',              column: 'v.alias',                sqlType: 'text' },
    { field: 'termsDays',          column: 'v.terms_days',           sqlType: 'numeric' },
    { field: 'consignmentDefault', column: 'v.consignment_default',  sqlType: 'boolean' },
    { field: 'contact',            column: 'v.contact',              sqlType: 'text' },
    { field: 'notes',              column: 'v.notes',                sqlType: 'text' },
    { field: 'contactId',          column: 'v.contact_id',           sqlType: 'uuid' },
    { field: 'createdAt',          column: 'v.created_at',           sqlType: 'timestamp' },
    { field: 'updatedAt',          column: 'v.updated_at',           sqlType: 'timestamp' },
  ],
};

// ─── Customer ───────────────────────────────────────────────────────────────
// Source table: customers (schema.ts:78), alias: c

export const customerColumnMap: EntityColumnMap = {
  entity: 'customer',
  table: 'customers',
  alias: 'c',
  columns: [
    { field: 'id',                       column: 'c.id',                          sqlType: 'uuid' },
    { field: 'name',                     column: 'c.name',                        sqlType: 'text' },
    { field: 'creditLimit',              column: 'c.credit_limit',                sqlType: 'numeric' },
    { field: 'balance',                  column: 'c.balance',                     sqlType: 'numeric' },
    { field: 'tags',                     column: 'c.tags',                        sqlType: 'text[]' },
    { field: 'pricingRule',              column: 'c.pricing_rule',                sqlType: 'text' },
    { field: 'notes',                    column: 'c.notes',                       sqlType: 'text' },
    { field: 'engineMax',                column: 'c.engine_max',                  sqlType: 'numeric' },
    { field: 'stanceId',                 column: 'c.stance_id',                   sqlType: 'uuid' },
    { field: 'creditLimitSource',        column: 'c.credit_limit_source',         sqlType: 'text' },
    { field: 'engineEnabled',            column: 'c.engine_enabled',              sqlType: 'boolean' },
    { field: 'engineDisabledAt',         column: 'c.engine_disabled_at',          sqlType: 'timestamp' },
    { field: 'engineDisabledBy',         column: 'c.engine_disabled_by',          sqlType: 'uuid' },
    { field: 'engineDisabledReason',     column: 'c.engine_disabled_reason',      sqlType: 'text' },
    { field: 'lastAssessmentId',         column: 'c.last_assessment_id',          sqlType: 'uuid' },
    { field: 'creditLimitManualSetAt',   column: 'c.credit_limit_manual_set_at',  sqlType: 'timestamp' },
    { field: 'creditLimitManualSetBy',   column: 'c.credit_limit_manual_set_by',  sqlType: 'uuid' },
    { field: 'creditLimitManualReason',  column: 'c.credit_limit_manual_reason',  sqlType: 'text' },
    { field: 'creditLimitReminderDays',  column: 'c.credit_limit_reminder_days',  sqlType: 'numeric' },
    { field: 'creditLimitLastReviewedAt', column: 'c.credit_limit_last_reviewed_at', sqlType: 'timestamp' },
    { field: 'creditLimitSnoozeCount',   column: 'c.credit_limit_snooze_count',   sqlType: 'numeric' },
    { field: 'contactId',                column: 'c.contact_id',                  sqlType: 'uuid' },
    { field: 'createdAt',                column: 'c.created_at',                  sqlType: 'timestamp' },
    { field: 'updatedAt',                column: 'c.updated_at',                  sqlType: 'timestamp' },
  ],
};

// ─── Payment ─────────────────────────────────────────────────────────────────
// Source table: payments (schema.ts:420), alias: p
// JOINs: customers cus ON cus.id = p.customer_id

export const paymentColumnMap: EntityColumnMap = {
  entity: 'payment',
  table: 'payments',
  alias: 'p',
  columns: [
    { field: 'id',              column: 'p.id',                sqlType: 'uuid' },
    { field: 'customerId',      column: 'p.customer_id',       sqlType: 'uuid' },
    { field: 'method',          column: 'p.method',            sqlType: 'text' },
    { field: 'amount',          column: 'p.amount',            sqlType: 'numeric' },
    { field: 'unappliedAmount', column: 'p.unapplied_amount',  sqlType: 'numeric' },
    { field: 'reference',       column: 'p.reference',         sqlType: 'text' },
    { field: 'locationBucket',  column: 'p.location_bucket',   sqlType: 'text' },
    { field: 'notes',           column: 'p.notes',             sqlType: 'text' },
    { field: 'direction',       column: 'p.direction',         sqlType: 'text' },
    { field: 'category',        column: 'p.category',          sqlType: 'text' },
    { field: 'allocationIntent',column: 'p.allocation_intent', sqlType: 'text' },
    { field: 'impactPreview',   column: 'p.impact_preview',    sqlType: 'text' },
    { field: 'status',          column: 'p.status',            sqlType: 'text' },
    { field: 'createdAt',       column: 'p.created_at',        sqlType: 'timestamp' },
    { field: 'updatedAt',       column: 'p.updated_at',        sqlType: 'timestamp' },
    // Derived
    { field: 'customerName',    column: 'cus.name',            sqlType: 'text', derived: true },
  ],
};

// ─── Invoice ─────────────────────────────────────────────────────────────────
// Source table: invoices (schema.ts:403), alias: inv
// JOINs: customers cus ON cus.id = inv.customer_id

export const invoiceColumnMap: EntityColumnMap = {
  entity: 'invoice',
  table: 'invoices',
  alias: 'inv',
  columns: [
    { field: 'id',           column: 'inv.id',            sqlType: 'uuid' },
    { field: 'invoiceNo',    column: 'inv.invoice_no',    sqlType: 'text' },
    { field: 'customerId',   column: 'inv.customer_id',   sqlType: 'uuid' },
    { field: 'orderId',      column: 'inv.order_id',      sqlType: 'uuid' },
    { field: 'status',       column: 'inv.status',        sqlType: 'text' },
    { field: 'total',        column: 'inv.total',         sqlType: 'numeric' },
    { field: 'amountPaid',   column: 'inv.amount_paid',   sqlType: 'numeric' },
    { field: 'dueDate',      column: 'inv.due_date',      sqlType: 'timestamp' },
    { field: 'createdAt',    column: 'inv.created_at',    sqlType: 'timestamp' },
    { field: 'updatedAt',    column: 'inv.updated_at',    sqlType: 'timestamp' },
    // Derived
    { field: 'customerName', column: 'cus.name',          sqlType: 'text', derived: true },
  ],
};

// ─── VendorBill ──────────────────────────────────────────────────────────────
// Source table: vendor_bills (schema.ts:451), alias: vb
// JOINs: vendors v ON v.id = vb.vendor_id

export const vendorBillColumnMap: EntityColumnMap = {
  entity: 'vendorBill',
  table: 'vendor_bills',
  alias: 'vb',
  columns: [
    { field: 'id',                  column: 'vb.id',                    sqlType: 'uuid' },
    { field: 'vendorId',            column: 'vb.vendor_id',             sqlType: 'uuid' },
    { field: 'purchaseReceiptId',   column: 'vb.purchase_receipt_id',   sqlType: 'uuid' },
    { field: 'purchaseOrderId',     column: 'vb.purchase_order_id',     sqlType: 'uuid' },
    { field: 'billNo',              column: 'vb.bill_no',               sqlType: 'text' },
    { field: 'amount',              column: 'vb.amount',                sqlType: 'numeric' },
    { field: 'amountPaid',          column: 'vb.amount_paid',           sqlType: 'numeric' },
    { field: 'dueDate',             column: 'vb.due_date',              sqlType: 'timestamp' },
    { field: 'status',              column: 'vb.status',                sqlType: 'text' },
    { field: 'scheduledFor',        column: 'vb.scheduled_for',         sqlType: 'timestamp' },
    { field: 'termsDays',           column: 'vb.terms_days',            sqlType: 'numeric' },
    { field: 'consignmentTriggered',column: 'vb.consignment_triggered', sqlType: 'boolean' },
    { field: 'dueReason',           column: 'vb.due_reason',            sqlType: 'text' },
    { field: 'discrepancyNotes',    column: 'vb.discrepancy_notes',     sqlType: 'text' },
    { field: 'createdAt',           column: 'vb.created_at',            sqlType: 'timestamp' },
    { field: 'updatedAt',           column: 'vb.updated_at',            sqlType: 'timestamp' },
    // Derived
    { field: 'vendorName',          column: 'v.name',                   sqlType: 'text', derived: true },
  ],
};

// ─── VendorPayment ───────────────────────────────────────────────────────────
// Source table: vendor_payments (schema.ts:476), alias: vp

export const vendorPaymentColumnMap: EntityColumnMap = {
  entity: 'vendorPayment',
  table: 'vendor_payments',
  alias: 'vp',
  columns: [
    { field: 'id',               column: 'vp.id',                 sqlType: 'uuid' },
    { field: 'vendorBillId',     column: 'vp.vendor_bill_id',     sqlType: 'uuid' },
    { field: 'purchaseOrderId',  column: 'vp.purchase_order_id',  sqlType: 'uuid' },
    { field: 'amount',           column: 'vp.amount',             sqlType: 'numeric' },
    { field: 'method',           column: 'vp.method',             sqlType: 'text' },
    { field: 'reference',        column: 'vp.reference',          sqlType: 'text' },
    { field: 'status',           column: 'vp.status',             sqlType: 'text' },
    { field: 'createdAt',        column: 'vp.created_at',         sqlType: 'timestamp' },
  ],
};

// ─── PaymentAllocation ───────────────────────────────────────────────────────
// Source table: payment_allocations (schema.ts:440), alias: pa

export const paymentAllocationColumnMap: EntityColumnMap = {
  entity: 'paymentAllocation',
  table: 'payment_allocations',
  alias: 'pa',
  columns: [
    { field: 'id',          column: 'pa.id',           sqlType: 'uuid' },
    { field: 'paymentId',   column: 'pa.payment_id',   sqlType: 'uuid' },
    { field: 'invoiceId',   column: 'pa.invoice_id',   sqlType: 'uuid' },
    { field: 'amount',      column: 'pa.amount',       sqlType: 'numeric' },
    { field: 'createdAt',   column: 'pa.created_at',   sqlType: 'timestamp' },
  ],
};

// ─── PurchaseOrderLine ───────────────────────────────────────────────────────
// Source table: purchase_order_lines (schema.ts:211), alias: pol

export const purchaseOrderLineColumnMap: EntityColumnMap = {
  entity: 'purchaseOrderLine',
  table: 'purchase_order_lines',
  alias: 'pol',
  columns: [
    { field: 'id',               column: 'pol.id',                 sqlType: 'uuid' },
    { field: 'purchaseOrderId',  column: 'pol.purchase_order_id',  sqlType: 'uuid' },
    { field: 'itemId',           column: 'pol.item_id',            sqlType: 'uuid' },
    { field: 'productName',      column: 'pol.product_name',       sqlType: 'text' },
    { field: 'category',         column: 'pol.category',           sqlType: 'text' },
    { field: 'subcategory',      column: 'pol.subcategory',        sqlType: 'text' },
    { field: 'tags',             column: 'pol.tags',               sqlType: 'text[]' },
    { field: 'qty',              column: 'pol.qty',                sqlType: 'numeric' },
    { field: 'receivedQty',      column: 'pol.received_qty',       sqlType: 'numeric' },
    { field: 'uom',              column: 'pol.uom',                sqlType: 'text' },
    { field: 'unitCost',         column: 'pol.unit_cost',          sqlType: 'numeric' },
    { field: 'unitPrice',        column: 'pol.unit_price',         sqlType: 'numeric' },
    { field: 'costRangeLow',     column: 'pol.cost_range_low',     sqlType: 'numeric' },
    { field: 'costRangeHigh',    column: 'pol.cost_range_high',    sqlType: 'numeric' },
    { field: 'sourceCode',       column: 'pol.source_code',        sqlType: 'text' },
    { field: 'shorthand',        column: 'pol.shorthand',          sqlType: 'text' },
    { field: 'legacyMarker',     column: 'pol.legacy_marker',      sqlType: 'text' },
    { field: 'ownershipStatus',  column: 'pol.ownership_status',   sqlType: 'text' },
    { field: 'notes',            column: 'pol.notes',              sqlType: 'text' },
    { field: 'internalNotes',    column: 'pol.internal_notes',     sqlType: 'text' },
    { field: 'externalNotes',    column: 'pol.external_notes',     sqlType: 'text' },
    { field: 'status',           column: 'pol.status',             sqlType: 'text' },
    { field: 'createdAt',        column: 'pol.created_at',         sqlType: 'timestamp' },
    { field: 'updatedAt',        column: 'pol.updated_at',         sqlType: 'timestamp' },
  ],
};

// ─── SalesOrderLine ──────────────────────────────────────────────────────────
// Source table: sales_order_lines (schema.ts:365), alias: sol

export const salesOrderLineColumnMap: EntityColumnMap = {
  entity: 'salesOrderLine',
  table: 'sales_order_lines',
  alias: 'sol',
  columns: [
    { field: 'id',                  column: 'sol.id',                    sqlType: 'uuid' },
    { field: 'orderId',             column: 'sol.order_id',              sqlType: 'uuid' },
    { field: 'batchId',             column: 'sol.batch_id',              sqlType: 'uuid' },
    { field: 'itemName',            column: 'sol.item_name',             sqlType: 'text' },
    { field: 'displayName',         column: 'sol.display_name',          sqlType: 'text' },
    { field: 'qty',                 column: 'sol.qty',                   sqlType: 'numeric' },
    { field: 'unitPrice',           column: 'sol.unit_price',            sqlType: 'numeric' },
    { field: 'unitCost',            column: 'sol.unit_cost',             sqlType: 'numeric' },
    { field: 'sourceRowKey',        column: 'sol.source_row_key',        sqlType: 'text' },
    { field: 'unresolvedSourceText',column: 'sol.unresolved_source_text',sqlType: 'text' },
    { field: 'legacyStatusMarker',  column: 'sol.legacy_status_marker',  sqlType: 'text' },
    { field: 'packed',              column: 'sol.packed',                sqlType: 'boolean' },
    { field: 'inventoryPosted',     column: 'sol.inventory_posted',      sqlType: 'boolean' },
    { field: 'paymentFollowup',     column: 'sol.payment_followup',      sqlType: 'boolean' },
    { field: 'validationIssues',    column: 'sol.validation_issues',     sqlType: 'text[]' },
    { field: 'unitCostResolved',    column: 'sol.unit_cost_resolved',    sqlType: 'boolean' },
    { field: 'landedCostBasis',     column: 'sol.landed_cost_basis',     sqlType: 'text' },
    { field: 'landedCostReason',    column: 'sol.landed_cost_reason',    sqlType: 'text' },
    { field: 'priceFloor',          column: 'sol.price_floor',           sqlType: 'numeric' },
    { field: 'belowFloorReason',    column: 'sol.below_floor_reason',    sqlType: 'text' },
    { field: 'belowFloorNote',      column: 'sol.below_floor_note',      sqlType: 'text' },
    { field: 'vendorApprovalState', column: 'sol.vendor_approval_state', sqlType: 'text' },
    { field: 'status',              column: 'sol.status',                sqlType: 'text' },
    { field: 'pickReleasedAt',      column: 'sol.pick_released_at',      sqlType: 'timestamp' },
    { field: 'pickReleasedBy',      column: 'sol.pick_released_by',      sqlType: 'uuid' },
    { field: 'createdAt',           column: 'sol.created_at',            sqlType: 'timestamp' },
    { field: 'updatedAt',           column: 'sol.updated_at',            sqlType: 'timestamp' },
  ],
};

// ─── PickList ────────────────────────────────────────────────────────────────
// Source table: pick_lists (schema.ts:487), alias: pl

export const pickListColumnMap: EntityColumnMap = {
  entity: 'pickList',
  table: 'pick_lists',
  alias: 'pl',
  columns: [
    { field: 'id',            column: 'pl.id',             sqlType: 'uuid' },
    { field: 'pickNo',        column: 'pl.pick_no',        sqlType: 'text' },
    { field: 'orderId',       column: 'pl.order_id',       sqlType: 'uuid' },
    { field: 'status',        column: 'pl.status',         sqlType: 'text' },
    { field: 'assignedTo',    column: 'pl.assigned_to',    sqlType: 'uuid' },
    { field: 'labelFormat',   column: 'pl.label_format',   sqlType: 'text' },
    { field: 'unitsPerBag',   column: 'pl.units_per_bag',  sqlType: 'numeric' },
    { field: 'labelsPrinted', column: 'pl.labels_printed', sqlType: 'boolean' },
    { field: 'manifestPath',  column: 'pl.manifest_path',  sqlType: 'text' },
    { field: 'tracking',      column: 'pl.tracking',       sqlType: 'text' },
    { field: 'createdAt',     column: 'pl.created_at',     sqlType: 'timestamp' },
    { field: 'updatedAt',     column: 'pl.updated_at',     sqlType: 'timestamp' },
  ],
};

// ─── FulfillmentLine ─────────────────────────────────────────────────────────
// Source table: fulfillment_lines (schema.ts:502), alias: fl

export const fulfillmentLineColumnMap: EntityColumnMap = {
  entity: 'fulfillmentLine',
  table: 'fulfillment_lines',
  alias: 'fl',
  columns: [
    { field: 'id',              column: 'fl.id',                sqlType: 'uuid' },
    { field: 'pickListId',      column: 'fl.pick_list_id',      sqlType: 'uuid' },
    { field: 'orderLineId',     column: 'fl.order_line_id',     sqlType: 'uuid' },
    { field: 'batchId',         column: 'fl.batch_id',          sqlType: 'uuid' },
    { field: 'expectedQty',     column: 'fl.expected_qty',      sqlType: 'numeric' },
    { field: 'actualQty',       column: 'fl.actual_qty',        sqlType: 'numeric' },
    { field: 'actualWeight',    column: 'fl.actual_weight',     sqlType: 'numeric' },
    { field: 'bagCode',         column: 'fl.bag_code',          sqlType: 'text' },
    { field: 'status',          column: 'fl.status',            sqlType: 'text' },
    { field: 'warehouseAlerts', column: 'fl.warehouse_alerts',  sqlType: 'text[]' },
    { field: 'statusExtended',  column: 'fl.status_extended',   sqlType: 'text' },
    { field: 'createdAt',       column: 'fl.created_at',        sqlType: 'timestamp' },
    { field: 'updatedAt',       column: 'fl.updated_at',        sqlType: 'timestamp' },
  ],
};

// ─── Item ────────────────────────────────────────────────────────────────────
// Source table: items (schema.ts:164), alias: i

export const itemColumnMap: EntityColumnMap = {
  entity: 'item',
  table: 'items',
  alias: 'i',
  columns: [
    { field: 'id',          column: 'i.id',           sqlType: 'uuid' },
    { field: 'sku',         column: 'i.sku',          sqlType: 'text' },
    { field: 'name',        column: 'i.name',         sqlType: 'text' },
    { field: 'alias',       column: 'i.alias',        sqlType: 'text' },
    { field: 'category',    column: 'i.category',     sqlType: 'text' },
    { field: 'tags',        column: 'i.tags',         sqlType: 'text[]' },
    { field: 'pricingRule', column: 'i.pricing_rule', sqlType: 'text' },
    { field: 'status',      column: 'i.status',       sqlType: 'text' },
    { field: 'description', column: 'i.description',  sqlType: 'text' },
    { field: 'createdAt',   column: 'i.created_at',   sqlType: 'timestamp' },
    { field: 'updatedAt',   column: 'i.updated_at',   sqlType: 'timestamp' },
  ],
};

// ─── Brand ───────────────────────────────────────────────────────────────────
// Source table: brands (schema.ts:59), alias: br
// JOINs: vendors v ON v.id = br.vendor_id

export const brandColumnMap: EntityColumnMap = {
  entity: 'brand',
  table: 'brands',
  alias: 'br',
  columns: [
    { field: 'id',         column: 'br.id',          sqlType: 'uuid' },
    { field: 'name',       column: 'br.name',        sqlType: 'text' },
    { field: 'alias',      column: 'br.alias',       sqlType: 'text' },
    { field: 'notes',      column: 'br.notes',       sqlType: 'text' },
    { field: 'active',     column: 'br.active',      sqlType: 'boolean' },
    { field: 'vendorId',   column: 'br.vendor_id',   sqlType: 'uuid' },
    { field: 'createdBy',  column: 'br.created_by',  sqlType: 'uuid' },
    { field: 'updatedBy',  column: 'br.updated_by',  sqlType: 'uuid' },
    { field: 'deletedAt',  column: 'br.deleted_at',  sqlType: 'timestamp' },
    { field: 'deletedBy',  column: 'br.deleted_by',  sqlType: 'uuid' },
    { field: 'createdAt',  column: 'br.created_at',  sqlType: 'timestamp' },
    { field: 'updatedAt',  column: 'br.updated_at',  sqlType: 'timestamp' },
    // Derived
    { field: 'vendorName', column: 'v.name',         sqlType: 'text', derived: true },
  ],
};

// ─── CustomerNeed ────────────────────────────────────────────────────────────
// Source table: customer_needs (schema.ts:533), alias: cn
// JOINs: customers cus ON cus.id = cn.customer_id

export const customerNeedColumnMap: EntityColumnMap = {
  entity: 'customerNeed',
  table: 'customer_needs',
  alias: 'cn',
  columns: [
    { field: 'id',           column: 'cn.id',            sqlType: 'uuid' },
    { field: 'needCode',     column: 'cn.need_code',     sqlType: 'text' },
    { field: 'customerId',   column: 'cn.customer_id',   sqlType: 'uuid' },
    { field: 'productName',  column: 'cn.product_name',  sqlType: 'text' },
    { field: 'category',     column: 'cn.category',      sqlType: 'text' },
    { field: 'subcategory',  column: 'cn.subcategory',   sqlType: 'text' },
    { field: 'tags',         column: 'cn.tags',          sqlType: 'text[]' },
    { field: 'qtyMin',       column: 'cn.qty_min',       sqlType: 'numeric' },
    { field: 'qtyMax',       column: 'cn.qty_max',       sqlType: 'numeric' },
    { field: 'targetPrice',  column: 'cn.target_price',  sqlType: 'numeric' },
    { field: 'neededBy',     column: 'cn.needed_by',     sqlType: 'timestamp' },
    { field: 'urgency',      column: 'cn.urgency',       sqlType: 'text' },
    { field: 'ownerId',      column: 'cn.owner_id',      sqlType: 'uuid' },
    { field: 'notes',        column: 'cn.notes',         sqlType: 'text' },
    { field: 'status',       column: 'cn.status',        sqlType: 'text' },
    { field: 'createdAt',    column: 'cn.created_at',    sqlType: 'timestamp' },
    { field: 'updatedAt',    column: 'cn.updated_at',    sqlType: 'timestamp' },
    // Derived
    { field: 'customerName', column: 'cus.name',         sqlType: 'text', derived: true },
  ],
};

// ─── VendorSupply ────────────────────────────────────────────────────────────
// Source table: vendor_supply (schema.ts:562), alias: vs
// JOINs: vendors v ON v.id = vs.vendor_id

export const vendorSupplyColumnMap: EntityColumnMap = {
  entity: 'vendorSupply',
  table: 'vendor_supply',
  alias: 'vs',
  columns: [
    { field: 'id',           column: 'vs.id',            sqlType: 'uuid' },
    { field: 'supplyCode',   column: 'vs.supply_code',   sqlType: 'text' },
    { field: 'vendorId',     column: 'vs.vendor_id',     sqlType: 'uuid' },
    { field: 'productName',  column: 'vs.product_name',  sqlType: 'text' },
    { field: 'category',     column: 'vs.category',      sqlType: 'text' },
    { field: 'subcategory',  column: 'vs.subcategory',   sqlType: 'text' },
    { field: 'tags',         column: 'vs.tags',          sqlType: 'text[]' },
    { field: 'availableQty', column: 'vs.available_qty', sqlType: 'numeric' },
    { field: 'askingPrice',  column: 'vs.asking_price',  sqlType: 'numeric' },
    { field: 'availableDate',column: 'vs.available_date',sqlType: 'timestamp' },
    { field: 'location',     column: 'vs.location',      sqlType: 'text' },
    { field: 'grade',        column: 'vs.grade',         sqlType: 'text' },
    { field: 'terms',        column: 'vs.terms',         sqlType: 'text' },
    { field: 'notes',        column: 'vs.notes',         sqlType: 'text' },
    { field: 'status',       column: 'vs.status',        sqlType: 'text' },
    { field: 'createdAt',    column: 'vs.created_at',    sqlType: 'timestamp' },
    { field: 'updatedAt',    column: 'vs.updated_at',    sqlType: 'timestamp' },
    // Derived
    { field: 'vendorName',   column: 'v.name',           sqlType: 'text', derived: true },
  ],
};

// ─── MatchmakingMatch ────────────────────────────────────────────────────────
// Source table: matchmaking_matches (schema.ts:591), alias: mm

export const matchmakingMatchColumnMap: EntityColumnMap = {
  entity: 'matchmakingMatch',
  table: 'matchmaking_matches',
  alias: 'mm',
  columns: [
    { field: 'id',              column: 'mm.id',                 sqlType: 'uuid' },
    { field: 'customerNeedId',  column: 'mm.customer_need_id',   sqlType: 'uuid' },
    { field: 'vendorSupplyId',  column: 'mm.vendor_supply_id',   sqlType: 'uuid' },
    { field: 'score',           column: 'mm.score',              sqlType: 'numeric' },
    { field: 'reasons',         column: 'mm.reasons',            sqlType: 'text[]' },
    { field: 'status',          column: 'mm.status',             sqlType: 'text' },
    { field: 'reviewedBy',      column: 'mm.reviewed_by',        sqlType: 'uuid' },
    { field: 'createdAt',       column: 'mm.created_at',         sqlType: 'timestamp' },
    { field: 'updatedAt',       column: 'mm.updated_at',         sqlType: 'timestamp' },
  ],
};

// ─── Referee ─────────────────────────────────────────────────────────────────
// Source table: referees (schema.ts:792), alias: ref

export const refereeColumnMap: EntityColumnMap = {
  entity: 'referee',
  table: 'referees',
  alias: 'ref',
  columns: [
    { field: 'id',             column: 'ref.id',               sqlType: 'uuid' },
    { field: 'name',           column: 'ref.name',             sqlType: 'text' },
    { field: 'email',          column: 'ref.email',            sqlType: 'text' },
    { field: 'phone',          column: 'ref.phone',            sqlType: 'text' },
    { field: 'taxId',          column: 'ref.tax_id',           sqlType: 'text' },
    { field: 'balance',        column: 'ref.balance',          sqlType: 'numeric' },
    { field: 'lifetimeEarned', column: 'ref.lifetime_earned',  sqlType: 'numeric' },
    { field: 'paymentMethod',  column: 'ref.payment_method',   sqlType: 'text' },
    { field: 'paymentDetails', column: 'ref.payment_details',  sqlType: 'text' },
    { field: 'notes',          column: 'ref.notes',            sqlType: 'text' },
    { field: 'active',         column: 'ref.active',           sqlType: 'boolean' },
    { field: 'contactId',      column: 'ref.contact_id',       sqlType: 'uuid' },
    { field: 'createdAt',      column: 'ref.created_at',       sqlType: 'timestamp' },
    { field: 'updatedAt',      column: 'ref.updated_at',       sqlType: 'timestamp' },
  ],
};

// ─── RefereeCredit ───────────────────────────────────────────────────────────
// Source table: referee_credits (schema.ts:847), alias: rc
// JOINs: referees ref ON ref.id = rc.referee_id

export const refereeCreditColumnMap: EntityColumnMap = {
  entity: 'refereeCredit',
  table: 'referee_credits',
  alias: 'rc',
  columns: [
    { field: 'id',                    column: 'rc.id',                      sqlType: 'uuid' },
    { field: 'refereeId',             column: 'rc.referee_id',              sqlType: 'uuid' },
    { field: 'refereeRelationshipId', column: 'rc.referee_relationship_id', sqlType: 'uuid' },
    { field: 'transactionType',       column: 'rc.transaction_type',        sqlType: 'text' },
    { field: 'transactionId',         column: 'rc.transaction_id',          sqlType: 'uuid' },
    { field: 'transactionNo',         column: 'rc.transaction_no',          sqlType: 'text' },
    { field: 'transactionTotal',      column: 'rc.transaction_total',       sqlType: 'numeric' },
    { field: 'feeType',               column: 'rc.fee_type',                sqlType: 'text' },
    { field: 'feePercentage',         column: 'rc.fee_percentage',          sqlType: 'numeric' },
    { field: 'feeFixedAmount',        column: 'rc.fee_fixed_amount',        sqlType: 'numeric' },
    { field: 'creditAmount',          column: 'rc.credit_amount',           sqlType: 'numeric' },
    { field: 'amountPaid',            column: 'rc.amount_paid',             sqlType: 'numeric' },
    { field: 'status',                column: 'rc.status',                  sqlType: 'text' },
    { field: 'paidViaTransactionId',  column: 'rc.paid_via_transaction_id', sqlType: 'uuid' },
    { field: 'paidAt',                column: 'rc.paid_at',                 sqlType: 'timestamp' },
    { field: 'voidedAt',              column: 'rc.voided_at',               sqlType: 'timestamp' },
    { field: 'voidedReason',          column: 'rc.voided_reason',           sqlType: 'text' },
    { field: 'commandId',             column: 'rc.command_id',              sqlType: 'uuid' },
    { field: 'notes',                 column: 'rc.notes',                   sqlType: 'text' },
    { field: 'createdAt',             column: 'rc.created_at',              sqlType: 'timestamp' },
    { field: 'updatedAt',             column: 'rc.updated_at',              sqlType: 'timestamp' },
    // Derived
    { field: 'refereeName',           column: 'ref.name',                   sqlType: 'text', derived: true },
  ],
};

// ─── ConnectorRequest ────────────────────────────────────────────────────────
// Source table: connector_requests (schema.ts:518), alias: cr
// JOINs: customers cus ON cus.id = cr.customer_id

export const connectorRequestColumnMap: EntityColumnMap = {
  entity: 'connectorRequest',
  table: 'connector_requests',
  alias: 'cr',
  columns: [
    { field: 'id',            column: 'cr.id',              sqlType: 'uuid' },
    { field: 'source',        column: 'cr.source',          sqlType: 'text' },
    { field: 'requestType',   column: 'cr.request_type',    sqlType: 'text' },
    { field: 'customerId',    column: 'cr.customer_id',     sqlType: 'uuid' },
    { field: 'payload',       column: 'cr.payload',         sqlType: 'text' },
    { field: 'status',        column: 'cr.status',          sqlType: 'text' },
    { field: 'routedTo',      column: 'cr.routed_to',       sqlType: 'text' },
    { field: 'operatorNotes', column: 'cr.operator_notes',  sqlType: 'text' },
    { field: 'reviewHistory', column: 'cr.review_history',  sqlType: 'text' },
    { field: 'safetyNote',    column: 'cr.safety_note',     sqlType: 'text' },
    { field: 'createdAt',     column: 'cr.created_at',      sqlType: 'timestamp' },
    { field: 'updatedAt',     column: 'cr.updated_at',      sqlType: 'timestamp' },
    // Derived
    { field: 'customerName',  column: 'cus.name',           sqlType: 'text', derived: true },
  ],
};

// ─── CommandJournal ──────────────────────────────────────────────────────────
// Source table: command_journal (schema.ts:728), alias: cj

export const commandJournalColumnMap: EntityColumnMap = {
  entity: 'commandJournal',
  table: 'command_journal',
  alias: 'cj',
  columns: [
    { field: 'id',                  column: 'cj.id',                     sqlType: 'uuid' },
    { field: 'commandName',         column: 'cj.command_name',           sqlType: 'text' },
    { field: 'idempotencyKey',      column: 'cj.idempotency_key',       sqlType: 'text' },
    { field: 'actorId',             column: 'cj.actor_id',              sqlType: 'uuid' },
    { field: 'actorName',           column: 'cj.actor_name',            sqlType: 'text' },
    { field: 'actorRole',           column: 'cj.actor_role',            sqlType: 'text' },
    { field: 'reason',              column: 'cj.reason',                sqlType: 'text' },
    { field: 'inputPayload',        column: 'cj.input_payload',         sqlType: 'text' },
    { field: 'status',              column: 'cj.status',                sqlType: 'text' },
    { field: 'affectedIds',         column: 'cj.affected_ids',          sqlType: 'text[]' },
    { field: 'beforeSnapshot',      column: 'cj.before_snapshot',       sqlType: 'text' },
    { field: 'afterSnapshot',       column: 'cj.after_snapshot',        sqlType: 'text' },
    { field: 'result',              column: 'cj.result',                sqlType: 'text' },
    { field: 'error',               column: 'cj.error',                 sqlType: 'text' },
    { field: 'reversedByCommandId', column: 'cj.reversed_by_command_id',sqlType: 'uuid' },
    { field: 'createdAt',           column: 'cj.created_at',            sqlType: 'timestamp' },
  ],
};

// ─── Contact ─────────────────────────────────────────────────────────────────
// Source table: contacts (schema.ts:1303), alias: co

export const contactColumnMap: EntityColumnMap = {
  entity: 'contact',
  table: 'contacts',
  alias: 'co',
  columns: [
    { field: 'id',                     column: 'co.id',                        sqlType: 'uuid' },
    { field: 'name',                   column: 'co.name',                      sqlType: 'text' },
    { field: 'displayName',            column: 'co.display_name',              sqlType: 'text' },
    { field: 'phone',                  column: 'co.phone',                     sqlType: 'text' },
    { field: 'secondaryPhone',         column: 'co.secondary_phone',           sqlType: 'text' },
    { field: 'email',                  column: 'co.email',                     sqlType: 'text' },
    { field: 'address',                column: 'co.address',                   sqlType: 'text' },
    { field: 'companyName',            column: 'co.company_name',              sqlType: 'text' },
    { field: 'contactKind',            column: 'co.contact_kind',              sqlType: 'text' },
    { field: 'preferredContactMethod', column: 'co.preferred_contact_method',  sqlType: 'text' },
    { field: 'notes',                  column: 'co.notes',                     sqlType: 'text' },
    { field: 'tags',                   column: 'co.tags',                      sqlType: 'text[]' },
    { field: 'isCustomer',             column: 'co.is_customer',               sqlType: 'boolean' },
    { field: 'isVendor',               column: 'co.is_vendor',                 sqlType: 'boolean' },
    { field: 'isReferee',              column: 'co.is_referee',                sqlType: 'boolean' },
    { field: 'isProcessor',            column: 'co.is_processor',              sqlType: 'boolean' },
    { field: 'isContractor',           column: 'co.is_contractor',             sqlType: 'boolean' },
    { field: 'isEmployee',             column: 'co.is_employee',               sqlType: 'boolean' },
    { field: 'active',                 column: 'co.active',                    sqlType: 'boolean' },
    { field: 'archivedAt',             column: 'co.archived_at',               sqlType: 'timestamp' },
    { field: 'archivedBy',             column: 'co.archived_by',               sqlType: 'uuid' },
    { field: 'archivedReason',         column: 'co.archived_reason',           sqlType: 'text' },
    { field: 'createdAt',              column: 'co.created_at',                sqlType: 'timestamp' },
    { field: 'updatedAt',              column: 'co.updated_at',                sqlType: 'timestamp' },
  ],
};

// ─── PurchaseReceipt ─────────────────────────────────────────────────────────
// Source table: purchase_receipts (schema.ts:312), alias: pr
// JOINs: vendors v ON v.id = pr.vendor_id

export const purchaseReceiptColumnMap: EntityColumnMap = {
  entity: 'purchaseReceipt',
  table: 'purchase_receipts',
  alias: 'pr',
  columns: [
    { field: 'id',              column: 'pr.id',               sqlType: 'uuid' },
    { field: 'receiptNo',       column: 'pr.receipt_no',       sqlType: 'text' },
    { field: 'vendorId',        column: 'pr.vendor_id',        sqlType: 'uuid' },
    { field: 'purchaseOrderId', column: 'pr.purchase_order_id',sqlType: 'uuid' },
    { field: 'status',          column: 'pr.status',           sqlType: 'text' },
    { field: 'total',           column: 'pr.total',            sqlType: 'numeric' },
    { field: 'createdAt',       column: 'pr.created_at',       sqlType: 'timestamp' },
    { field: 'updatedAt',       column: 'pr.updated_at',       sqlType: 'timestamp' },
    // Derived
    { field: 'vendorName',      column: 'v.name',              sqlType: 'text', derived: true },
  ],
};

// ─── ProcessorFee ────────────────────────────────────────────────────────────
// Source table: processor_fees (schema.ts:912), alias: pf
// JOINs: payment_processors pp ON pp.id = pf.processor_id

export const processorFeeColumnMap: EntityColumnMap = {
  entity: 'processorFee',
  table: 'processor_fees',
  alias: 'pf',
  columns: [
    { field: 'id',                  column: 'pf.id',                     sqlType: 'uuid' },
    { field: 'processorId',         column: 'pf.processor_id',           sqlType: 'uuid' },
    { field: 'transactionType',     column: 'pf.transaction_type',       sqlType: 'text' },
    { field: 'transactionId',       column: 'pf.transaction_id',         sqlType: 'uuid' },
    { field: 'transactionNo',       column: 'pf.transaction_no',         sqlType: 'text' },
    { field: 'transactionAmount',   column: 'pf.transaction_amount',     sqlType: 'numeric' },
    { field: 'processingFeeTotal',  column: 'pf.processing_fee_total',   sqlType: 'numeric' },
    { field: 'userFeeShare',        column: 'pf.user_fee_share',         sqlType: 'numeric' },
    { field: 'processorFeeShare',   column: 'pf.processor_fee_share',    sqlType: 'numeric' },
    { field: 'userFeeStatus',       column: 'pf.user_fee_status',        sqlType: 'text' },
    { field: 'userFeeCollectedAt',  column: 'pf.user_fee_collected_at',  sqlType: 'timestamp' },
    { field: 'processorFeeStatus',  column: 'pf.processor_fee_status',   sqlType: 'text' },
    { field: 'processorFeePaidAt',  column: 'pf.processor_fee_paid_at',  sqlType: 'timestamp' },
    { field: 'processorFeePaidVia', column: 'pf.processor_fee_paid_via', sqlType: 'uuid' },
    { field: 'commandId',           column: 'pf.command_id',             sqlType: 'uuid' },
    { field: 'notes',               column: 'pf.notes',                  sqlType: 'text' },
    { field: 'createdAt',           column: 'pf.created_at',             sqlType: 'timestamp' },
    { field: 'updatedAt',           column: 'pf.updated_at',             sqlType: 'timestamp' },
    // Derived
    { field: 'processorName',       column: 'pp.name',                   sqlType: 'text', derived: true },
  ],
};

// ─── User ────────────────────────────────────────────────────────────────────
// Source table: users (schema.ts:27), alias: u

export const userColumnMap: EntityColumnMap = {
  entity: 'user',
  table: 'users',
  alias: 'u',
  columns: [
    { field: 'id',           column: 'u.id',            sqlType: 'uuid' },
    { field: 'name',         column: 'u.name',          sqlType: 'text' },
    { field: 'email',        column: 'u.email',         sqlType: 'text' },
    { field: 'role',         column: 'u.role',          sqlType: 'text' },
    { field: 'active',       column: 'u.active',        sqlType: 'boolean' },
    { field: 'workLoop',     column: 'u.work_loop',     sqlType: 'text' },
    { field: 'contactId',    column: 'u.contact_id',    sqlType: 'uuid' },
    { field: 'createdAt',    column: 'u.created_at',    sqlType: 'timestamp' },
    { field: 'updatedAt',    column: 'u.updated_at',    sqlType: 'timestamp' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// COLUMN MAP REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lookup map from entity key → EntityColumnMap.
 * The server-side filter engine uses this to resolve frontend field names
 * to safe SQL column expressions.
 */
export const entityColumnMaps: Record<string, EntityColumnMap> = {
  purchaseOrder: purchaseOrderColumnMap,
  sale: saleColumnMap,
  intake: intakeColumnMap,
  vendor: vendorColumnMap,
  customer: customerColumnMap,
  payment: paymentColumnMap,
  invoice: invoiceColumnMap,
  vendorBill: vendorBillColumnMap,
  vendorPayment: vendorPaymentColumnMap,
  paymentAllocation: paymentAllocationColumnMap,
  purchaseOrderLine: purchaseOrderLineColumnMap,
  salesOrderLine: salesOrderLineColumnMap,
  pickList: pickListColumnMap,
  fulfillmentLine: fulfillmentLineColumnMap,
  item: itemColumnMap,
  brand: brandColumnMap,
  customerNeed: customerNeedColumnMap,
  vendorSupply: vendorSupplyColumnMap,
  matchmakingMatch: matchmakingMatchColumnMap,
  referee: refereeColumnMap,
  refereeCredit: refereeCreditColumnMap,
  connectorRequest: connectorRequestColumnMap,
  commandJournal: commandJournalColumnMap,
  contact: contactColumnMap,
  purchaseReceipt: purchaseReceiptColumnMap,
  processorFee: processorFeeColumnMap,
  user: userColumnMap,
};

/**
 * Resolve a frontend field name to a safe SQL column expression.
 * Returns the column expression string, or undefined if the field is unrecognized.
 *
 * @param entity - Entity type key (e.g. 'purchaseOrder')
 * @param field - Frontend field name (e.g. 'poNo')
 * @returns SQL column expression (e.g. 'po.po_no'), or undefined
 */
export function resolveColumn(entity: string, field: string): string | undefined {
  const map = entityColumnMaps[entity];
  if (!map) return undefined;
  const col = map.columns.find((c) => c.field === field);
  return col?.column;
}

/**
 * Build a WHERE clause fragment for server-side filtering.
 * Only fields with a registered column mapping are included in the whitelist.
 *
 * @param entity - Entity type key
 * @returns Set of allowed column expressions for SQL generation
 */
export function getAllowedColumns(entity: string): Set<string> {
  const map = entityColumnMaps[entity];
  if (!map) return new Set();
  return new Set(map.columns.map((c) => c.column));
}
