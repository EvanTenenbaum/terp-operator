import type { z } from 'zod';
import type { viewSchema } from '../../shared/grid-types';
import type { GridFilters } from '../../shared/gridFilters';
import {
  BatchStatus,
  PurchaseOrderStatus,
  SalesOrderStatus,
  PaymentStatus,
  InvoiceStatus,
  VendorBillStatus,
  PickListStatus,
  ConnectorRequestStatus,
  CustomerNeedStatus,
  VendorSupplyStatus,
  MatchmakingMatchStatus,
  InvoiceDisputeStatus,
  PhotographyQueueStatus,
  PurchaseReceiptStatus,
  ItemStatus,
} from '../../shared/statuses';

// ─────────────────────────────────────────────────────────────────────────────
// Per-entity BASE_WHERE — the implicit WHERE every gridSql already encodes.
// These are the conditions that must always be true for the entity view
// (e.g., "exclude archived batches"). Every filter is ANDed on top.
// ─────────────────────────────────────────────────────────────────────────────
export const BASE_WHERE: Record<string, string> = {
  reports: '1=1', // reports is a union, filtering happens in outer query
  intake: 'b.archived_at is null',
  purchaseOrders: '1=1',
  sales: '1=1',
  matchmaking: '1=1',
  orders: '1=1',
  payments: '1=1',
  inventory: 'b.archived_at is null',
  clients: '1=1',
  vendors: '1=1',
  fulfillment: '1=1',
  connectors: '1=1',
  recovery: '1=1',
  closeout: '1=1',
  referees: '1=1',
  processors: '1=1',
  photography: 'b.archived_at is null',
  purchaseReceipts: '1=1',
  items: '1=1',
  disputes: '1=1',
};

