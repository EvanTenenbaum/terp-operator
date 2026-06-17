/**
 * Schema Registry — Canonical entity field definitions.
 *
 * Purpose: Every grid column originates here. Views derive their ColDef arrays
 * from these schema definitions via `useColumnDefs(entity)` — no per-view
 * ColDef arrays, no inline cell renderers.
 *
 * ARCH-8: Table IS the view. No per-view ColDef arrays.
 * UX-8: Every grid column must originate here.
 */

import type { Role, Status } from '../../shared/types';

// ─── Architecture Compliance Checklist ──────────────────────────────────────
// [ ] No per-view ColDef arrays — all definitions originate here
// [ ] No inline cell renderers — renderer references point to stable components
// [ ] No per-view StatusActionTable — state machine governs visibility
// [ ] No direct db queries — all data through tRPC
// [ ] No new Zustand stores — useUiStore only
// ─────────────────────────────────────────────────────────────────────────────

// ─── Shared type definitions ────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'numeric'
  | 'date'
  | 'boolean'
  | 'enum'
  | 'combobox'
  | 'tags'
  | 'currency';

export interface FieldDefinition {
  /** Unique field key — matches the grid row property name. */
  field: string;
  /** Column type. Determines formatter, filter, and editor defaults. */
  type: FieldType;
  /** Human-readable column header. */
  headerName: string;
  /** Whether inline cell editing is allowed (ARCH-12: commits via useCommandRunner). */
  editable: boolean;
  /** Whether a value is required (server enforces; client shows inline validation). */
  required: boolean;
  /** Default column width in px. Operator column prefs override this. */
  width: number;
  /** Whether the column supports client-side text filtering. */
  filterable: boolean;
  /** Whether the column is sortable. */
  sortable: boolean;
  /** Minimum role required to see this column. Absent = visible to all roles. */
  minRole?: Role;
  /** Default pin position. */
  pinned?: 'left' | 'right';
  /** For combobox fields: the procedure and params for option lookup. */
  comboboxSource?: string;
  /**
   * Why this field is at its current attention tier.
   * Tier 0: always visible (identity, status, amount).
   * Tier 1: visible by default, hideable.
   * Tier 2: hidden by default (operator must enable via column chooser).
   */
  attentionTier: 0 | 1 | 2;
  /** Brief explanation of why this field is at its current tier. */
  attentionRationale: string;
}

export interface EntityFieldSchema {
  /** Entity type key (matches ViewKey and entityType in useUiStore). */
  entity: string;
  /** Display label for the entity. */
  label: string;
  /** Ordered field definitions. Column order in the grid follows array order. */
  fields: FieldDefinition[];
}

// ─── Field definition helpers ───────────────────────────────────────────────

/** Shorthand for a Tier 0 field (always visible — identity, status, amount). */
function t0(
  field: string,
  headerName: string,
  type: FieldType,
  overrides: Partial<Omit<FieldDefinition, 'field' | 'headerName' | 'type'>> & { rationale: string }
): FieldDefinition {
  return {
    field,
    headerName,
    type,
    editable: false,
    required: false,
    width: 130,
    filterable: true,
    sortable: true,
    attentionTier: 0,
    attentionRationale: overrides.rationale,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'rationale')),
  };
}

/** Shorthand for a Tier 1 field (visible by default, hideable). */
function t1(
  field: string,
  headerName: string,
  type: FieldType,
  overrides: Partial<Omit<FieldDefinition, 'field' | 'headerName' | 'type'>> & { rationale: string }
): FieldDefinition {
  return {
    field,
    headerName,
    type,
    editable: false,
    required: false,
    width: 130,
    filterable: true,
    sortable: true,
    attentionTier: 1,
    attentionRationale: overrides.rationale,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'rationale')),
  };
}

/** Shorthand for a Tier 2 field (hidden by default — rare needs). */
function t2(
  field: string,
  headerName: string,
  type: FieldType,
  overrides: Partial<Omit<FieldDefinition, 'field' | 'headerName' | 'type'>> & { rationale: string }
): FieldDefinition {
  return {
    field,
    headerName,
    type,
    editable: false,
    required: false,
    width: 130,
    filterable: false,
    sortable: false,
    attentionTier: 2,
    attentionRationale: overrides.rationale,
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'rationale')),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PurchaseOrder (worked example) ─────────────────────────────────────────

