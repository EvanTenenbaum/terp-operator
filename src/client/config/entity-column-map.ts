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
    { field: 'createdAt',       column: 'po.created_at',      sqlType: 'timestamp' },
    { field: 'updatedAt',       column: 'po.updated_at',      sqlType: 'timestamp' },

    // ── Derived/computed columns (from JOINs) ──
    { field: 'vendorName',      column: 'v.name',             sqlType: 'text', derived: true },
  ],
};

// ─── Sale — template section ─────────────────────────────────────────────────
// TODO: add Sale entity column map
// Source table: sales_orders, alias: so
// JOINs: customers for customerName, order counts for lineCount
// export const saleColumnMap: EntityColumnMap = { ... };

// ─── Intake (Batch) — template section ───────────────────────────────────────
// TODO: add Intake/Batch entity column map
// Source table: batches, alias: b
// JOINs: vendors for vendor name, items for item alias
// export const intakeColumnMap: EntityColumnMap = { ... };

// ─── Vendor — template section ───────────────────────────────────────────────
// TODO: add Vendor entity column map

// ─── Customer — template section ─────────────────────────────────────────────
// TODO: add Customer entity column map

// ─── Payment — template section ──────────────────────────────────────────────
// TODO: add Payment entity column map

// ─── Closeout — template section ──────────────────────────────────────────────
// TODO: add Closeout entity column map

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
  // TODO: add remaining entity column maps
  // sale: saleColumnMap,
  // intake: intakeColumnMap,
  // vendor: vendorColumnMap,
  // customer: customerColumnMap,
  // payment: paymentColumnMap,
  // closeout: closeoutColumnMap,
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