// ─────────────────────────────────────────────────────────────────────────────
// §3.1 — Per-entity status narrowing. Maps entityType → the canonical Zod
// status enum from statuses.ts so we can re-parse filters.status and reject
// bogus strings before they reach SQL.
// ─────────────────────────────────────────────────────────────────────────────
export function statusSchemaFor(
  entityType: z.infer<typeof viewSchema>
): z.ZodEnum<[string, ...string[]]> | null {
  switch (entityType) {
    case 'intake':
    case 'inventory':
    case 'photography':
      return BatchStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'purchaseOrders':
      return PurchaseOrderStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'sales':
    case 'orders':
      return SalesOrderStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'payments':
      return PaymentStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'clients':
      return null; // clients don't have a status column
    case 'vendors':
      return VendorBillStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'fulfillment':
      return PickListStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'connectors':
      return ConnectorRequestStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'matchmaking':
      return MatchmakingMatchStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'recovery':
      return null;
    case 'closeout':
      return null;
    case 'referees':
      return null;
    case 'processors':
      return null;
    case 'purchaseReceipts':
      return PurchaseReceiptStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'items':
      return ItemStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'disputes':
      return InvoiceDisputeStatus as unknown as z.ZodEnum<[string, ...string[]]>;
    case 'reports':
      return null;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §3.2 — Per-entity `filters.eq` allowlist. Keys not on this list → BAD_REQUEST.
// ─────────────────────────────────────────────────────────────────────────────
export const EQ_ALLOWLIST: Record<string, readonly string[]> = {
  purchaseOrders: ['vendorId', 'status'],
  sales: ['customerId', 'status', 'pricingStrategy'],
  orders: ['customerId', 'status', 'invoiceStatus'],
  intake: ['vendorId', 'purchaseOrderId', 'status', 'mediaStatus', 'arrivalStatus'],
  inventory: ['vendorId', 'itemId', 'category', 'subcategory', 'status'],
  payments: ['customerId', 'direction', 'category', 'method', 'status'],
  clients: ['tags'],
  vendors: ['tags'],
  fulfillment: ['status'],
  connectors: ['status'],
  matchmaking: ['status'],
  recovery: ['kind', 'severity'],
  closeout: ['severity'],
  referees: ['active'],
  processors: ['processorType'],
  photography: ['status', 'category'],
  purchaseReceipts: ['vendorId', 'purchaseOrderId', 'status'],
  items: ['category', 'status'],
  disputes: ['status', 'customerId'],
  reports: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// §3.3 — Per-entity `dateRange.field` allowlist.
// ─────────────────────────────────────────────────────────────────────────────
export const DATE_RANGE_ALLOWLIST: Record<string, readonly string[]> = {
  purchaseOrders: ['createdAt', 'orderedAt', 'expectedDate', 'receivedAt', 'cancelledAt'],
  sales: ['createdAt', 'deliveryWindow', 'postedAt', 'fulfilledAt'],
  orders: ['createdAt', 'postedAt', 'fulfilledAt', 'deliveryWindow'],
  intake: ['createdAt', 'intakeDate', 'expirationDate'],
  inventory: ['createdAt', 'intakeDate', 'expirationDate'],
  payments: ['createdAt'],
  clients: ['createdAt'],
  vendors: ['createdAt'],
  fulfillment: ['createdAt'],
  connectors: ['createdAt'],
  matchmaking: ['createdAt', 'updatedAt'],
  recovery: ['createdAt'],
  closeout: ['createdAt'],
  referees: ['createdAt'],
  processors: ['createdAt'],
  photography: ['createdAt'],
  purchaseReceipts: ['createdAt', 'receiptDate'],
  items: ['createdAt'],
  disputes: ['createdAt'],
  reports: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// §3.4 — Per-entity `sort.field` and `groupBy` allowlist.
// Columns that appear in the grid's projection, plus createdAt/updatedAt/status
// (always sortable). groupBy is restricted to categorical columns.
// ─────────────────────────────────────────────────────────────────────────────
export const SORT_ALLOWLIST: Record<string, readonly string[]> = {
  reports: ['id', 'label', 'value', 'severity', 'createdAt'],
  intake: ['id', 'batchCode', 'shorthand', 'name', 'category', 'vendor', 'vendorId', 'poNo',
    'purchaseOrderId', 'sourceCode', 'intakeDate', 'ticketCost', 'tags', 'intakeQty', 'availableQty',
    'uom', 'unitCost', 'unitPrice', 'location', 'lotCode', 'ownershipStatus', 'legacyMarker',
    'arrivalStatus', 'mediaStatus', 'expirationDate', 'notes', 'status', 'createdAt', 'updatedAt'],
  purchaseOrders: ['id', 'poNo', 'vendor', 'vendorId', 'status', 'expectedDate', 'orderedAt',
    'receivedAt', 'cancelledAt', 'total', 'prepaymentAmount', 'prepaidAmount', 'remainingPrepay',
    'lines', 'orderedQty', 'receivedQty', 'buyerNotes', 'internalNotes', 'createdAt', 'updatedAt'],
  sales: ['id', 'orderNo', 'customer', 'customerId', 'status', 'pricingStrategy', 'total',
    'internalMargin', 'lines', 'deliveryWindow', 'notes', 'packed', 'inventoryPosted',
    'paymentFollowup', 'legacyStatusMarkers', 'validationIssues', 'createdAt', 'updatedAt'],
  matchmaking: ['id', 'needCode', 'customer', 'needProduct', 'category', 'needTags', 'qtyMin',
    'qtyMax', 'targetPrice', 'neededBy', 'urgency', 'supplyCode', 'vendor', 'vendorProduct',
    'supplyTags', 'availableQty', 'askingPrice', 'availableDate', 'score', 'reasons', 'status',
    'createdAt', 'updatedAt'],
  orders: ['id', 'orderNo', 'customer', 'status', 'total', 'deliveryWindow', 'notes', 'packed',
    'inventoryPosted', 'paymentFollowup', 'legacyStatusMarkers', 'validationIssues', 'invoiceId',
    'invoiceNo', 'invoiceStatus', 'postedAt', 'fulfilledAt', 'openDisputeId',
    'crossOrderSourceOrders', 'createdAt', 'updatedAt'],
  payments: ['id', 'customer', 'customerId', 'direction', 'category', 'method', 'amount',
    'unappliedAmount', 'allocationIntent', 'impactPreview', 'reference', 'locationBucket',
    'notes', 'status', 'createdAt', 'updatedAt'],
  inventory: ['id', 'batchCode', 'name', 'category', 'subcategory', 'vendor', 'vendorId',
    'itemId', 'itemAlias', 'displayName', 'availableQty', 'reservedQty', 'uom', 'unitCost',
    'unitPrice', 'priceRange', 'tags', 'location', 'ownershipStatus', 'legacyMarker',
    'arrivalStatus', 'mediaStatus', 'lotCode', 'expirationDate', 'ageDays', 'status',
    'createdAt', 'updatedAt'],
  clients: ['id', 'name', 'creditLimit', 'balance', 'tags', 'notes', 'headroom',
    'invoiceCount', 'openInvoiceCount', 'avgDaysToPay', 'daysPastDue', 'unpaidBalance',
    'contactId', 'isDualRole', 'createdAt', 'updatedAt'],
  vendors: ['id', 'vendor', 'vendorId', 'billNo', 'poNo', 'purchaseOrderId', 'amount',
    'amountPaid', 'status', 'dueDate', 'scheduledFor', 'dueReason', 'consignmentTriggered',
    'contactId', 'receiptId', 'receiptNo', 'isDualRole', 'createdAt', 'updatedAt'],
  fulfillment: ['id', 'pickNo', 'orderNo', 'customer', 'status', 'unitsPerBag', 'labelFormat',
    'labelsPrinted', 'manifestPath', 'tracking', 'lines', 'alertCount', 'createdAt', 'updatedAt'],
  connectors: ['id', 'source', 'requestType', 'customer', 'customerId', 'status', 'routedTo',
    'operatorNotes', 'safetyNote', 'createdAt', 'updatedAt'],
  recovery: ['id', 'commandName', 'actorName', 'status', 'error', 'affectedIds',
    'reversedByCommandId', 'createdAt', 'updatedAt'],
  closeout: ['id', 'period', 'status', 'controlTotals', 'csvPath', 'jsonlPath', 'pdfPath',
    'createdAt', 'updatedAt'],
  referees: ['id', 'name', 'email', 'phone', 'balance', 'lifetimeEarned', 'paymentMethod',
    'paymentDetails', 'notes', 'active', 'relationshipsCount', 'contactId', 'createdAt', 'updatedAt'],
  processors: ['id', 'name', 'processorType', 'feeType', 'feePercentage', 'feeFixedAmount',
    'defaultUserSplit', 'defaultProcessorSplit', 'notes', 'active', 'totalFeesProcessed',
    'userFeesCollectible', 'userFeesCollected', 'processorFeesUnpaid', 'relationshipsCount',
    'contactId', 'createdAt', 'updatedAt'],
  photography: ['id', 'batchId', 'batchCode', 'name', 'mediaStatus', 'mediaUpdatedAt',
    'publishedMediaCount', 'draftMediaCount', 'hasPrimaryPhoto', 'hasPrimaryVideo',
    'createdAt', 'updatedAt'],
  purchaseReceipts: ['id', 'receiptNo', 'vendor', 'vendorId', 'poNo', 'purchaseOrderId',
    'total', 'status', 'lines', 'createdAt', 'updatedAt'],
  items: ['id', 'sku', 'name', 'alias', 'category', 'tags', 'pricingRule', 'status',
    'description', 'batchCount', 'totalAvailableQty', 'createdAt', 'updatedAt'],
  disputes: ['id', 'invoiceId', 'invoiceNo', 'customer', 'customerId', 'invoiceAmount',
    'invoiceStatus', 'status', 'reason', 'resolution', 'createdAt', 'updatedAt'],
};

export const GROUP_BY_ALLOWLIST: Record<string, readonly string[]> = {
  reports: [],
  intake: ['status', 'category', 'vendorId', 'mediaStatus', 'arrivalStatus', 'ownershipStatus'],
  purchaseOrders: ['status', 'vendorId'],
  sales: ['status', 'customerId', 'pricingStrategy'],
  matchmaking: ['status', 'category'],
  orders: ['status', 'invoiceStatus'],
  payments: ['status', 'direction', 'category', 'method', 'customerId'],
  inventory: ['status', 'category', 'subcategory', 'vendorId', 'ownershipStatus', 'mediaStatus'],
  clients: [],
  vendors: ['status'],
  fulfillment: ['status'],
  connectors: ['status'],
  recovery: ['status'],
  closeout: ['status', 'severity'],
  referees: ['active'],
  processors: ['processorType'],
  photography: ['status', 'mediaStatus', 'category'],
  purchaseReceipts: ['status', 'vendorId'],
  items: ['status', 'category'],
  disputes: ['status'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-entity text search columns (used by filters.text for ILIKE search).
// ─────────────────────────────────────────────────────────────────────────────
export const TEXT_SEARCH_COLS: Record<string, readonly string[]> = {
  reports: [],
  intake: ['b.name', 'b.batch_code', 'b.shorthand', 'b.source_code', 'v.name', 'po.po_no'],
  purchaseOrders: ['po.po_no', 'v.name'],
  sales: ['so.order_no', 'c.name'],
  matchmaking: ['c.name', 'v.name', 'cn.product_name', 'vs.product_name'],
  orders: ['so.order_no', 'c.name'],
  payments: ['c.name', 'p.reference'],
  inventory: ['b.name', 'b.batch_code', 'v.name', 'i.alias'],
  clients: ['c.name'],
  vendors: ['v.name', 'vb.bill_no', 'po.po_no'],
  fulfillment: ['pl.pick_no', 'so.order_no', 'c.name'],
  connectors: ['cr.source', 'c.name'],
  recovery: ['command_name', 'actor_name'],
  closeout: [],
  referees: ['r.name', 'r.email'],
  processors: ['p.name'],
  photography: ['b.name', 'b.batch_code'],
  purchaseReceipts: ['pr.receipt_no', 'v.name', 'po.po_no'],
  items: ['i.name', 'i.sku', 'i.alias'],
  disputes: ['i.invoice_no', 'c.name'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Escape SQL LIKE wildcards in user-supplied search text.
// ─────────────────────────────────────────────────────────────────────────────
export function escapeLike(value: string): string {
  return value.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// ─────────────────────────────────────────────────────────────────────────────
// buildGridWhereClause — single source of truth for filter → SQL.
// Returns SQL fragments and params that are ANDed with the entity's baseWhere.
// Allowlist enforcement (eq, dateRange, sort, groupBy) is done by the caller
// *before* this function is invoked, so this helper can trust its inputs.
// ─────────────────────────────────────────────────────────────────────────────
export function buildGridWhereClause(
  entityType: z.infer<typeof viewSchema>,
  filters: GridFilters | undefined,
): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (filters?.status) {
    conditions.push(`status = $${p++}`);
    params.push(filters.status);
  }

  if (filters?.text) {
    const cols = TEXT_SEARCH_COLS[entityType] ?? [];
    if (cols.length > 0) {
      const ors: string[] = [];
      const pat = `%${escapeLike(filters.text)}%`;
      for (const col of cols) {
        ors.push(`${col} ILIKE $${p++}`);
        params.push(pat);
      }
      conditions.push(`(${ors.join(' OR ')})`);
    }
  }

  if (filters?.dateRange) {
    const field = filters.dateRange.field;
    if (filters.dateRange.from) {
      conditions.push(`${field} >= $${p++}`);
      params.push(filters.dateRange.from);
    }
    if (filters.dateRange.to) {
      conditions.push(`${field} <= $${p++}`);
      params.push(filters.dateRange.to);
    }
  }

  if (filters?.eq) {
    for (const [key, value] of Object.entries(filters.eq)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else {
        conditions.push(`${key} = $${p++}`);
        params.push(value);
      }
    }
  }

  if (filters?.tags) {
    conditions.push(`tags && $${p++}::varchar[]`);
    params.push(filters.tags);
  }

  return { conditions, params };
}
