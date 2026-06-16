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

// ─── Sale — template section ─────────────────────────────────────────────────
// TODO: add Sale entity schema
// Fields should include: status, orderNo, customerName, total, orderedAt,
//   deliveryWindow, lineCount, pickStatus, paymentStatus
// Reference: src/server/schema.ts sales_orders table

// ─── Intake — template section ───────────────────────────────────────────────
// TODO: add Intake (Batch) entity schema

// ─── Vendor — template section ───────────────────────────────────────────────
// TODO: add Vendor entity schema

// ─── Customer — template section ─────────────────────────────────────────────
// TODO: add Customer entity schema

// ─── Payment — template section ──────────────────────────────────────────────
// TODO: add Payment entity schema

// ─── Closeout — template section ──────────────────────────────────────────────
// TODO: add Closeout entity schema

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY SCHEMA MAP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lookup map from entity key → EntityFieldSchema.
 * Views resolve their ColDef arrays by entity key through this map.
 */
export const entitySchemas: Record<string, EntityFieldSchema> = {
  purchaseOrder: purchaseOrderSchema,
  // TODO: add remaining entity schemas
  // sale: saleSchema,
  // intake: intakeSchema,
  // vendor: vendorSchema,
  // customer: customerSchema,
  // payment: paymentSchema,
  // closeout: closeoutSchema,
};