export const purchaseOrderSchema: EntityFieldSchema = {
  entity: 'purchaseOrder',
  label: 'Purchase Order',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      sortable: true,
      rationale: 'The operator scanning the grid needs to see status immediately — it drives every action decision. ARCH-2: state machine uses this field.',
    }),
    t0('poNo', 'PO #', 'text', {
      width: 140,
      pinned: 'left',
      rationale: 'Primary identifier — the operator searches, sorts, and references by PO number relentlessly.',
    }),
    t0('vendorName', 'Vendor', 'text', {
      width: 180,
      rationale: 'The counterparty — without it the row has no context. Derived from vendor_id join.',
    }),
    t0('total', 'Total', 'currency', {
      width: 130,
      rationale: 'The commitment amount — operators scan this column to prioritize by exposure.',
    }),

    // ── Tier 1: visible by default ──
    t1('expectedDate', 'Expected', 'date', {
      width: 130,
      rationale: 'Operators filter by expected arrival constantly — but it is not identity.',
    }),
    t1('orderedAt', 'Ordered', 'date', {
      width: 130,
      rationale: 'Useful for age-based scanning, but not a split-second decision driver.',
    }),
    t1('paymentTerms', 'Terms', 'enum', {
      width: 120,
      rationale: 'Relevant to cash-flow scanning; secondary to status and total.',
    }),
    t1('prepaymentAmount', 'Prepaid', 'currency', {
      width: 120,
      rationale: 'Surface when non-zero — signals cash out before receipt.',
    }),
    t1('receivedAt', 'Received', 'date', {
      width: 130,
      rationale: 'Matters for aging received-but-unposted POs; secondary to status.',
    }),
    t1('orderedBy', 'Buyer', 'text', {
      width: 120,
      minRole: 'manager',
      rationale: 'Accountability signal; manager tier because operators rarely need to scan by buyer.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('buyerNotes', 'Buyer notes', 'text', {
      width: 200,
      rationale: 'Chronicle-level detail; rarely used for grid-level decisions.',
    }),
    t2('internalNotes', 'Internal notes', 'text', {
      width: 200,
      rationale: 'Operators add notes for handoff context; rarely scanned in bulk.',
    }),
    t2('externalNotes', 'Vendor notes', 'text', {
      width: 200,
      rationale: 'Received from vendor on the PO receipt — infrequently scanned.',
    }),
    t2('finalizedAt', 'Finalized', 'date', {
      width: 130,
      rationale: 'Audit signal; operators almost never filter by when a PO was finalized.',
    }),
    t2('cancelledAt', 'Cancelled', 'date', {
      width: 130,
      rationale: 'Exists only for cancelled POs; column is noise on the main grid.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── Sale (SalesOrder) ──────────────────────────────────────────────────────

export const saleSchema: EntityFieldSchema = {
  entity: 'sale',
  label: 'Sales Order',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Status drives every downstream action — picks, posting, payment followup.',
    }),
    t0('orderNo', 'Order #', 'text', {
      width: 140,
      pinned: 'left',
      rationale: 'Primary identifier — operators search, sort, and reference by order number.',
    }),
    t0('customerName', 'Customer', 'text', {
      width: 180,
      rationale: 'The counterparty; without it the row has no business context. Derived from customer_id join.',
    }),
    t0('total', 'Total', 'currency', {
      width: 130,
      rationale: 'The revenue commitment — operators scan this column to prioritize high-value orders.',
    }),

    // ── Tier 1: visible by default ──
    t1('orderedAt', 'Ordered', 'date', {
      width: 130,
      rationale: 'Operators filter by order age constantly, but it is not identity.',
    }),
    t1('deliveryWindow', 'Delivery', 'text', {
      width: 140,
      rationale: 'Logistics scheduling signal; secondary to status and total.',
    }),
    t1('internalMargin', 'Margin', 'currency', {
      width: 110,
      rationale: 'Profitability signal for management scanning; secondary to revenue total.',
    }),
    t1('packed', 'Packed', 'boolean', {
      width: 100,
      rationale: 'Quick warehouse status check; secondary to order status.',
    }),
    t1('inventoryPosted', 'Posted', 'boolean', {
      width: 100,
      rationale: 'Accounting completeness signal; operators check during closeout.',
    }),
    t1('fulfilledAt', 'Fulfilled', 'date', {
      width: 130,
      rationale: 'Matters for aging fulfilled-but-unposted orders; secondary to status.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('pricingStrategy', 'Pricing', 'text', {
      width: 130,
      rationale: 'Configuration detail; rarely relevant for day-to-day grid scanning.',
    }),
    t2('notes', 'Notes', 'text', {
      width: 200,
      rationale: 'Chronicle-level detail; rarely read in bulk grid view.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── Intake (Batch) ─────────────────────────────────────────────────────────

export const intakeSchema: EntityFieldSchema = {
  entity: 'intake',
  label: 'Batch',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Status tells the operator whether this batch is available, reserved, or posted.',
    }),
    t0('batchCode', 'Batch #', 'text', {
      width: 140,
      pinned: 'left',
      rationale: 'Primary identifier — operators search by batch code to trace inventory.',
    }),
    t0('itemName', 'Item', 'text', {
      width: 180,
      rationale: 'What product this batch represents — the core inventory entity. Derived from item join.',
    }),
    t0('availableQty', 'Avail Qty', 'numeric', {
      width: 110,
      rationale: 'The sellable quantity — operators scan this to allocate against orders.',
    }),
    t0('intakeQty', 'Recv Qty', 'numeric', {
      width: 110,
      rationale: 'Received quantity — the baseline against which available is measured.',
    }),

    // ── Tier 1: visible by default ──
    t1('vendorName', 'Vendor', 'text', {
      width: 180,
      rationale: 'Source context; secondary to the batch identity and item name.',
    }),
    t1('uom', 'Unit', 'text', {
      width: 80,
      rationale: 'Unit of measure qualifies the quantity; secondary but needed for interpretation.',
    }),
    t1('intakeDate', 'Received', 'date', {
      width: 130,
      rationale: 'Age-based scanning for inventory turns; secondary to status.',
    }),
    t1('location', 'Location', 'text', {
      width: 130,
      rationale: 'Physical location matters for warehouse ops; secondary to availability.',
    }),
    t1('unitCost', 'Unit Cost', 'currency', {
      width: 120,
      rationale: 'Cost basis for margin calculations; secondary to quantity fields.',
    }),
    t1('tags', 'Tags', 'text', {
      width: 150,
      rationale: 'Categorical organization; visible by default for filtering.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('notes', 'Notes', 'text', {
      width: 200,
      rationale: 'Chronicle-level detail; rarely read in bulk grid view.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── Item ────────────────────────────────────────────────────────────────────

export const itemSchema: EntityFieldSchema = {
  entity: 'item',
  label: 'Item',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Active/inactive/discontinued — determines whether the item appears in catalogs.',
    }),
    t0('sku', 'SKU', 'text', {
      width: 130,
      pinned: 'left',
      rationale: 'Primary stock-keeping identifier — operators search by SKU relentlessly.',
    }),
    t0('name', 'Name', 'text', {
      width: 200,
      rationale: 'Human-readable product name — the primary descriptor for all workflows.',
    }),
    t0('category', 'Category', 'text', {
      width: 140,
      rationale: 'Product taxonomy; operators group and filter by category constantly.',
    }),

    // ── Tier 1: visible by default ──
    t1('alias', 'Alias', 'text', {
      width: 150,
      rationale: 'Alternate names used by vendors or legacy systems; helpful but secondary.',
    }),
    t1('pricingRule', 'Pricing', 'text', {
      width: 120,
      rationale: 'Pricing strategy label; secondary to product identity.',
    }),
    t1('tags', 'Tags', 'text', {
      width: 150,
      rationale: 'Categorical organization; visible by default for filtering.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('description', 'Description', 'text', {
      width: 250,
      rationale: 'Long-form product description; rarely scanned in grid view.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── Customer ────────────────────────────────────────────────────────────────

export const customerSchema: EntityFieldSchema = {
  entity: 'customer',
  label: 'Customer',
  fields: [
    // ── Tier 0: always visible ──
    t0('name', 'Name', 'text', {
      width: 200,
      pinned: 'left',
      rationale: 'Primary identity — the operator must know who they are transacting with.',
    }),
    t0('creditLimit', 'Credit Limit', 'currency', {
      width: 140,
      rationale: 'The exposure ceiling — operators check this before approving orders.',
    }),
    t0('balance', 'Balance', 'currency', {
      width: 130,
      rationale: 'Current owed amount — drives collection decisions and order holds.',
    }),

    // ── Tier 1: visible by default ──
    t1('tags', 'Tags', 'text', {
      width: 150,
      rationale: 'Categorization and filtering by customer segment.',
    }),
    t1('pricingRule', 'Pricing Rule', 'text', {
      width: 130,
      rationale: 'Default pricing strategy for this customer; secondary to credit profile.',
    }),
    t1('notes', 'Notes', 'text', {
      width: 200,
      rationale: 'Customer notes for relationship context; visible by default for account managers.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('engineEnabled', 'Engine', 'boolean', {
      width: 100,
      rationale: 'Credit engine toggle; operational config, not a daily scanning field.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── Vendor ──────────────────────────────────────────────────────────────────

export const vendorSchema: EntityFieldSchema = {
  entity: 'vendor',
  label: 'Vendor',
  fields: [
    // ── Tier 0: always visible ──
    t0('name', 'Name', 'text', {
      width: 200,
      pinned: 'left',
      rationale: 'Primary identity — the operator must know who they are buying from.',
    }),
    t0('alias', 'Alias', 'text', {
      width: 150,
      rationale: 'Shorthand name used across the system; alternative search key.',
    }),
    t0('termsDays', 'Terms', 'numeric', {
      width: 90,
      rationale: 'Payment terms in days — drives AP scheduling and cash-flow planning.',
    }),

    // ── Tier 1: visible by default ──
    t1('contact', 'Contact', 'text', {
      width: 150,
      rationale: 'Primary contact name; relevant when reaching out to the vendor.',
    }),
    t1('consignmentDefault', 'Consignment', 'boolean', {
      width: 120,
      rationale: 'Whether this vendor operates on consignment terms; payment-timing signal.',
    }),
    t1('notes', 'Notes', 'text', {
      width: 200,
      rationale: 'Vendor relationship notes; visible by default for purchasing context.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('contactId', 'Contact ID', 'text', {
      width: 300,
      rationale: 'Foreign key to contacts table; internal join reference only.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── User (Staff) ────────────────────────────────────────────────────────────

export const userSchema: EntityFieldSchema = {
  entity: 'user',
  label: 'Staff',
  fields: [
    // ── Tier 0: always visible ──
    t0('name', 'Name', 'text', {
      width: 200,
      pinned: 'left',
      rationale: 'Primary identity — who this staff member is.',
    }),
    t0('email', 'Email', 'text', {
      width: 220,
      rationale: 'Contact and login identifier; essential for account management.',
    }),
    t0('role', 'Role', 'enum', {
      width: 130,
      rationale: 'Permission tier — determines what the user can see and do.',
    }),
    t0('active', 'Active', 'boolean', {
      width: 100,
      rationale: 'Whether this account can log in; critical access-control signal.',
    }),

    // ── Tier 1: visible by default ──
    t1('workLoop', 'Work Loop', 'text', {
      width: 130,
      rationale: 'Assigned operational lane (sales, intake, warehouse); secondary to role.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('contactId', 'Contact ID', 'text', {
      width: 300,
      rationale: 'Foreign key to contacts table; internal join reference only.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── Payment ─────────────────────────────────────────────────────────────────

export const paymentSchema: EntityFieldSchema = {
  entity: 'payment',
  label: 'Payment',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Whether the payment is applied, unapplied, or void — drives allocation workflow.',
    }),
    t0('amount', 'Amount', 'currency', {
      width: 130,
      rationale: 'The payment amount — operators scan totals to reconcile against receivables.',
    }),
    t0('customerName', 'Customer', 'text', {
      width: 180,
      rationale: 'Who paid — the counterparty context. Derived from customer_id join.',
    }),
    t0('method', 'Method', 'enum', {
      width: 120,
      rationale: 'Payment method (cash, check, wire) — drives reconciliation and deposit workflow.',
    }),

    // ── Tier 1: visible by default ──
    t1('reference', 'Reference', 'text', {
      width: 150,
      rationale: 'Check number or wire reference; operators search by this during reconciliation.',
    }),
    t1('direction', 'Direction', 'enum', {
      width: 110,
      rationale: 'Receiving or paying; determines which ledger side this affects.',
    }),
    t1('category', 'Category', 'text', {
      width: 140,
      rationale: 'Payment category (client_payment, vendor_product_payment, etc.); secondary classification.',
    }),
    t1('unappliedAmount', 'Unapplied', 'currency', {
      width: 120,
      rationale: 'Remaining unapplied balance — signals work remaining for allocation.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('notes', 'Notes', 'text', {
      width: 200,
      rationale: 'Payment notes; rarely scanned in bulk.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── Invoice ─────────────────────────────────────────────────────────────────

export const invoiceSchema: EntityFieldSchema = {
  entity: 'invoice',
  label: 'Invoice',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Open, partial, paid, overdue — drives collections workflow.',
    }),
    t0('invoiceNo', 'Invoice #', 'text', {
      width: 140,
      pinned: 'left',
      rationale: 'Primary identifier — operators search and reference by invoice number.',
    }),
    t0('customerName', 'Customer', 'text', {
      width: 180,
      rationale: 'Who owes the money — the counterparty context. Derived from customer_id join.',
    }),
    t0('total', 'Total', 'currency', {
      width: 130,
      rationale: 'The invoiced amount — operators scan to prioritize collection efforts.',
    }),

    // ── Tier 1: visible by default ──
    t1('dueDate', 'Due Date', 'date', {
      width: 130,
      rationale: 'Aging signal — operators filter by due date to manage collections queue.',
    }),
    t1('amountPaid', 'Paid', 'currency', {
      width: 120,
      rationale: 'How much has been collected; secondary to total for balance calculation.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('orderId', 'Order ID', 'text', {
      width: 300,
      rationale: 'Foreign key to originating sales order; internal join reference only.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── PurchaseReceipt ─────────────────────────────────────────────────────────

export const purchaseReceiptSchema: EntityFieldSchema = {
  entity: 'purchaseReceipt',
  label: 'Purchase Receipt',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Whether the receipt is draft, posted, or void — drives posting workflow.',
    }),
    t0('receiptNo', 'Receipt #', 'text', {
      width: 140,
      pinned: 'left',
      rationale: 'Primary identifier — operators search and reference by receipt number.',
    }),
    t0('vendorName', 'Vendor', 'text', {
      width: 180,
      rationale: 'Who shipped the goods — the counterparty context. Derived from vendor_id join.',
    }),
    t0('total', 'Total', 'currency', {
      width: 130,
      rationale: 'Received value — operators scan to verify against the PO total.',
    }),

    // ── Tier 1: visible by default ──
    t1('receivedAt', 'Received', 'date', {
      width: 130,
      rationale: 'When goods arrived; operators filter by receipt date for period reconciliation.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('vendorId', 'Vendor ID', 'text', {
      width: 300,
      rationale: 'Foreign key to vendors table; internal join reference only.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── VendorBill ──────────────────────────────────────────────────────────────

export const vendorBillSchema: EntityFieldSchema = {
  entity: 'vendorBill',
  label: 'Vendor Bill',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Open, partial, paid — drives AP payment scheduling.',
    }),
    t0('billNo', 'Bill #', 'text', {
      width: 140,
      pinned: 'left',
      rationale: 'Primary identifier — operators search and reference by vendor bill number.',
    }),
    t0('vendorName', 'Vendor', 'text', {
      width: 180,
      rationale: 'Who sent the bill — the counterparty context. Derived from vendor_id join.',
    }),
    t0('amount', 'Amount', 'currency', {
      width: 130,
      rationale: 'The bill amount — operators scan to prioritize AP payments.',
    }),

    // ── Tier 1: visible by default ──
    t1('dueDate', 'Due Date', 'date', {
      width: 130,
      rationale: 'Aging signal — operators filter by due date to manage AP queue.',
    }),
    t1('amountPaid', 'Paid', 'currency', {
      width: 120,
      rationale: 'How much has been paid; secondary to amount for balance calculation.',
    }),
    t1('scheduledFor', 'Scheduled', 'date', {
      width: 130,
      rationale: 'When payment is scheduled; operational planning signal.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('termsDays', 'Terms Days', 'numeric', {
      width: 110,
      rationale: 'Payment terms in days; reference data, not scanned in daily workflows.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── VendorPayment ───────────────────────────────────────────────────────────

export const vendorPaymentSchema: EntityFieldSchema = {
  entity: 'vendorPayment',
  label: 'Vendor Payment',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Scheduled, sent, cleared — drives AP reconciliation workflow.',
    }),
    t0('amount', 'Amount', 'currency', {
      width: 130,
      rationale: 'The payment amount — operators scan totals to reconcile against vendor bills.',
    }),
    t0('method', 'Method', 'enum', {
      width: 120,
      rationale: 'Payment method — drives bank reconciliation and tracking.',
    }),

    // ── Tier 1: visible by default ──
    t1('reference', 'Reference', 'text', {
      width: 150,
      rationale: 'Check number or wire reference; operators search by this during reconciliation.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('vendorBillId', 'Bill ID', 'text', {
      width: 300,
      rationale: 'Foreign key to vendor_bills table; internal join reference only.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
  ],
};

// ─── FulfillmentLine ─────────────────────────────────────────────────────────

export const fulfillmentLineSchema: EntityFieldSchema = {
  entity: 'fulfillmentLine',
  label: 'Fulfillment Line',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Picked, packed, shipped — drives warehouse workflow.',
    }),
    t0('expectedQty', 'Expected', 'numeric', {
      width: 100,
      rationale: 'How many units should be fulfilled against this order line.',
    }),
    t0('actualQty', 'Actual', 'numeric', {
      width: 100,
      rationale: 'How many units were actually picked; the variance drives exception handling.',
    }),

    // ── Tier 1: visible by default ──
    t1('bagCode', 'Bag Code', 'text', {
      width: 150,
      rationale: 'Bag or tote identifier for warehouse tracking; secondary to quantities.',
    }),
    t1('actualWeight', 'Weight', 'numeric', {
      width: 110,
      rationale: 'Actual weight of picked goods; used for shipping label generation.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('pickListId', 'Pick List ID', 'text', {
      width: 300,
      rationale: 'Foreign key to pick_lists table; internal join reference only.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── PickList ────────────────────────────────────────────────────────────────

export const pickListSchema: EntityFieldSchema = {
  entity: 'pickList',
  label: 'Pick List',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Draft, released, completed — drives pick workflow.',
    }),
    t0('pickNo', 'Pick #', 'text', {
      width: 140,
      pinned: 'left',
      rationale: 'Primary identifier — warehouse staff reference picks by number.',
    }),
    t0('assignedTo', 'Assigned To', 'text', {
      width: 150,
      rationale: 'Which staff member is responsible; accountability and workload signal.',
    }),

    // ── Tier 1: visible by default ──
    t1('labelsPrinted', 'Labels', 'boolean', {
      width: 100,
      rationale: 'Whether labels have been printed; warehouse readiness signal.',
    }),
    t1('tracking', 'Tracking', 'text', {
      width: 150,
      rationale: 'Shipping tracking number; secondary to pick completion status.',
    }),
    t1('unitsPerBag', 'Units/Bag', 'numeric', {
      width: 110,
      rationale: 'Packing configuration; secondary operational detail.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('manifestPath', 'Manifest', 'text', {
      width: 200,
      rationale: 'File path to generated manifest; operational artifact, not a scanning field.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── ConnectorRequest ────────────────────────────────────────────────────────

export const connectorRequestSchema: EntityFieldSchema = {
  entity: 'connectorRequest',
  label: 'Connector Request',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'New, routed, resolved — drives connector triage workflow.',
    }),
    t0('requestType', 'Type', 'enum', {
      width: 140,
      pinned: 'left',
      rationale: 'Email, form, phone — determines routing and response template.',
    }),
    t0('customerName', 'Customer', 'text', {
      width: 180,
      rationale: 'Who made the request; the counterparty context. Derived from customer_id join.',
    }),
    t0('source', 'Source', 'text', {
      width: 120,
      rationale: 'Originating channel or system; operators scan to prioritize by source.',
    }),

    // ── Tier 1: visible by default ──
    t1('routedTo', 'Routed To', 'text', {
      width: 130,
      rationale: 'Which operator or queue this is assigned to; workload distribution signal.',
    }),
    t1('safetyNote', 'Safety Note', 'text', {
      width: 150,
      rationale: 'Fraud or risk flag; visible by default for all operators.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('payload', 'Payload', 'text', {
      width: 250,
      rationale: 'Raw request body; rarely inspected in grid view — accessed in detail slide-over.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── MatchmakingMatch ────────────────────────────────────────────────────────

export const matchmakingMatchSchema: EntityFieldSchema = {
  entity: 'matchmakingMatch',
  label: 'Match',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Suggested, accepted, rejected, converted — drives match review workflow.',
    }),
    t0('score', 'Score', 'numeric', {
      width: 90,
      pinned: 'left',
      rationale: 'Match quality score — operators scan to prioritize high-quality matches.',
    }),
    t0('reasons', 'Reasons', 'text', {
      width: 200,
      rationale: 'Why the match was suggested — category, price, quantity alignment signals.',
    }),

    // ── Tier 1: visible by default ──
    t1('reviewedBy', 'Reviewed By', 'text', {
      width: 150,
      rationale: 'Who reviewed this match; accountability signal for accepted/rejected decisions.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('customerNeedId', 'Need ID', 'text', {
      width: 300,
      rationale: 'Foreign key to customer_needs; internal join reference only.',
    }),
    t2('vendorSupplyId', 'Supply ID', 'text', {
      width: 300,
      rationale: 'Foreign key to vendor_supply; internal join reference only.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── PhotographyQueue ────────────────────────────────────────────────────────

export const photographyQueueSchema: EntityFieldSchema = {
  entity: 'photographyQueue',
  label: 'Photography Queue',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Open, in-progress, completed — drives photography scheduling workflow.',
    }),
    t0('batchId', 'Batch', 'text', {
      width: 300,
      pinned: 'left',
      rationale: 'Which inventory batch needs photos — the subject of the photography request.',
    }),

    // ── Tier 1: visible by default ──
    t1('requestedBy', 'Requested By', 'text', {
      width: 150,
      rationale: 'Who requested photography; accountability and follow-up signal.',
    }),
    t1('notes', 'Notes', 'text', {
      width: 200,
      rationale: 'Photography notes (angles, conditions, priority); visible for scheduler context.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'When the request was submitted; used for aging but not daily scanning.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── InvoiceDispute ──────────────────────────────────────────────────────────

export const invoiceDisputeSchema: EntityFieldSchema = {
  entity: 'invoiceDispute',
  label: 'Invoice Dispute',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Open, under-review, resolved — drives dispute resolution workflow.',
    }),
    t0('invoiceId', 'Invoice', 'text', {
      width: 300,
      pinned: 'left',
      rationale: 'Which invoice is being disputed — the root transaction.',
    }),
    t0('reason', 'Reason', 'text', {
      width: 250,
      rationale: 'Why the customer is disputing — drives resolution strategy.',
    }),

    // ── Tier 1: visible by default ──
    t1('resolution', 'Resolution', 'text', {
      width: 250,
      rationale: 'How the dispute was resolved; visible for audit and pattern analysis.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'When the dispute was opened; aging signal used sparingly.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── CorrectionJournalEntry ─────────────────────────────────────────────────

export const correctionJournalEntrySchema: EntityFieldSchema = {
  entity: 'correctionJournalEntry',
  label: 'Correction Entry',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Posted, pending — drives closeout review workflow.',
    }),
    t0('period', 'Period', 'text', {
      width: 120,
      pinned: 'left',
      rationale: 'Which accounting period this correction belongs to — period lock enforcement.',
    }),
    t0('amount', 'Amount', 'currency', {
      width: 130,
      rationale: 'The correction amount — operators scan to identify material adjustments.',
    }),
    t0('memo', 'Memo', 'text', {
      width: 250,
      rationale: 'Explanation of why the correction was made — audit trail.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
  ],
};

// ─── CommandJournal ──────────────────────────────────────────────────────────

export const commandJournalSchema: EntityFieldSchema = {
  entity: 'commandJournal',
  label: 'Command Log',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 100,
      pinned: 'left',
      rationale: 'OK or error — operators scan for failures in the command stream.',
    }),
    t0('commandName', 'Command', 'text', {
      width: 180,
      pinned: 'left',
      rationale: 'What command was executed — the primary classification axis.',
    }),
    t0('actorName', 'Actor', 'text', {
      width: 150,
      rationale: 'Who executed the command — accountability signal.',
    }),
    t0('reason', 'Reason', 'text', {
      width: 200,
      rationale: 'Why the command was executed — business justification.',
    }),

    // ── Tier 1: visible by default ──
    t1('actorRole', 'Role', 'text', {
      width: 120,
      rationale: 'Permission level of the actor; secondary to actor identity.',
    }),
    t1('result', 'Result', 'text', {
      width: 200,
      rationale: 'Command result payload; visible for troubleshooting.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('idempotencyKey', 'Idempotency Key', 'text', {
      width: 300,
      rationale: 'Deduplication key; infrastructure detail, not a scanning field.',
    }),
    t2('inputPayload', 'Input', 'text', {
      width: 250,
      rationale: 'Full command input; debug detail accessed on demand.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'When the command executed; audit timestamp.',
    }),
  ],
};

// ─── DocumentSnapshot ────────────────────────────────────────────────────────

export const documentSnapshotSchema: EntityFieldSchema = {
  entity: 'documentSnapshot',
  label: 'Document Snapshot',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Draft, finalized, voided — lifecycle state.',
    }),
    t0('kind', 'Kind', 'text', {
      width: 130,
      pinned: 'left',
      rationale: 'What type of document this is (invoice, PO, receipt) — primary classification.',
    }),
    t0('sourceEntityType', 'Entity Type', 'text', {
      width: 140,
      rationale: 'What entity this snapshot belongs to — salesOrder, purchaseOrder, etc.',
    }),
    t0('sourceEntityId', 'Entity ID', 'text', {
      width: 300,
      rationale: 'Which specific entity record; traceability link.',
    }),

    // ── Tier 1: visible by default ──
    t1('audience', 'Audience', 'text', {
      width: 120,
      rationale: 'Internal or external — determines sharing rules.',
    }),
    t1('projectionVersion', 'Version', 'numeric', {
      width: 90,
      rationale: 'Document version number; secondary to status.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('contentHash', 'Hash', 'text', {
      width: 300,
      rationale: 'Content integrity hash; infrastructure detail, not a scanning field.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
  ],
};

// ─── RefereeCredit ───────────────────────────────────────────────────────────

export const refereeCreditSchema: EntityFieldSchema = {
  entity: 'refereeCredit',
  label: 'Referee Credit',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Pending, paid, voided — drives commission payout workflow.',
    }),
    t0('refereeName', 'Referee', 'text', {
      width: 180,
      pinned: 'left',
      rationale: 'Who earned the commission; primary counterparty. Derived from referee_id join.',
    }),
    t0('creditAmount', 'Credit', 'currency', {
      width: 130,
      rationale: 'The commission amount — operators scan to prioritize payouts.',
    }),
    t0('transactionNo', 'Transaction', 'text', {
      width: 140,
      rationale: 'Which sale or PO generated this credit; traceability link.',
    }),

    // ── Tier 1: visible by default ──
    t1('feeType', 'Fee Type', 'text', {
      width: 110,
      rationale: 'Percentage or fixed — determines calculation method.',
    }),
    t1('feePercentage', 'Fee %', 'numeric', {
      width: 90,
      rationale: 'Commission rate; secondary to credit amount.',
    }),
    t1('amountPaid', 'Paid', 'currency', {
      width: 120,
      rationale: 'How much has been paid out; secondary to credit amount.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('paidAt', 'Paid At', 'date', {
      width: 130,
      rationale: 'Payout timestamp; audit detail, not a scanning field.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── BatchMedia ──────────────────────────────────────────────────────────────

export const batchMediaSchema: EntityFieldSchema = {
  entity: 'batchMedia',
  label: 'Batch Media',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Draft, published, replaced — lifecycle state of the media asset.',
    }),
    t0('batchId', 'Batch', 'text', {
      width: 300,
      pinned: 'left',
      rationale: 'Which inventory batch this media belongs to — the subject reference.',
    }),
    t0('mediaType', 'Type', 'enum', {
      width: 100,
      rationale: 'Photo or video — primary classification for media gallery views.',
    }),
    t0('originalFilename', 'Filename', 'text', {
      width: 200,
      rationale: 'Original uploaded filename; operators reference this when managing assets.',
    }),

    // ── Tier 1: visible by default ──
    t1('role', 'Role', 'text', {
      width: 130,
      rationale: 'Primary photo, video, or additional — determines display priority.',
    }),
    t1('mimeType', 'MIME', 'text', {
      width: 130,
      rationale: 'File format; secondary classification for compatibility checks.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('fileSize', 'Size', 'numeric', {
      width: 100,
      rationale: 'File size in bytes; infrastructure detail, not a scanning field.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── PurchaseOrderLine ───────────────────────────────────────────────────────

export const purchaseOrderLineSchema: EntityFieldSchema = {
  entity: 'purchaseOrderLine',
  label: 'PO Line',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Draft, received, posted — drives line-item receipt workflow.',
    }),
    t0('productName', 'Item', 'text', {
      width: 180,
      pinned: 'left',
      rationale: 'What was ordered — the line item product description.',
    }),
    t0('qty', 'Qty Ordered', 'numeric', {
      width: 120,
      rationale: 'Quantity ordered — the baseline against which received qty is compared.',
    }),
    t0('receivedQty', 'Qty Recv', 'numeric', {
      width: 110,
      rationale: 'Quantity received — operators scan for short-shipments and partial receipts.',
    }),
    t0('unitCost', 'Unit Cost', 'currency', {
      width: 120,
      rationale: 'Per-unit cost — drives landed cost and margin calculations.',
    }),

    // ── Tier 1: visible by default ──
    t1('uom', 'Unit', 'text', {
      width: 80,
      rationale: 'Unit of measure; qualifies the quantity fields.',
    }),
    t1('category', 'Category', 'text', {
      width: 140,
      rationale: 'Product category; secondary grouping for intake analysis.',
    }),
    t1('tags', 'Tags', 'text', {
      width: 150,
      rationale: 'Categorical organization; visible by default for filtering.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('notes', 'Notes', 'text', {
      width: 200,
      rationale: 'Line-item notes; rarely scanned in bulk.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── SalesOrderLine ──────────────────────────────────────────────────────────

export const salesOrderLineSchema: EntityFieldSchema = {
  entity: 'salesOrderLine',
  label: 'SO Line',
  fields: [
    // ── Tier 0: always visible ──
    t0('status', 'Status', 'enum', {
      width: 130,
      pinned: 'left',
      rationale: 'Draft, fulfilled, posted — drives line-item fulfillment workflow.',
    }),
    t0('itemName', 'Item', 'text', {
      width: 180,
      pinned: 'left',
      rationale: 'What was sold — the line item product name.',
    }),
    t0('qty', 'Qty Ordered', 'numeric', {
      width: 120,
      rationale: 'Quantity ordered — the baseline against which fulfillment is measured.',
    }),
    t0('unitPrice', 'Unit Price', 'currency', {
      width: 120,
      rationale: 'Per-unit selling price — drives revenue and margin calculations.',
    }),

    // ── Tier 1: visible by default ──
    t1('displayName', 'Display Name', 'text', {
      width: 180,
      rationale: 'Customer-facing product label; secondary to internal item name.',
    }),
    t1('packed', 'Packed', 'boolean', {
      width: 100,
      rationale: 'Whether this line has been packed; warehouse readiness signal.',
    }),
    t1('inventoryPosted', 'Posted', 'boolean', {
      width: 100,
      rationale: 'Accounting completeness signal; operators check during closeout.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('batchId', 'Batch ID', 'text', {
      width: 300,
      rationale: 'Foreign key to allocated batch; internal join reference only.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ─── PaymentAllocation ───────────────────────────────────────────────────────

export const paymentAllocationSchema: EntityFieldSchema = {
  entity: 'paymentAllocation',
  label: 'Payment Allocation',
  fields: [
    // ── Tier 0: always visible ──
    t0('paymentId', 'Payment', 'text', {
      width: 300,
      pinned: 'left',
      rationale: 'Which payment this allocation belongs to — the source transaction.',
    }),
    t0('invoiceId', 'Invoice', 'text', {
      width: 300,
      rationale: 'Which invoice this payment was applied against — the target transaction.',
    }),
    t0('amount', 'Amount', 'currency', {
      width: 130,
      rationale: 'How much was allocated — operators scan to verify full application.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'When the allocation occurred; audit timestamp, not a scanning field.',
    }),
  ],
};

// ─── Tag ─────────────────────────────────────────────────────────────────────

export const tagSchema: EntityFieldSchema = {
  entity: 'tag',
  label: 'Tag',
  fields: [
    // ── Tier 0: always visible ──
    t0('label', 'Label', 'text', {
      width: 180,
      pinned: 'left',
      rationale: 'Human-readable tag label — the primary display value across all surfaces.',
    }),
    t0('slug', 'Slug', 'text', {
      width: 160,
      rationale: 'Machine-readable identifier — used in filters and URL params.',
    }),
    t0('color', 'Color', 'text', {
      width: 100,
      rationale: 'Visual color swatch — operators scan by color for rapid visual grouping.',
    }),
    t0('isActive', 'Active', 'boolean', {
      width: 90,
      rationale: 'Whether this tag is available for use; controls dropdown visibility.',
    }),

    // ── Tier 1: visible by default ──
    t1('description', 'Description', 'text', {
      width: 250,
      rationale: 'What this tag means; onboarding and audit context.',
    }),

    // ── Tier 2: hidden by default ──
    t2('id', 'ID', 'text', {
      width: 300,
      rationale: 'Raw UUID — only needed in debugging or URL inspection.',
    }),
    t2('createdAt', 'Created', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden unless needed for chronological debugging.',
    }),
    t2('updatedAt', 'Updated', 'date', {
      width: 130,
      rationale: 'System timestamp; hidden by default.',
    }),
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY SCHEMA MAP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lookup map from entity key → EntityFieldSchema.
 * Views resolve their ColDef arrays by entity key through this map.
 */
export const entitySchemas: Record<string, EntityFieldSchema> = {
  purchaseOrder: purchaseOrderSchema,
  sale: saleSchema,
  intake: intakeSchema,
  item: itemSchema,
  customer: customerSchema,
  vendor: vendorSchema,
  user: userSchema,
  payment: paymentSchema,
  invoice: invoiceSchema,
  purchaseReceipt: purchaseReceiptSchema,
  vendorBill: vendorBillSchema,
  vendorPayment: vendorPaymentSchema,
  fulfillmentLine: fulfillmentLineSchema,
  pickList: pickListSchema,
  connectorRequest: connectorRequestSchema,
  matchmakingMatch: matchmakingMatchSchema,
  photographyQueue: photographyQueueSchema,
  invoiceDispute: invoiceDisputeSchema,
  correctionJournalEntry: correctionJournalEntrySchema,
  commandJournal: commandJournalSchema,
  documentSnapshot: documentSnapshotSchema,
  refereeCredit: refereeCreditSchema,
  batchMedia: batchMediaSchema,
  purchaseOrderLine: purchaseOrderLineSchema,
  salesOrderLine: salesOrderLineSchema,
  paymentAllocation: paymentAllocationSchema,
  tag: tagSchema,
};
