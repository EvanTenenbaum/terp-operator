import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { protectedProcedure, publicProcedure, router } from '../trpc';
import { getDashboardData, getHealth } from '../services/metrics';
import { getCloseoutSafety } from '../services/closeout';
import { commandLabels, commandMinRole, commandNames, internalOnlyCommandNames, reversalPolicies } from '../../shared/commandCatalog';
import type { GridRow } from '../../shared/types';
import { statusCountsInputSchema, comboboxOptionsInputSchema, gridSummaryInputSchema } from '../../shared/schemas';
import { comboboxEntityTypeSchema } from '../../shared/schemas';
type ComboboxEntityType = z.infer<typeof comboboxEntityTypeSchema>;
import {
  PurchaseOrderStatus,
  PurchaseOrderLineStatus,
  SalesOrderStatus,
  SalesOrderLineStatus,
  PurchaseReceiptStatus,
  BatchStatus,
  InvoiceStatus,
  PaymentStatus,
  VendorBillStatus,
  VendorPaymentStatus,
  PickListStatus,
  FulfillmentLineStatus,
  ConnectorRequestStatus,
  CustomerNeedStatus,
  VendorSupplyStatus,
  MatchmakingMatchStatus,
  InvoiceDisputeStatus,
  PhotographyQueueStatus,
  ItemStatus,
  CorrectionJournalEntryStatus,
  CommandJournalStatus,
  DocumentSnapshotStatus,
  RefereeCreditStatus,
  BatchMediaStatus,
} from '../../shared/statuses';
import { getViewerSafeSnapshot } from '../../shared/customerSheetSnapshot';
import { commandJournal, paymentProcessors, processorFees } from '../schema';
import { assertRole, canRole } from '../rbac';
import { projectLandedCostException } from '../projections/landedCostException';
import { LANDED_COST_EXCEPTION_LATERAL_JOIN_SQL } from '../projections/landedCostExceptionSql';
import {
  gridFiltersSchema,
  gridSortSchema,
  type GridFilters,
  type GridSort,
} from '../../shared/gridFilters';
import {
  BASE_WHERE,
  statusSchemaFor,
  EQ_ALLOWLIST,
  DATE_RANGE_ALLOWLIST,
  SORT_ALLOWLIST,
  GROUP_BY_ALLOWLIST,
  buildGridWhereClause,
} from './gridWhere';
import { entityTabsRouter } from './queries.entityTabs';
import { detailQueriesRouter } from './queries.detail';

// viewSchema is now the canonical source in src/shared/grid-types.ts
// (extracted to break circular dependency between queries.ts <-> gridWhere.ts).
// Re-exported here for backward compat — existing callers (exportCsvRoute,
// commandBus) are migrated, but tests and downstream consumers may still
// reference this path.
import { viewSchema } from '../../shared/grid-types';
export { viewSchema };

// GH #309: server-side TTL cache for reference data (lookup tables that rarely change).
// Avoids firing 15 parallel DB queries on every page load/refetch.
const REFERENCE_TTL_MS = 60_000; // 1 minute
let _referenceCache: Awaited<ReturnType<typeof _fetchReferenceData>> | null = null;
let _referenceCacheAt = 0;

async function _fetchReferenceData() {
  const [customers, vendors, staff, transactionTypes, items, tags, invoices, batches, orders, purchaseOrders, backups, referees, refereeRelationships, processors, pricingDefaults, allSystemSettings] = await Promise.all([
    pool.query('select id, name, credit_limit as "creditLimit", balance, tags, pricing_rule as "pricingRule" from customers where name not like \'reaper-test-%\' order by name'),
    pool.query('select id, name, terms_days as "termsDays", consignment_default as "consignmentDefault" from vendors order by name'),
    pool.query("select id, name, role from users where role in ('owner','manager','operator') and active order by name"),
    pool.query(`select id, slug, label, direction, allowed_entity_types as "allowedEntityTypes",
                       default_method as "defaultMethod", default_bucket as "defaultBucket",
                       default_allocation_intent as "defaultAllocationIntent",
                       requires_approval as "requiresApproval", is_system as "isSystem", is_active as "isActive"
                from transaction_types
                where is_active
                order by is_system desc, direction, label`),
    pool.query('select id, sku, name, alias, category, tags, status, description from items order by name'),
    pool.query('select id, slug, label, color, description, is_active as "isActive" from tag_catalog where is_active order by label'),
    pool.query("select id, invoice_no as \"invoiceNo\", customer_id as \"customerId\", total, amount_paid as \"amountPaid\", status from invoices where status in ('open', 'partial') order by created_at"),
    pool.query(`select b.id, b.batch_code as "batchCode", b.name, b.category, b.vendor_id as "vendorId", v.name as vendor,
                       b.item_id as "itemId", i.alias as "itemAlias",
                       coalesce(i.alias, b.name) as "displayName",
                       b.available_qty as "availableQty", b.reserved_qty as "reservedQty", b.unit_price as "unitPrice",
                       b.unit_cost as "unitCost", b.uom, b.location, b.lot_code as "lotCode", b.source_code as "sourceCode",
                       b.shorthand, b.notes, b.intake_date as "intakeDate", b.ticket_cost as "ticketCost",
                       b.ownership_status as "ownershipStatus", b.price_range as "priceRange", b.tags, b.status,
                       b.legacy_marker as "legacyMarker", b.arrival_status as "arrivalStatus", b.media_status as "mediaStatus",
                       b.case_pack as "casePack",
                       b.created_at as "createdAt",
                       floor(extract(epoch from (now() - coalesce(b.intake_date, b.created_at))) / 86400)::int as "ageDays",
                       coalesce(dr.draft_reserved_qty, 0)::numeric(12,3) as "draftReservedQty"
                from batches b
                left join vendors v on v.id = b.vendor_id
                left join items i on i.id = b.item_id
                -- TER-1634 / F-28: soft reservation projection — shows how much of this
                -- batch is already held in other operators' draft/confirmed sales orders.
                -- Line statuses reserved/allocated/posted/cancelled are settled and excluded.
                left join lateral (
                  select coalesce(sum(sol.qty), 0)::numeric(12,3) as draft_reserved_qty
                  from sales_order_lines sol
                  join sales_orders so on so.id = sol.order_id
                  where so.status in ('draft', 'confirmed')
                    and sol.status not in ('reserved', 'allocated', 'posted', 'cancelled')
                    and sol.batch_id = b.id
                ) dr on true
                where b.status = 'posted' and b.available_qty > 0
                order by b.created_at desc`),
    pool.query("select id, order_no as \"orderNo\", customer_id as \"customerId\", status, total from sales_orders where status in ('draft','confirmed','posted') order by created_at desc"),
    pool.query("select id, po_no as \"poNo\", vendor_id as \"vendorId\", status, total from purchase_orders where status in ('draft','approved','ordered','partially_received') order by created_at desc"),
    pool.query('select id, label, snapshot, created_at as "createdAt" from backup_snapshots order by created_at desc'),
    pool.query('select id, name, email, balance, lifetime_earned as "lifetimeEarned", active from referees where active order by name'),
    pool.query(`select rr.id, rr.referee_id as "refereeId", r.name as "refereeName",
                       rr.entity_type as "entityType", rr.entity_id as "entityId",
                       case
                         when rr.entity_type = 'customer' then c.name
                         when rr.entity_type = 'vendor' then v.name
                       end as "entityName",
                       rr.fee_type as "feeType", rr.fee_percentage as "feePercentage",
                       rr.fee_fixed_amount as "feeFixedAmount", rr.apply_by_default as "applyByDefault",
                       rr.active
                from referee_relationships rr
                join referees r on r.id = rr.referee_id
                left join customers c on c.id = rr.entity_id and rr.entity_type = 'customer'
                left join vendors v on v.id = rr.entity_id and rr.entity_type = 'vendor'
                where rr.active
                order by r.name, rr.entity_type, "entityName"`),
    pool.query('select id, name, processor_type as "processorType", fee_type as "feeType", fee_percentage as "feePercentage", fee_fixed_amount as "feeFixedAmount", default_user_split as "defaultUserSplit", default_processor_split as "defaultProcessorSplit", active from payment_processors where active order by name'),
    pool.query("select value from system_settings where key = 'pricing.defaults' limit 1"),
    pool.query('select id, key, value from system_settings order by key')
  ]);
  return {
    customers: customers.rows,
    vendors: vendors.rows,
    staff: staff.rows,
    transactionTypes: transactionTypes.rows,
    items: items.rows,
    tags: tags.rows,
    openInvoices: invoices.rows,
    availableBatches: batches.rows,
    activeOrders: orders.rows,
    activePurchaseOrders: purchaseOrders.rows,
    backupSnapshots: backups.rows,
    referees: referees.rows,
    refereeRelationships: refereeRelationships.rows,
    processors: processors.rows,
    defaultPricingRule: pricingDefaults.rows[0]?.value ?? {},
    systemSettings: allSystemSettings.rows as Array<{ id: string; key: string; value: Record<string, unknown> }>,
    categories: ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape'],
    priceBrackets: ['under-25', '25-100', '100-plus'],
    commands: commandNames
      .filter((name) => !(internalOnlyCommandNames as readonly string[]).includes(name))
      .map((name) => ({ name, label: commandLabels[name], minRole: commandMinRole[name] }))
  };
}

/** Invalidate the reference cache (call after mutations that affect lookup tables). */
export function invalidateReferenceCache() {
  _referenceCache = null;
  _referenceCacheAt = 0;
}

// ─── statusCounts per-entity registry (§1.4 of procedures/statusCounts.md) ──

type StatusCountsEntry = {
  table: string;
  statusEnum: z.ZodEnum<[string, ...string[]]>;
  minRole: 'operator' | 'manager';
  baseWhere?: string;
};

const STATUS_COUNTS_REGISTRY: Record<string, StatusCountsEntry> = {
  purchaseOrder:        { table: 'purchase_orders',      statusEnum: PurchaseOrderStatus,         minRole: 'operator' },
  purchaseOrderLines:   { table: 'purchase_order_lines',  statusEnum: PurchaseOrderLineStatus,     minRole: 'operator' },
  salesOrder:           { table: 'sales_orders',          statusEnum: SalesOrderStatus,            minRole: 'operator' },
  salesOrderLines:      { table: 'sales_order_lines',     statusEnum: SalesOrderLineStatus,        minRole: 'operator' },
  purchaseReceipt:      { table: 'purchase_receipts',     statusEnum: PurchaseReceiptStatus,       minRole: 'operator' },
  batch:                { table: 'batches',               statusEnum: BatchStatus,                 minRole: 'operator', baseWhere: 'archived_at IS NULL' },
  invoice:              { table: 'invoices',              statusEnum: InvoiceStatus,               minRole: 'operator' },
  payment:              { table: 'payments',              statusEnum: PaymentStatus,               minRole: 'operator' },
  vendorBill:           { table: 'vendor_bills',          statusEnum: VendorBillStatus,            minRole: 'operator' },
  vendorPayment:        { table: 'vendor_payments',       statusEnum: VendorPaymentStatus,         minRole: 'manager' },
  pickList:             { table: 'pick_lists',            statusEnum: PickListStatus,              minRole: 'operator' },
  fulfillmentLine:      { table: 'fulfillment_lines',     statusEnum: FulfillmentLineStatus,       minRole: 'operator' },
  connectorRequest:     { table: 'connector_requests',    statusEnum: ConnectorRequestStatus,      minRole: 'operator' },
  customerNeeds:        { table: 'customer_needs',        statusEnum: CustomerNeedStatus,          minRole: 'operator' },
  vendorSupply:         { table: 'vendor_supply',         statusEnum: VendorSupplyStatus,          minRole: 'operator' },
  matchmakingMatch:     { table: 'matchmaking_matches',   statusEnum: MatchmakingMatchStatus,      minRole: 'operator' },
  invoiceDispute:       { table: 'invoice_disputes',      statusEnum: InvoiceDisputeStatus,        minRole: 'operator' },
  photographyQueue:     { table: 'photography_queue',     statusEnum: PhotographyQueueStatus,      minRole: 'operator' },
  item:                 { table: 'items',                 statusEnum: ItemStatus,                  minRole: 'operator' },
  correctionJournalEntry: { table: 'correction_journal_entries', statusEnum: CorrectionJournalEntryStatus, minRole: 'operator' },
  commandJournal:       { table: 'command_journal',       statusEnum: CommandJournalStatus,         minRole: 'manager' },
  documentSnapshot:     { table: 'document_snapshots',    statusEnum: DocumentSnapshotStatus,       minRole: 'operator' },
  refereeCredit:        { table: 'referee_credits',       statusEnum: RefereeCreditStatus,          minRole: 'operator' },
  batchMedia:           { table: 'batch_media',           statusEnum: BatchMediaStatus,             minRole: 'operator' },
};

// ─── gridInputSchema — extended input for grid v2, with backwards-compat
// `view` alias accepted alongside new `entityType`.
//
// NOTE: The grid procedure (gridSqlParts, EQ_ALLOWLIST, SORT_ALLOWLIST,
// statusSchemaFor, etc.) expects VIEW NAMES (e.g. 'sales', 'inventory',
// 'purchaseOrders'), NOT entity types. Do NOT insert a normalization
// layer here — it will cause all grid queries to return 500 because
// gridSqlParts has no case for the entity type form.
//
// Separate normalization (if needed for other procedures like
// statusCounts or gridSummary) should happen at those procedure
// boundaries, not in the shared gridInputSchema.

export const gridInputSchemaRaw = z.object({
  entityType: viewSchema.optional(),
  view: viewSchema.optional(), // deprecated alias; removed in Phase 4
  filters: gridFiltersSchema.optional(),
  sort: gridSortSchema.optional(),
  groupBy: z.string().min(1).max(40).optional(),
  limit: z.number().int().min(1).max(1000).nullable().default(null),
  offset: z.number().int().min(0).default(0)
}).superRefine((input, ctx) => {
  if (!input.entityType && !input.view) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entityType'], message: 'entityType is required.' });
  }
  if (input.offset > 0 && !input.sort) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sort'], message: 'sort is required when offset > 0 (deterministic pagination).' });
  }
});

export const gridInputSchema = gridInputSchemaRaw.transform((input) => ({
  ...input,
  entityType: (input.entityType ?? input.view)!,
}));

export type GridInput = z.infer<typeof gridInputSchema>;

// Strip non-procedure router properties (_def, createCaller, getErrorShape)
// before spreading sub-routers into the top-level router. Spreading them raw
// causes tRPC's recursiveGetPaths to choke on `'router' in undefined`.
const { _def: _etDef, createCaller: _etCC, getErrorShape: _etES, ...entityTabProcedures } = entityTabsRouter;
const { _def: _dqDef, createCaller: _dqCC, getErrorShape: _dqES, ...detailQueryProcedures } = detailQueriesRouter;

export const queriesRouter = router({
  dashboard: protectedProcedure.query(({ ctx }) => getDashboardData(ctx.user.role)),
  // GH #359: Credit watch watchlist — top customers by credit risk.
  creditWatchlist: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ input, ctx }) => {
      assertRole(ctx.user, 'manager');
      const { limit } = input;
      const rows = await pool.query<{
        customer_id: string;
        customer_name: string;
        balance: string;
        credit_limit: string;
        overall_score: string | null;
      }>(
        `WITH latest_assessment AS (
           SELECT DISTINCT ON (customer_id)
             customer_id,
             overall_score
           FROM customer_credit_assessments
           ORDER BY customer_id, created_at DESC
         )
         SELECT
           c.id AS customer_id,
           c.name AS customer_name,
           COALESCE(c.balance, 0)::text AS balance,
           COALESCE(c.credit_limit, 0)::text AS credit_limit,
           la.overall_score::text AS overall_score
         FROM customers c
         LEFT JOIN latest_assessment la ON la.customer_id = c.id
         ORDER BY
           -- at-risk (balance > credit_limit) first, then watch (high utilization), then good
           CASE
             WHEN COALESCE(c.credit_limit, 0) <= 0 AND COALESCE(c.balance, 0) > 0 THEN 1
             WHEN COALESCE(c.credit_limit, 0) > 0 AND c.balance >= c.credit_limit THEN 1
             WHEN COALESCE(c.credit_limit, 0) > 0 AND c.balance::numeric / c.credit_limit::numeric >= 0.75 THEN 2
             ELSE 3
           END,
           c.balance DESC NULLS LAST
         LIMIT $1`,
        [limit]
      );
      return rows.rows.map((r) => {
        const balance = Number(r.balance);
        const creditLimit = Number(r.credit_limit);
        const headroom = creditLimit - balance;
        const utilizationPct = creditLimit > 0 ? Math.round((balance / creditLimit) * 100) : 0;
        const overallScore = r.overall_score !== null ? Number(r.overall_score) : null;
        let risk: 'good' | 'watch' | 'at-risk' = 'good';
        if (creditLimit <= 0 && balance > 0) {
          risk = 'at-risk';
        } else if (creditLimit > 0 && balance >= creditLimit) {
          risk = 'at-risk';
        } else if (creditLimit > 0 && balance / creditLimit >= 0.75) {
          risk = 'watch';
        }
        return {
          customerId: r.customer_id,
          customerName: r.customer_name,
          balance,
          creditLimit,
          headroom,
          utilizationPct,
          overallScore,
          risk
        };
      });
    }),
  health: protectedProcedure.query(() => getHealth()),
  reference: protectedProcedure.query(async () => {
    // GH #309: return cached result if within TTL; otherwise re-fetch and repopulate.
    if (_referenceCache !== null && Date.now() - _referenceCacheAt < REFERENCE_TTL_MS) {
      return _referenceCache;
    }
    _referenceCache = await _fetchReferenceData();
    _referenceCacheAt = Date.now();
    return _referenceCache;
  }),
  // P0-2 / T-B-02: Entity-aware autocomplete — one endpoint for 11 entity
  // types with per-entity search columns, status narrowing, and role gating.
  // Feeds ComboboxCellEditor, FilterToolbar, VendorSearch, CustomerSearch.
  comboboxOptions: protectedProcedure
    .input(comboboxOptionsInputSchema)
    .query(async ({ input, ctx }) => {
      const { entityType, search, limit, filters } = input;

      // All supported entities require operator+ (matching queries.grid parity).
      assertRole(ctx.user, 'operator');

      // Per-entity allowed filter keys — reject anything not in the set.
      const ALLOWED_FILTERS: Record<ComboboxEntityType, readonly string[]> = {
        customer:        ['tags'],
        vendor:          ['tags'],
        staff:           ['roles'],
        item:            ['status', 'category'],
        batch:           ['status', 'availableQty'],
        tag:             [],
        transactionType: ['direction'],
        purchaseOrder:   ['status'],
        salesOrder:      ['status'],
        invoice:         ['status'],
        vendorBill:      ['status'],
      };
      const allowed = new Set(ALLOWED_FILTERS[entityType]);
      if (filters) {
        for (const key of Object.keys(filters)) {
          if (!allowed.has(key)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Filter '${key}' not allowed for entityType '${entityType}'.`,
            });
          }
        }
      }

      // Status narrowing: re-parse against the canonical per-entity enum.
      let validatedStatus: string | undefined;
      if (filters?.status) {
        const STATUS_SCHEMA: Partial<Record<ComboboxEntityType, z.ZodTypeAny>> = {
          item:          ItemStatus,
          batch:         BatchStatus,
          purchaseOrder: PurchaseOrderStatus,
          salesOrder:    SalesOrderStatus,
          invoice:       InvoiceStatus,
          vendorBill:    VendorBillStatus,
        };
        const schema = STATUS_SCHEMA[entityType];
        if (!schema) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Status filter not supported for entityType '${entityType}'.`,
          });
        }
        const parsed = schema.safeParse(filters.status);
        if (!parsed.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid status '${filters.status}' for entityType '${entityType}'.`,
          });
        }
        validatedStatus = parsed.data;
      }

      // Escape LIKE/ILIKE special characters.
      const escapeLike = (s: string) => s.replace(/[%_]/g, '\\$&');
      const hasSearch = search.length > 0;

      // Build parameterized query.
      const params: unknown[] = [];
      const add = (v: unknown) => { params.push(v); return `$${params.length}`; };

      let select = '';
      let from = '';
      const where: string[] = [];
      const searchCols: string[] = [];
      let order = '';

      switch (entityType) {
        case 'customer': {
          select = `c.id::text as id, c.name as label, null::text as sublabel, null::text as status, null::numeric as "availableQty", c.balance::numeric(14,2) as balance`;
          from = `customers c`;
          where.push(`c.name not like 'reaper-test-%'`);
          const customerTags = filters?.tags as string[] | undefined;
          if (customerTags?.length) where.push(`c.tags && ${add(customerTags)}::text[]`);
          searchCols.push('c.name', 'c.id::text');
          order = `c.balance desc, c.name asc`;
          break;
        }
        case 'vendor': {
          select = `v.id::text as id, v.name as label, null::text as sublabel, null::text as status, null::numeric as "availableQty", null::numeric as balance`;
          from = `vendors v`;
          const vendorTags = filters?.tags as string[] | undefined;
          if (vendorTags?.length) where.push(`v.tags && ${add(vendorTags)}::text[]`);
          searchCols.push('v.name', 'v.id::text');
          order = `v.name asc`;
          break;
        }
        case 'staff': {
          select = `u.id::text as id, u.name as label, u.role::text as sublabel, null::text as status, null::numeric as "availableQty", null::numeric as balance`;
          from = `users u`;
          where.push(`u.active`);
          const rolesFilter = filters?.roles as string[] | undefined;
          if (rolesFilter?.length) where.push(`u.role = any(${add(rolesFilter)}::text[])`);
          searchCols.push('u.name', 'u.email');
          order = `u.role asc, u.name asc`;
          break;
        }
        case 'item': {
          select = `i.id::text as id, i.name as label, case when i.alias <> i.name then i.alias else null end as sublabel, i.status, null::numeric as "availableQty", null::numeric as balance`;
          from = `items i`;
          if (validatedStatus) {
            where.push(`i.status = ${add(validatedStatus)}`);
          } else {
            where.push(`i.status = 'active'`);
          }
          if (filters?.category) where.push(`i.category = ${add(filters.category)}`);
          searchCols.push('i.name', 'i.alias', 'i.sku');
          order = `i.name asc`;
          break;
        }
        case 'batch': {
          select = `b.id::text as id, coalesce(i.alias, b.name) as label, concat(b.batch_code, ' · ', v.name) as sublabel, b.status, b.available_qty::numeric(12,3) as "availableQty", null::numeric as balance, case when b.available_qty <= 0 then 'Out of stock' else null end as "disabledReason"`;
          from = `batches b left join items i on i.id = b.item_id left join vendors v on v.id = b.vendor_id`;
          if (validatedStatus) {
            where.push(`b.status = ${add(validatedStatus)}`);
          }
          if (filters?.availableQty === 'positive') {
            where.push(`b.available_qty > 0`);
          }
          searchCols.push('b.batch_code', 'b.name', 'b.lot_code', 'b.shorthand', 'b.source_code');
          order = `b.created_at desc`;
          break;
        }
        case 'tag': {
          select = `t.id::text as id, t.label, t.slug as sublabel, null::text as status, null::numeric as "availableQty", null::numeric as balance`;
          from = `tag_catalog t`;
          where.push(`t.is_active`);
          searchCols.push('t.label', 't.slug');
          order = `t.label asc`;
          break;
        }
        case 'transactionType': {
          select = `tt.id::text as id, tt.label, tt.direction as sublabel, null::text as status, null::numeric as "availableQty", null::numeric as balance`;
          from = `transaction_types tt`;
          where.push(`tt.is_active`);
          if (filters?.direction) where.push(`tt.direction = ${add(filters.direction)}`);
          searchCols.push('tt.label', 'tt.slug');
          order = `tt.is_system desc, tt.direction, tt.label`;
          break;
        }
        case 'purchaseOrder': {
          select = `po.id::text as id, po.po_no as label, concat(v.name, ' · ', po.status) as sublabel, po.status, null::numeric as "availableQty", null::numeric as balance`;
          from = `purchase_orders po left join vendors v on v.id = po.vendor_id`;
          if (validatedStatus) where.push(`po.status = ${add(validatedStatus)}`);
          searchCols.push('po.po_no', 'v.name');
          order = `po.created_at desc`;
          break;
        }
        case 'salesOrder': {
          select = `so.id::text as id, so.order_no as label, concat(c.name, ' · ', so.status) as sublabel, so.status, null::numeric as "availableQty", null::numeric as balance`;
          from = `sales_orders so left join customers c on c.id = so.customer_id`;
          if (validatedStatus) where.push(`so.status = ${add(validatedStatus)}`);
          searchCols.push('so.order_no', 'c.name');
          order = `so.created_at desc`;
          break;
        }
        case 'invoice': {
          select = `i.id::text as id, i.invoice_no as label, concat(c.name, ' · ', i.status, ' · ', (i.total - i.amount_paid)::numeric(14,2)) as sublabel, i.status, null::numeric as "availableQty", null::numeric as balance`;
          from = `invoices i left join customers c on c.id = i.customer_id`;
          if (validatedStatus) where.push(`i.status = ${add(validatedStatus)}`);
          searchCols.push('i.invoice_no', 'c.name');
          order = `i.created_at desc`;
          break;
        }
        case 'vendorBill': {
          select = `vb.id::text as id, vb.bill_no as label, concat(v.name, ' · ', vb.status) as sublabel, vb.status, null::numeric as "availableQty", null::numeric as balance`;
          from = `vendor_bills vb left join vendors v on v.id = vb.vendor_id`;
          if (validatedStatus) where.push(`vb.status = ${add(validatedStatus)}`);
          searchCols.push('vb.bill_no', 'v.name');
          order = `vb.created_at desc`;
          break;
        }
      }

      // Search condition — single ILIKE across all searchable columns.
      if (hasSearch) {
        const pattern = `%${escapeLike(search)}%`;
        const p = add(pattern);
        where.push(`(${searchCols.map((col) => `${col} ilike ${p}`).join(' or ')})`);

        // Anchored-priority: rows where the primary label column starts with
        // the search term sort first.
        const anchored = `${escapeLike(search)}%`;
        const ap = add(anchored);
        order = `case when ${searchCols[0]} ilike ${ap} then 0 else 1 end, ${order}`;
      }

      const fetchLimit = limit + 1; // fetch one extra for truncation detection
      const limitP = add(fetchLimit);
      const whereClause = where.length ? `where ${where.join(' and ')}` : '';

      const sql = `select ${select} from ${from} ${whereClause} order by ${order} limit ${limitP}`;

      const result = await pool.query(sql, params);
      const rows = result.rows;
      const truncated = rows.length > limit;
      if (truncated) rows.pop();

      interface LookupResultRow {
        id: string;
        label: string;
        sublabel?: string;
        status?: string;
        availableQty?: number;
        balance?: number;
        disabledReason?: string;
      }
      const options: LookupResultRow[] = rows.map((row: Record<string, unknown>) => ({
        id:             String(row.id),
        label:          String(row.label ?? ''),
        sublabel:       row.sublabel != null ? String(row.sublabel) : undefined,
        status:         row.status != null ? String(row.status) : undefined,
        availableQty:   row.availableQty != null ? Number(row.availableQty) : undefined,
        balance:        row.balance != null ? Number(row.balance) : undefined,
        disabledReason: row.disabledReason != null ? String(row.disabledReason) : undefined,
      }));

      let noResultsHint: string | undefined;
      if (options.length === 0) {
        const parts: string[] = [];
        if (hasSearch) parts.push(`No results for "${search}".`);
        else parts.push('No matching records.');
        if (filters && Object.keys(filters).length > 0) parts.push('Try clearing filters.');
        else if (hasSearch) parts.push('Try a different search term.');
        noResultsHint = parts.join(' ');
      }

      return {
        entityType,
        options,
        noResultsHint,
        truncated,
      };
    }),
  grid: protectedProcedure.input(gridInputSchema).query(async ({ input, ctx }) => {
    const entityType = input.entityType;
    const filtersInput = input.filters;
    const sortInput = input.sort;
    const groupBy = input.groupBy;
    const limit = input.limit;
    const offset = input.offset;

    // ── Per-entity allowlist enforcement (§3.1–3.4) ──

    // 3.1 Status: re-parse against canonical status enum
    if (filtersInput?.status) {
      const schema = statusSchemaFor(entityType as Parameters<typeof statusSchemaFor>[0]);
      if (schema) {
        const parsed = schema.safeParse(filtersInput.status);
        if (!parsed.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid status "${filtersInput.status}" for entity "${entityType}".`,
          });
        }
      }
    }

    // 3.2 eq: each key must be in the allowlist
    if (filtersInput?.eq) {
      const allowed = EQ_ALLOWLIST[entityType] ?? [];
      for (const key of Object.keys(filtersInput.eq)) {
        if (!allowed.includes(key)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `eq key "${key}" is not allowed for entity "${entityType}".`,
          });
        }
      }
    }

    // 3.3 dateRange.field must be in allowlist
    if (filtersInput?.dateRange?.field) {
      const allowed = DATE_RANGE_ALLOWLIST[entityType] ?? [];
      if (!allowed.includes(filtersInput.dateRange.field)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `dateRange field "${filtersInput.dateRange.field}" is not allowed for entity "${entityType}".`,
        });
      }
    }

    // 3.4 sort.field must be in allowlist
    if (sortInput) {
      const allowed = SORT_ALLOWLIST[entityType] ?? [];
      if (!allowed.includes(sortInput.field)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `sort field "${sortInput.field}" is not allowed for entity "${entityType}".`,
        });
      }
    }

    // 3.4 groupBy must be in allowlist
    if (groupBy) {
      const allowed = GROUP_BY_ALLOWLIST[entityType] ?? [];
      if (!allowed.includes(groupBy)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `groupBy field "${groupBy}" is not allowed for entity "${entityType}".`,
        });
      }
    }

    // ── Build and execute ──
    const { sql, params } = buildGridV2Query(
      entityType as Parameters<typeof buildGridV2Query>[0],
      filtersInput,
      sortInput,
      groupBy,
      limit,
      offset,
    );
    const result = await pool.query<Record<string, unknown>>(sql, params.length > 0 ? params : undefined);
    const allRows = result.rows;

    // Extract __totalRows from the first row (it's the same on every row)
    const totalRows = allRows.length > 0
      ? Number(allRows[0]?.['__totalRows'] ?? allRows.length)
      : 0;

    // Strip the internal column from the response
    const rows: GridRow[] = allRows.map((row) => {
      const { __totalRows: _total, ...rest } = row as Record<string, unknown>;
      return rest as GridRow;
    });

    // ── Role projection (v1 parity, §6) ──
    const canViewSensitive = canRole(ctx.user.role, 'manager');
    let projectedRows: GridRow[];
    if (entityType === 'sales' && !canViewSensitive) {
      projectedRows = rows.map((row) => ({ ...row, internalMargin: null, marginWaivedTotal: null } as GridRow));
    } else if (entityType === 'inventory' && !canViewSensitive) {
      projectedRows = rows.map((row) => ({ ...row, unitCost: null } as GridRow));
    } else {
      projectedRows = rows as GridRow[];
    }

    // Return array with metadata properties for backwards compat:
    // existing callers access .length/.map()/etc. as before;
    // new callers access .entityType and .totalRows.
    const gridResult = projectedRows as GridRow[] & { entityType: string; totalRows: number };
    gridResult.entityType = entityType;
    gridResult.totalRows = totalRows;
    return gridResult;
  }),
  // ─── statusCounts — per-entity status distribution for ViewTabBar ────────
  statusCounts: protectedProcedure
    .input(statusCountsInputSchema)
    .query(async ({ input, ctx }) => {

      const entry = STATUS_COUNTS_REGISTRY[input.entityType];
      if (!entry) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown entity type: ${input.entityType}` });
      }
      assertRole(ctx.user, entry.minRole);

      const { table, statusEnum, baseWhere } = entry;
      const whereClause = baseWhere ? `WHERE ${baseWhere}` : '';

      const { rows } = await pool.query<{ status: string; cnt: number }>(
        `SELECT status, count(*)::int AS cnt FROM ${table} ${whereClause} GROUP BY status`
      );

      // Build lookup from DB results
      const dbCounts = new Map<string, number>();
      for (const row of rows) {
        dbCounts.set(row.status, row.cnt);
      }

      const enumValues = statusEnum.options as readonly string[];

      // §4.1 invariant 4: phantom status in DB → INTERNAL_SERVER_ERROR
      for (const row of rows) {
        if (!enumValues.includes(row.status)) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Status '${row.status}' on ${input.entityType} is not in canonical enum.`
          });
        }
      }

      // §4.1 invariants 2–3: zero-fill, enum declaration order
      const statuses = enumValues.map((status) => ({
        status,
        count: dbCounts.get(status) ?? 0,
      }));

      return { entityType: input.entityType, statuses };
    }),
  // ─── gridSummary — Aggregate summary for grid view toolbar (T-B-03) ──────
  gridSummary: protectedProcedure
    .input(gridSummaryInputSchema)
    .query(async ({ input }) => {
      const { entityType, filters: filtersInput } = input;

      const ENTITY_MAP: Record<string, { table: string; currencyCol?: string; qtyCol?: string }> = {
        purchaseOrder:   { table: 'purchase_orders',   currencyCol: 'total' },
        salesOrder:      { table: 'sales_orders',      currencyCol: 'total' },
        batch:           { table: 'batches',           qtyCol: 'available_qty' },
        payment:         { table: 'payments',          currencyCol: 'amount' },
        invoice:         { table: 'invoices',          currencyCol: 'total' },
        purchaseReceipt: { table: 'purchase_receipts' },
        vendorBill:      { table: 'vendor_bills',      currencyCol: 'amount' },
        vendorPayment:   { table: 'vendor_payments',   currencyCol: 'amount' },
        fulfillmentLine: { table: 'fulfillment_lines' },
      };

      const mapping = ENTITY_MAP[entityType];
      if (!mapping) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown entity type: ${entityType}` });
      }

      const { table, currencyCol, qtyCol } = mapping;

      // Build WHERE clause from grid v2 filter shape
      const conditions: string[] = [];
      const params: unknown[] = [];
      let p = 1;

      const escapeLike = (s: string) => s.replace(/[%_]/g, '\\$&');

      if (filtersInput?.status) {
        conditions.push(`status = $${p++}`);
        params.push(filtersInput.status);
      }

      if (filtersInput?.text) {
        const textCols = ['name', 'notes'];
        const ors: string[] = [];
        const pat = `%${escapeLike(filtersInput.text)}%`;
        for (const col of textCols) {
          ors.push(`${col} ILIKE $${p++}`);
          params.push(pat);
        }
        conditions.push(`(${ors.join(' OR ')})`);
      }

      if (filtersInput?.dateRange) {
        const field = filtersInput.dateRange.field;
        if (filtersInput.dateRange.from) {
          conditions.push(`${field} >= $${p++}`);
          params.push(filtersInput.dateRange.from);
        }
        if (filtersInput.dateRange.to) {
          conditions.push(`${field} <= $${p++}`);
          params.push(filtersInput.dateRange.to);
        }
      }

      if (filtersInput?.eq) {
        for (const [key, value] of Object.entries(filtersInput.eq)) {
          if (value === null) {
            conditions.push(`${key} IS NULL`);
          } else {
            conditions.push(`${key} = $${p++}`);
            params.push(value);
          }
        }
      }

      if (filtersInput?.tags) {
        conditions.push(`tags && $${p++}::varchar[]`);
        params.push(filtersInput.tags);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Build aggregate SELECT
      const selects: string[] = ['count(*)::int as cnt'];
      if (currencyCol) {
        selects.push(`COALESCE(SUM(${currencyCol}), 0)::numeric(14,2) as currency_total`);
      }
      if (qtyCol) {
        selects.push(`COALESCE(SUM(${qtyCol}), 0)::numeric(12,3) as qty_sum`);
      }

      const aggSql = `SELECT ${selects.join(', ')} FROM ${table} ${whereClause}`;
      const aggResult = await pool.query(aggSql, params);
      const aggRow = (aggResult.rows[0] ?? {}) as Record<string, unknown>;
      const count = Number(aggRow.cnt ?? 0);
      const currencyTotal = currencyCol ? Number(aggRow.currency_total ?? 0) : undefined;

      // Status breakdown
      const statusSql = `SELECT status, count(*)::int as count FROM ${table} ${whereClause} GROUP BY status ORDER BY status`;
      const statusResult = await pool.query(statusSql, params);
      const statusCounts = ((statusResult.rows ?? []) as Array<{ status: string; count: number }>).map(r => ({
        status: String(r.status),
        count: Number(r.count),
      }));

      // Metric labels
      const metricLabels: Array<{ label: string; value: string }> = [];
      if (qtyCol && aggRow.qty_sum !== undefined) {
        metricLabels.push({ label: 'Available Qty', value: Number(aggRow.qty_sum).toFixed(3) });
      }

      return {
        entityType,
        count,
        currencyTotal,
        summary: {
          totalRows: count,
          currencyTotal,
          statusCounts,
          metricLabels,
        },
      };
    }),
  transactionLedger: protectedProcedure.query(async () => {
    const rows = (
      await pool.query(
        `select *
         from (
           select p.id,
                  'payment' as "sourceType",
                  p.id as "sourceId",
                  'receiving' as direction,
                  p.created_at as date,
                  p.customer_id as "entityId",
                  'customer' as "entityType",
                  coalesce(c.name, 'Unknown customer') as "entityLabel",
                  p.amount,
                  p.method,
                  p.location_bucket as bucket,
                  p.category as "transactionType",
                  p.allocation_intent as "allocationIntent",
                  case
                    when p.allocation_intent = 'unapplied' then 'Unapplied'
                    when p.allocation_intent in ('selected', 'selected_invoice') then coalesce((select i.invoice_no from payment_allocations pa join invoices i on i.id = pa.invoice_id where pa.payment_id = p.id order by pa.created_at limit 1), 'Selected invoice')
                    else 'FIFO oldest invoices'
                  end as "allocationTargetLabel",
                  p.reference,
                  p.notes,
                  p.status,
                  p.impact_preview as "impactPreview",
                  (select cj.id from command_journal cj where p.id::text = any(cj.affected_ids) order by cj.created_at desc limit 1) as "commandId"
           from payments p
           left join customers c on c.id = p.customer_id
           where p.status not in ('reversed', 'refunded')
           union all
           select vp.id,
                  'vendor_payment' as "sourceType",
                  vp.id as "sourceId",
                  'paying' as direction,
                  vp.created_at as date,
                  vb.vendor_id as "entityId",
                  'vendor' as "entityType",
                  coalesce(v.name, 'Unknown vendor') as "entityLabel",
                  vp.amount,
                  vp.method,
                  'accounting' as bucket,
                  case when vb.purchase_order_id is not null then 'vendor_product_payment' else 'vendor_payout' end as "transactionType",
                  case when vb.purchase_order_id is not null then 'selected_po' else 'selected_bill' end as "allocationIntent",
                  coalesce(po.po_no, vb.bill_no) as "allocationTargetLabel",
                  vp.reference,
                  vb.due_reason as notes,
                  vp.status,
                  concat('Pays ', vp.amount, ' on ', coalesce(po.po_no, vb.bill_no)) as "impactPreview",
                  (select cj.id from command_journal cj where vp.id::text = any(cj.affected_ids) order by cj.created_at desc limit 1) as "commandId"
           from vendor_payments vp
           join vendor_bills vb on vb.id = vp.vendor_bill_id
           left join vendors v on v.id = vb.vendor_id
           left join purchase_orders po on po.id = vb.purchase_order_id
           where vp.status <> 'void' and vb.status <> 'reversed'
           union all
           select cje.id,
                  'correction' as "sourceType",
                  cje.id as "sourceId",
                  case when cje.amount::numeric < 0 then 'paying' else 'receiving' end as direction,
                  cje.created_at as date,
                  null::uuid as "entityId",
                  'other' as "entityType",
                  'Manual / other' as "entityLabel",
                  abs(cje.amount::numeric) as amount,
                  'journal' as method,
                  'accounting' as bucket,
                  'correction' as "transactionType",
                  'unapplied' as "allocationIntent",
                  'Journal' as "allocationTargetLabel",
                  null::varchar as reference,
                  cje.memo as notes,
                  cje.status,
                  cje.memo as "impactPreview",
                  (select cj.id from command_journal cj where cje.id::text = any(cj.affected_ids) order by cj.created_at desc limit 1) as "commandId"
           from correction_journal_entries cje
           where cje.status <> 'reversed'
         ) ledger
         order by date desc
         limit 500`
      )
    ).rows;
    return {
      receiving: rows.filter((row) => row.direction === 'receiving'),
      paying: rows.filter((row) => row.direction === 'paying')
    };
  }),
  matchmakingBoard: protectedProcedure.query(async () => {
    const [needs, supplies, matches] = await Promise.all([
      pool.query(customerNeedsSql()),
      pool.query(vendorSupplySql()),
      pool.query(matchmakingSql())
    ]);
    return { needs: needs.rows, supplies: supplies.rows, matches: matches.rows };
  }),
  matchmakingSettings: protectedProcedure.query(async () => {
    const [row] = (await pool.query(
      `select
         match_quality_floor as "matchQualityFloor",
         work_queue_threshold as "workQueueThreshold",
         history_lookback_days as "historyLookbackDays",
         repeat_threshold as "repeatThreshold",
         gap_floor_qty as "gapFloorQty",
         show_clients_column as "showClientsColumn",
         show_vendors_column as "showVendorsColumn",
         work_queue_enabled as "workQueueEnabled"
       from matchmaking_settings
       limit 1`
    )).rows;
    return row ?? {
      matchQualityFloor: 35,
      workQueueThreshold: 75,
      historyLookbackDays: 90,
      repeatThreshold: 3,
      gapFloorQty: 0,
      showClientsColumn: false,
      showVendorsColumn: false,
      workQueueEnabled: true,
    };
  }),
  matchmakingOpportunities: protectedProcedure.query(async () => {
    const [settingsRow] = (await pool.query('select * from matchmaking_settings limit 1')).rows;
    const settings = settingsRow ?? { history_lookback_days: 90, repeat_threshold: 3, gap_floor_qty: 0 };
    const lookback = Number(settings.history_lookback_days);
    const repeatThreshold = Number(settings.repeat_threshold);
    const gapFloor = Number(settings.gap_floor_qty);

    // Leg 2: Inventory to move
    const toMoveResult = await pool.query(
      `with in_stock as (
         select b.id as batch_id,
                b.name as product,
                b.category,
                b.available_qty as on_hand
         from batches b
         where b.status in ('processed', 'available', 'ready')
           and b.available_qty > 0
       ),
       customer_history as (
         select b2.category,
                so.customer_id,
                c.name as customer_name,
                count(*) as purchase_count,
                max(so.created_at) as last_activity
         from sales_order_lines sol
         join batches b2 on b2.id = sol.batch_id
         join sales_orders so on so.id = sol.order_id
         join customers c on c.id = so.customer_id
         where so.created_at > now() - ($1 || ' days')::interval
           and so.status not in ('cancelled', 'void')
           and sol.batch_id is not null
         group by b2.category, so.customer_id, c.name
       ),
       posted_needs as (
         select cn.customer_id,
                cu.name as customer_name,
                cn.category,
                cn.id as need_id,
                cn.product_name as need_product,
                cn.target_price
         from customer_needs cn
         join customers cu on cu.id = cn.customer_id
         where cn.status = 'open'
       ),
       already_matched as (
         select cn.customer_id, cn.category
         from matchmaking_matches mm
         join customer_needs cn on cn.id = mm.customer_need_id
         where mm.status = 'accepted'
       )
       select
         s.batch_id as "batchId",
         s.product,
         s.category,
         s.on_hand as "onHand",
         coalesce(pn.customer_id, ch.customer_id) as "customerId",
         coalesce(pn.customer_name, ch.customer_name) as customer,
         case
           when pn.customer_id is not null and ch.purchase_count >= $2 then 'both'
           when pn.customer_id is not null then 'need'
           else 'history'
         end as signal,
         coalesce(ch.last_activity, now()) as "lastActivity",
         coalesce(ch.purchase_count, 0) as "purchaseCount"
       from in_stock s
       left join posted_needs pn on pn.category = s.category
       left join customer_history ch
         on ch.category = s.category
         and (pn.customer_id is null or ch.customer_id = pn.customer_id)
         and ch.purchase_count >= $2
       where (pn.customer_id is not null or ch.customer_id is not null)
         and not exists (
           select 1 from already_matched am
           where am.customer_id = coalesce(pn.customer_id, ch.customer_id)
             and am.category = s.category
         )
         and not exists (
           select 1 from command_journal cj
           where cj.command_name in ('noteMatchmakingOutreach', 'dismissMatchmakingWorkQueueItem')
             and cj.input_payload->>'entityType' = 'customer'
             and (cj.input_payload->>'entityId')::uuid = coalesce(pn.customer_id, ch.customer_id)
             and cj.input_payload->>'context' = s.category
             and cj.created_at > now() - interval '30 days'
         )
       order by
         case when pn.customer_id is not null and ch.purchase_count >= $2 then 0
              when pn.customer_id is not null then 1
              else 2 end,
         ch.last_activity desc nulls last
       limit 25`,
      [lookback, repeatThreshold]
    );

    // Leg 3: Gaps to fill
    const toSourceResult = await pool.query(
      `with inventory_by_category as (
         select coalesce(b.category, 'Unknown') as category,
                sum(b.available_qty) as on_hand
         from batches b
         where b.status in ('processed', 'available', 'ready')
         group by b.category
       ),
       gaps as (
         select category, on_hand
         from inventory_by_category
         where on_hand <= $1
       ),
       vendor_history as (
         select pol.category,
                po.vendor_id,
                v.name as vendor_name,
                count(*) as supply_count,
                max(po.created_at) as last_activity
         from purchase_order_lines pol
         join purchase_orders po on po.id = pol.purchase_order_id
         join vendors v on v.id = po.vendor_id
         where po.created_at > now() - ($2 || ' days')::interval
           and po.status not in ('cancelled', 'void')
         group by pol.category, po.vendor_id, v.name
       ),
       posted_supply as (
         select vs.vendor_id,
                ve.name as vendor_name,
                vs.category,
                vs.available_qty as posted_qty,
                vs.available_date
         from vendor_supply vs
         join vendors ve on ve.id = vs.vendor_id
         where vs.status = 'open'
       ),
       snoozed_vendors as (
         select (input_payload->>'entityId')::uuid as vendor_id,
                input_payload->>'context' as category
         from command_journal
         where command_name in ('noteMatchmakingOutreach', 'dismissMatchmakingWorkQueueItem')
           and input_payload->>'entityType' = 'vendor'
           and created_at > now() - interval '30 days'
       )
       select
         g.category,
         g.on_hand as "onHand",
         case when g.on_hand = 0 then 'empty' else 'low' end as "gapLevel",
         coalesce(ps.vendor_id, vh.vendor_id) as "vendorId",
         coalesce(ps.vendor_name, vh.vendor_name) as vendor,
         case
           when ps.vendor_id is not null and vh.supply_count >= $3 then 'both'
           when ps.vendor_id is not null then 'supply'
           else 'history'
         end as signal,
         coalesce(vh.last_activity, now()) as "lastActivity",
         ps.posted_qty as "postedQty"
       from gaps g
       left join posted_supply ps on ps.category = g.category
       left join vendor_history vh
         on vh.category = g.category
         and (ps.vendor_id is null or vh.vendor_id = ps.vendor_id)
         and vh.supply_count >= $3
       where (ps.vendor_id is not null or vh.vendor_id is not null)
         and not exists (
           select 1 from snoozed_vendors sv
           where sv.vendor_id = coalesce(ps.vendor_id, vh.vendor_id)
             and sv.category = g.category
         )
       order by
         case when g.on_hand = 0 then 0 else 1 end,
         case when ps.vendor_id is not null and vh.supply_count >= $3 then 0
              when ps.vendor_id is not null then 1
              else 2 end
       limit 25`,
      [gapFloor, lookback, repeatThreshold]
    );

    return { toMove: toMoveResult.rows, toSource: toSourceResult.rows };
  }),
  matchmakingEntityCounts: protectedProcedure.query(async () => {
    const [settings] = (await pool.query(
      'select show_clients_column as "showClientsColumn", show_vendors_column as "showVendorsColumn" from matchmaking_settings limit 1'
    )).rows;

    if (!settings?.showClientsColumn && !settings?.showVendorsColumn) {
      return { customers: {}, vendors: {} };
    }

    const [customerCounts, vendorCounts] = await Promise.all([
      settings.showClientsColumn
        ? pool.query(`
            select cn.customer_id as id,
                   count(distinct cn.id) filter (where cn.status = 'open') as needs,
                   count(distinct mm.id) filter (where mm.status = 'accepted') as matches
            from customer_needs cn
            left join matchmaking_matches mm on mm.customer_need_id = cn.id
            group by cn.customer_id
          `)
        : Promise.resolve({ rows: [] }),
      settings.showVendorsColumn
        ? pool.query(`
            select vendor_id as id,
                   count(*) filter (where status = 'open') as supply
            from vendor_supply
            group by vendor_id
          `)
        : Promise.resolve({ rows: [] }),
    ]);

    const customers: Record<string, { needs: number; matches: number }> = {};
    for (const row of customerCounts.rows as Array<{ id: string; needs: string; matches: string }>) {
      customers[row.id] = { needs: Number(row.needs), matches: Number(row.matches) };
    }

    const vendors: Record<string, { supply: number }> = {};
    for (const row of vendorCounts.rows as Array<{ id: string; supply: string }>) {
      vendors[row.id] = { supply: Number(row.supply) };
    }

    return { customers, vendors };
  }),
  drilldown: protectedProcedure.input(z.object({ metricKey: z.string() })).query(async ({ input, ctx }) => {
    const sensitiveKeys = new Set(['cash', 'payables', 'receivables', 'inventory_value', 'debt_leader']);
    if (sensitiveKeys.has(input.metricKey) && !canRole(ctx.user.role, 'manager')) {
      return [];
    }
    return (await pool.query(drilldownSql(input.metricKey))).rows;
  }),
  recoverySearch: protectedProcedure.input(z.object({ q: z.string().trim().max(200).default('') })).query(async ({ input, ctx }) => {
    // [#35 DYN-M3] Previously the WHERE clause only matched UUIDs
    // (`affected_ids::text`) and metadata columns. Operators searching by a
    // human-readable name like "Harbor Wellness" got `[]` because the
    // toast/reason text was never queried. Extend the match to include the
    // toast inside `result` and the operator-supplied `reason`. The query
    // stays parameterized; no string interpolation of user input.
    const q = `%${input.q.trim()}%`;
    // [FIX-5] inputPayload may contain sensitive command arguments (amounts,
    // PII, correction reasons). Restrict it to manager+ to prevent operators
    // from reading raw command arguments they did not author.
    const canViewPayload = canRole(ctx.user.role, 'manager');
    const rows = (
      await pool.query(
        `select id, command_name as "commandName", actor_name as "actorName", status, error, created_at as "createdAt", result,
                input_payload as "inputPayload", affected_ids as "affectedIds", reversed_by_command_id as "reversedByCommandId"
         from command_journal
         where $1 = '%%'
            or id::text ilike $1
            or command_name ilike $1
            or actor_name ilike $1
            or affected_ids::text ilike $1
            or result->>'toast' ilike $1
            or reason ilike $1
         order by created_at desc
         limit 80`,
        [q]
      )
    ).rows;
    interface RecoverySearchRow {
      id: string;
      commandName: string;
      actorName: string;
      status: string;
      error: string | null;
      createdAt: string;
      result: unknown;
      inputPayload: unknown;
      affectedIds: string[];
      reversedByCommandId: string | null;
    }
    return (rows as RecoverySearchRow[]).map((row) => ({
      ...row,
      inputPayload: canViewPayload ? row.inputPayload : undefined,
    }));
  }),
  workQueue: protectedProcedure.query(async () => {
    const [settings] = (await pool.query(
      'select work_queue_threshold as "workQueueThreshold", work_queue_enabled as "workQueueEnabled" from matchmaking_settings limit 1'
    )).rows;
    const wqEnabled = settings?.workQueueEnabled ?? true;
    const wqThreshold = Number(settings?.workQueueThreshold ?? 75);

    // Values come from DB integer columns, clamped before interpolation
    const wqThresholdSafe = Math.max(0, Math.min(100, Math.floor(wqThreshold)));

    const matchmakingUnion = wqEnabled ? `
      union all
      select mm.id, 'matchmaking' as route, 'Matchmaking' as lane,
             concat(c.name, ' ↔ ', v.name) as title,
             mm.status,
             mm.updated_at as "createdAt",
             concat('Score: ', mm.score, ' · ', cn.product_name, ' / ', vs.product_name) as detail,
             'match'::text as "matchItemType", null::uuid as "matchVendorId", null::text as "matchCategory"
      from matchmaking_matches mm
      join customer_needs cn on cn.id = mm.customer_need_id
      join customers c on c.id = cn.customer_id
      join vendor_supply vs on vs.id = mm.vendor_supply_id
      join vendors v on v.id = vs.vendor_id
      where mm.status = 'open'
        and mm.score >= ${wqThresholdSafe}
        and not exists (
          select 1 from command_journal cj
          where cj.command_name = 'dismissMatchmakingWorkQueueItem'
            and cj.input_payload->>'itemId' = mm.id::text
            and cj.created_at > now() - interval '30 days'
        )
      union all
      select gap.id, gap.route, gap.lane, gap.title, gap.status, gap."createdAt", gap.detail,
             gap."matchItemType", gap."matchVendorId", gap."matchCategory"
      from (
        select gen_random_uuid() as id, 'matchmaking' as route, 'Matchmaking' as lane,
               concat('Source ', g.category, ' from ', v.name) as title,
               'open' as status,
               now() as "createdAt",
               concat('On hand: ', g.on_hand, ' units · ', case when vs.id is not null then 'Posted supply' else 'History' end) as detail,
               'opportunity'::text as "matchItemType", v.id as "matchVendorId", g.category as "matchCategory"
        from (
          select coalesce(b.category, 'Unknown') as category, sum(b.available_qty) as on_hand
          from batches b where b.status in ('processed', 'available', 'ready')
          group by b.category having sum(b.available_qty) = 0
        ) g
        left join vendor_supply vs on vs.category = g.category and vs.status = 'open'
        left join vendors v on v.id = vs.vendor_id
        where v.id is not null
          and not exists (
            select 1 from command_journal cj
            where cj.command_name in ('noteMatchmakingOutreach', 'dismissMatchmakingWorkQueueItem')
              and cj.input_payload->>'entityType' = 'vendor'
              and cj.input_payload->>'context' = g.category
              and cj.created_at > now() - interval '30 days'
          )
        limit 10
      ) gap
    ` : '';

    return (
      await pool.query(
        `select * from (
           select b.id, 'intake' as route, 'Intake' as lane, b.name as title, b.status, b.created_at as "createdAt",
                  concat(coalesce(v.name, 'No vendor'), ' / ', b.intake_qty, ' ', b.uom) as detail,
                  null::text as "matchItemType", null::uuid as "matchVendorId", null::text as "matchCategory"
           from batches b left join vendors v on v.id = b.vendor_id
           where b.status in ('ready','needs_fix')
           union all
           select po.id, 'purchaseOrders' as route, 'Purchase' as lane, po.po_no as title, po.status, po.created_at as "createdAt",
                  concat(coalesce(v.name, 'No vendor'), ' / ', po.total) as detail,
                  null::text as "matchItemType", null::uuid as "matchVendorId", null::text as "matchCategory"
           from purchase_orders po left join vendors v on v.id = po.vendor_id
           where po.status in ('draft','approved','ordered','partially_received')
           union all
           select so.id, 'orders' as route, 'Sales' as lane, so.order_no as title, so.status, so.created_at as "createdAt",
                  concat(c.name, ' / ', so.total) as detail,
                  null::text as "matchItemType", null::uuid as "matchVendorId", null::text as "matchCategory"
           from sales_orders so left join customers c on c.id = so.customer_id
           where so.status in ('draft','confirmed')
           union all
           select i.id, 'payments' as route, 'Payments' as lane, i.invoice_no as title, i.status, i.created_at as "createdAt",
                  concat(c.name, ' / due ', i.total - i.amount_paid) as detail,
                  null::text as "matchItemType", null::uuid as "matchVendorId", null::text as "matchCategory"
           from invoices i left join customers c on c.id = i.customer_id
           where i.status in ('open','partial')
           union all
           select vb.id, 'vendors' as route, 'Vendor' as lane, vb.bill_no as title, vb.status, vb.created_at as "createdAt",
                  concat(v.name, ' / due ', vb.amount - vb.amount_paid) as detail,
                  null::text as "matchItemType", null::uuid as "matchVendorId", null::text as "matchCategory"
           from vendor_bills vb left join vendors v on v.id = vb.vendor_id
           where vb.status in ('open','approved','scheduled','partial')
           union all
           select cr.id, 'connectors' as route, 'Connector' as lane, cr.source as title, cr.status, cr.created_at as "createdAt",
                  concat(cr.request_type, ' / ', coalesce(c.name, 'unassigned')) as detail,
                  null::text as "matchItemType", null::uuid as "matchVendorId", null::text as "matchCategory"
           from connector_requests cr left join customers c on c.id = cr.customer_id
           where cr.status = 'open'
           union all
           select pl.id, 'fulfillment' as route, 'Fulfillment' as lane, pl.pick_no as title, pl.status, pl.created_at as "createdAt",
                  concat(so.order_no, ' / ', count(fl.id), ' line(s)') as detail,
                  null::text as "matchItemType", null::uuid as "matchVendorId", null::text as "matchCategory"
           from pick_lists pl join sales_orders so on so.id = pl.order_id left join fulfillment_lines fl on fl.pick_list_id = pl.id
           where pl.status in ('open','packed')
           group by pl.id, so.order_no
           ${matchmakingUnion}
         ) q
         order by "createdAt" desc
         limit 100`
      )
    ).rows;
  }),
  salesOrderLines: protectedProcedure.input(z.object({ orderId: z.string().uuid() })).query(async ({ input }) => {
    // #64 PR-2: project the latest successful, NOT-reversed `setLineLandedCost`
    // command journal `result.delta.exceptionReason` onto each line via a LATERAL
    // join. This lets the operator UI render below-range vendor warning chips
    // (especially `vendor_approval_pending`) without a DB migration. The
    // `affected_ids @> ARRAY[sol.id::text]` predicate is answered by the
    // `command_journal_affected_ids_gin` GIN index from migration 0043.
    //
    // The LATERAL predicate (incl. the `reversed_by_command_id is null`
    // gate from review finding I-1) lives in `landedCostExceptionSql.ts`
    // so its load-bearing operators are unit-testable. We hand the raw
    // `result` JSONB back to the route handler and let the pure
    // `projectLandedCostException` helper inflate the flat fields so the
    // projection contract is unit-testable without a Postgres harness.
    const rows = (
      await pool.query(
        `select sol.id, sol.order_id as "orderId", sol.batch_id as "batchId", b.batch_code as "batchCode",
                sol.item_name as "itemName",
                coalesce(sol.display_name, i.alias, sol.item_name) as "displayName",
                i.alias as "itemAlias",
                sol.qty, sol.unit_price as "unitPrice", sol.unit_cost as "unitCost",
                -- Issue #64: cost-range / below-floor / vendor-approval projection.
                sol.unit_cost_resolved as "unitCostResolved",
                sol.landed_cost_basis as "landedCostBasis",
                sol.landed_cost_reason as "landedCostReason",
                sol.price_floor as "priceFloor",
                sol.below_floor_reason as "belowFloorReason",
                sol.below_floor_note as "belowFloorNote",
                sol.vendor_approval_state as "vendorApprovalState",
                sol.source_row_key as "sourceRowKey", sol.unresolved_source_text as "unresolvedSourceText",
                sol.legacy_status_marker as "legacyStatusMarker", sol.packed, sol.inventory_posted as "inventoryPosted",
                sol.payment_followup as "paymentFollowup", sol.validation_issues as "validationIssues", sol.status,
                 b.available_qty as "availableQty", b.legacy_marker as "legacyMarker", b.price_range as "priceRange",
                 b.category as "batchCategory",
                b.media_status as "mediaStatus", v.name as vendor,
                latest_cogs.result as "landedCostJournalResult"
         from sales_order_lines sol
         left join batches b on b.id = sol.batch_id
         left join items i on i.id = b.item_id
         left join vendors v on v.id = b.vendor_id
         ${LANDED_COST_EXCEPTION_LATERAL_JOIN_SQL}
         where sol.order_id = $1
         order by sol.created_at`,
        [input.orderId]
      )
    ).rows;
    return rows.map((row) => {
      const projection = projectLandedCostException(row.landedCostJournalResult);
      // Strip the raw journal blob from the wire payload — the projection is
      // the public contract; callers should not inspect raw command_journal
      // shapes from the client.
      const { landedCostJournalResult: _omit, ...rest } = row;
      return { ...rest, ...projection };
    });
  }),
  purchaseOrderLines: protectedProcedure.input(z.object({ purchaseOrderId: z.string().uuid() })).query(async ({ input, ctx }) => {
    const canViewFinancials = canRole(ctx.user.role, 'manager');
    const rows = (
      await pool.query(
        `select pol.id, pol.purchase_order_id as "purchaseOrderId", pol.item_id as "itemId",
                pol.product_name as "productName", pol.category, pol.tags, pol.qty, pol.received_qty as "receivedQty",
                pol.uom, pol.unit_cost as "unitCost", pol.unit_price as "unitPrice", pol.source_code as "sourceCode",
                pol.shorthand, pol.legacy_marker as "legacyMarker", pol.ownership_status as "ownershipStatus",
                pol.notes, pol.status, pol.created_at as "createdAt", i.sku,
                coalesce(bs."currentStock", 0)::numeric(12,3) as "currentStock",
                coalesce(bs."soldQty", 0)::numeric(12,3) as "soldQty",
                coalesce(bs."soldRevenue", 0)::numeric(14,2) as "soldRevenue",
                coalesce(bs."soldCost", 0)::numeric(14,2) as "soldCost"
         from purchase_order_lines pol
         left join items i on i.id = pol.item_id
         left join lateral (
           select sum(b.available_qty) as "currentStock",
                  sum(ss."soldQty") as "soldQty",
                  sum(ss."soldRevenue") as "soldRevenue",
                  sum(ss."soldCost") as "soldCost"
           from batches b
           left join lateral (
             select coalesce(sum(sol.qty), 0) as "soldQty",
                    coalesce(sum(sol.qty * sol.unit_price), 0) as "soldRevenue",
                    coalesce(sum(sol.qty * sol.unit_cost), 0) as "soldCost"
             from sales_order_lines sol
             where sol.batch_id = b.id
               and sol.status not in ('void', 'cancelled')
           ) ss on true
           where b.purchase_order_line_id = pol.id
         ) bs on true
         where pol.purchase_order_id = $1
         order by pol.created_at`,
        [input.purchaseOrderId]
      )
    ).rows;
    if (!canViewFinancials) {
      return rows.map((row) => ({ ...row, unitCost: null, soldRevenue: null, soldCost: null }));
    }
    return rows;
  }),
  purchaseReceiptLines: protectedProcedure.input(z.object({ purchaseReceiptId: z.string().uuid() })).query(async ({ input }) => {
    return (
      await pool.query(
        `select prl.id, prl.receipt_id as "purchaseReceiptId", prl.batch_id as "batchId",
                b.batch_code as "batchCode", b.name as "itemName",
                prl.qty, prl.unit_cost as "unitCost", prl.subtotal
         from purchase_receipt_lines prl
         left join batches b on b.id = prl.batch_id
         where prl.receipt_id = $1
          order by prl.id`,
        [input.purchaseReceiptId]
      )
    ).rows;
  }),
  customerWorkspace: protectedProcedure.input(z.object({ customerId: z.string().uuid() })).query(async ({ input }) => {
    const [customer, orders, invoices, payments, recentCommands] = await Promise.all([
      pool.query('select id, name, credit_limit as "creditLimit", balance, tags, notes from customers where id = $1', [input.customerId]),
      pool.query(
        `select so.id, so.order_no as "orderNo", so.status, so.total, so.internal_margin as "internalMargin",
                so.delivery_window as "deliveryWindow", so.notes, so.packed, so.inventory_posted as "inventoryPosted",
                so.payment_followup as "paymentFollowup", so.legacy_status_markers as "legacyStatusMarkers",
                so.validation_issues as "validationIssues", so.created_at as "createdAt",
                -- Issue #64: order-level exception rollup so the Sales workspace can
                -- show vendor approval / waived margin / loss recognized without
                -- re-aggregating every line on read.
                so.vendor_approval_pending as "vendorApprovalPending",
                so.margin_waived_total as "marginWaivedTotal",
                so.loss_recognized_total as "lossRecognizedTotal"
         from sales_orders so
         where so.customer_id = $1 and so.status not in ('archived')
         order by so.created_at desc
         limit 20`,
        [input.customerId]
      ),
      pool.query('select id, invoice_no as "invoiceNo", total, amount_paid as "amountPaid", status, due_date as "dueDate" from invoices where customer_id = $1 order by created_at desc limit 20', [input.customerId]),
      pool.query('select id, method, amount, unapplied_amount as "unappliedAmount", reference, location_bucket as "locationBucket", category, direction, created_at as "createdAt" from payments where customer_id = $1 order by created_at desc limit 20', [input.customerId]),
      // Use = ANY so the GIN index on affected_ids (migration 0043) is chosen.
      // The ::text ILIKE pattern defeats the index because Postgres has to cast
      // the array to text before applying the LIKE.
      pool.query(`select id, command_name as "commandName", actor_name as "actorName", status, created_at as "createdAt", result from command_journal where $1 = any(affected_ids) order by created_at desc limit 20`, [input.customerId])
    ]);
    return { customer: customer.rows[0], orders: orders.rows, invoices: invoices.rows, payments: payments.rows, recentCommands: recentCommands.rows };
  }),
  // Issue #61: Customer purchase history — line-level prior sales for the
  // selected customer with derived payment terms (computed as Net N days from
  // invoice.due_date - sales_orders.created_at) and payment status (from
  // invoices.status, or 'unbilled' when no invoice yet).
  customerPurchaseHistory: protectedProcedure
    .input(z.object({ customerId: z.string().uuid(), limit: z.number().int().positive().max(500).default(200) }))
    .query(async ({ input }) => {
      return (
        await pool.query(
          `select
              sol.id,
              sol.order_id as "orderId",
              so.order_no as "orderNo",
              so.status as "orderStatus",
              so.created_at as "createdAt",
              coalesce(i.alias, sol.display_name) as "itemAlias",
              sol.item_name as "itemName",
              sol.display_name as "displayName",
              b.batch_code as "batchCode",
              b.category as "category",
              v.name as vendor,
              sol.unit_price as "unitPrice",
              sol.qty as "qty",
              coalesce(
                case
                  when inv.due_date is not null
                    then 'Net ' || greatest(0, (extract(day from (inv.due_date - so.created_at)))::int)::text
                end,
                'TBD'
              ) as "paymentTerms",
              coalesce(inv.status, 'unbilled') as "paymentStatus"
            from sales_order_lines sol
            join sales_orders so on so.id = sol.order_id
            left join batches b on b.id = sol.batch_id
            left join items i on i.id = b.item_id
            left join vendors v on v.id = b.vendor_id
            left join lateral (
              select status, due_date from invoices
              where invoices.order_id = so.id
              order by created_at desc
              limit 1
            ) inv on true
            where so.customer_id = $1
              and so.status not in ('archived', 'cancelled')
            order by so.created_at desc, sol.created_at
            limit $2`,
          [input.customerId, input.limit]
        )
      ).rows;
    }),
  // Issue #62: Recent customer sheet snapshots. Returns metadata only — open a
  // snapshot via customerSheetSnapshotById to fetch rowsJson.
  recentCustomerSheets: protectedProcedure
    .input(z.object({ customerId: z.string().uuid(), limit: z.number().int().positive().max(100).default(25) }))
    .query(async ({ input }) => {
      return (
        await pool.query(
          `select id, customer_id as "customerId", mode, actor_id as "actorId", actor_name as "actorName",
                  item_count as "itemCount", notes, created_at as "createdAt"
           from customer_sheet_snapshots
           where customer_id = $1
           order by created_at desc
           limit $2`,
          [input.customerId, input.limit]
        )
      ).rows;
    }),
  // Issue #62 (reviewer fix): require both id AND customerId in the input and
  // filter on both so a snapshot cannot be opened outside the customer the
  // caller intends. The read-side `getViewerSafeSnapshot` then strips any
  // rogue cost/margin fields that may have crept into rows_json (defense in
  // depth against historical writes) and refuses to return internal-mode
  // snapshots to viewer-role users.
  customerSheetSnapshotById: protectedProcedure
    .input(z.object({ id: z.string().uuid(), customerId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const result = await pool.query(
        `select id, customer_id as "customerId", mode, actor_id as "actorId", actor_name as "actorName",
                item_count as "itemCount", rows_json as "rows", notes, created_at as "createdAt"
         from customer_sheet_snapshots
         where id = $1 and customer_id = $2
         limit 1`,
        [input.id, input.customerId]
      );
      const raw = result.rows[0] ?? null;
      return getViewerSafeSnapshot(raw, ctx.user?.role ?? null);
    }),
  relatedCommands: protectedProcedure.input(z.object({ entityId: z.string().uuid().optional(), contactId: z.string().uuid().optional() })).query(async ({ input }) => {
    let entityIds: string[] = [];
    if (input.entityId) entityIds.push(input.entityId);
    if (input.contactId) {
      const linked = await pool.query(
        `SELECT c.id AS contact_id,
          cu.id AS customer_id, v.id AS vendor_id, r.id AS referee_id, pp.id AS processor_id
         FROM contacts c
         LEFT JOIN customers cu ON cu.contact_id = c.id
         LEFT JOIN vendors v ON v.contact_id = c.id
         LEFT JOIN referees r ON r.contact_id = c.id
         LEFT JOIN payment_processors pp ON pp.contact_id = c.id
         WHERE c.id = $1`,
        [input.contactId]
      );
      const row = linked.rows[0] as Record<string, string | null> | undefined;
      if (row) {
        const ids = [row.contact_id, row.customer_id, row.vendor_id, row.referee_id, row.processor_id].filter(Boolean) as string[];
        entityIds.push(...ids);
      }
    }
    if (entityIds.length === 0) return [];
    return (
      await pool.query(
        `select id, command_name as "commandName", actor_name as "actorName", actor_role as "actorRole",
                status, reason, error, affected_ids as "affectedIds", before_snapshot as "beforeSnapshot",
                after_snapshot as "afterSnapshot", result, reversed_by_command_id as "reversedByCommandId",
                created_at as "createdAt"
         from command_journal
         where affected_ids && $1::text[]
         order by created_at desc
         limit 25`,
        [entityIds]
      )
    ).rows;
  }),
  paymentAllocationPreview: protectedProcedure
    .input(z.object({ customerId: z.string().uuid(), amount: z.coerce.number(), invoiceId: z.string().uuid().optional(), allocationIntent: z.string().optional() }))
    .query(async ({ input }) => {
      if (input.amount < 0) return { kind: 'buyer_credit', label: 'Buyer credit / down payment', rows: [], unapplied: Math.abs(input.amount).toFixed(2) };
      const invoices = input.invoiceId
        ? (await pool.query('select id, invoice_no as "invoiceNo", total, amount_paid as "amountPaid", status from invoices where id = $1', [input.invoiceId])).rows
        : (await pool.query("select id, invoice_no as \"invoiceNo\", total, amount_paid as \"amountPaid\", status from invoices where customer_id = $1 and status in ('open','partial') order by created_at", [input.customerId])).rows;
      let remaining = input.amount;
      const rows = invoices.map((invoice) => {
        const open = Math.max(0, Number(invoice.total) - Number(invoice.amountPaid));
        const applied = input.allocationIntent === 'unapplied' ? 0 : Math.min(open, remaining);
        remaining -= applied;
        return { invoiceId: invoice.id, invoiceNo: invoice.invoiceNo, open: open.toFixed(2), applied: applied.toFixed(2) };
      });
      return { kind: input.allocationIntent || 'fifo', label: input.allocationIntent === 'unapplied' ? 'Leave unapplied' : 'Auto-apply to oldest invoices', rows, unapplied: Math.max(0, remaining).toFixed(2) };
    }),
  // UX-A04 / CAP-024 / Execution Decision 2 (docs/ux-audit-2026-06-12.md):
  // server-side per-user Quick Ledger draft persistence. Drafts carry
  // counterparty names + amounts, so they are deliberately excluded from the
  // client localStorage partialize (shared-workstation PII rationale,
  // uiStore.ts) — this pair of endpoints is the only durable home for them.
  // Lives in the queries router because it is the namespace the Quick Ledger
  // client already uses for ledger work (transactionLedger,
  // paymentAllocationPreview above).
  quickLedgerDrafts: protectedProcedure.query(async ({ ctx }) => {
    const result = await pool.query(
      'select drafts, updated_at as "updatedAt" from user_view_drafts where user_id = $1 and view_key = $2',
      [ctx.user.id, 'quickLedger']
    );
    const row = result.rows[0] as { drafts: unknown; updatedAt: Date } | undefined;
    return { drafts: Array.isArray(row?.drafts) ? (row?.drafts as Record<string, unknown>[]) : null, updatedAt: row?.updatedAt ?? null };
  }),
  saveQuickLedgerDrafts: protectedProcedure
    .input(
      z.object({
        // Mirrors the client LedgerDraft shape (uiStore.ts) loosely — strict on
        // the discriminants, permissive on free-text fields — so future draft
        // fields don't strand saved work. `.strip()` drops unknown keys.
        drafts: z
          .array(
            z
              .object({
                id: z.string().min(1).max(64),
                date: z.string().max(32),
                direction: z.enum(['receiving', 'paying']),
                entityType: z.string().max(32),
                entityId: z.string().max(64),
                entityName: z.string().max(240),
                transactionType: z.string().max(64),
                allocationTargetType: z.string().max(64),
                allocationTargetId: z.string().max(64),
                amount: z.string().max(32),
                method: z.string().max(32),
                bucket: z.string().max(64),
                reference: z.string().max(240),
                notes: z.string().max(2000),
                status: z.enum(['draft', 'posted', 'needs_fix']),
                issue: z.string().max(500).optional(),
                processorId: z.string().max(64).optional(),
                grossAmount: z.string().max(32).optional(),
                processingFeeTotal: z.string().max(32).optional(),
                userSplitPercent: z.string().max(32).optional()
              })
              .strip()
          )
          .max(50)
      })
    )
    .mutation(async ({ ctx, input }) => {
      await pool.query(
        `insert into user_view_drafts (user_id, view_key, drafts)
         values ($1, 'quickLedger', $2::jsonb)
         on conflict (user_id, view_key)
         do update set drafts = excluded.drafts, updated_at = now()`,
        [ctx.user.id, JSON.stringify(input.drafts)]
      );
      return { ok: true as const };
    }),
  paymentAllocations: protectedProcedure.input(z.object({ paymentId: z.string().uuid().optional(), customerId: z.string().uuid().optional() })).query(async ({ input }) => {
    return (
      await pool.query(
        `select pa.id, pa.payment_id as "paymentId", pa.invoice_id as "invoiceId", i.invoice_no as "invoiceNo",
                pa.amount, pa.created_at as "createdAt", p.customer_id as "customerId"
         from payment_allocations pa
         join payments p on p.id = pa.payment_id
         left join invoices i on i.id = pa.invoice_id
         where ($1::uuid is null or pa.payment_id = $1::uuid)
           and ($2::uuid is null or p.customer_id = $2::uuid)
         order by pa.created_at desc
         limit 80`,
        [input.paymentId ?? null, input.customerId ?? null]
      )
    ).rows;
  }),
  relationshipSummary: protectedProcedure.input(z.object({ customerId: z.string().uuid().optional(), vendorId: z.string().uuid().optional() })).query(async ({ input }) => {
    const customer = input.customerId ? (await pool.query('select id, name, balance, credit_limit as "creditLimit", tags, notes, pricing_rule as "pricingRule" from customers where id = $1', [input.customerId])).rows[0] : null;
    const vendor = input.vendorId ? (await pool.query('select id, name, terms_days as "termsDays", notes from vendors where id = $1', [input.vendorId])).rows[0] : customer ? (await pool.query('select id, name, terms_days as "termsDays", notes from vendors where lower(name) = lower($1)', [customer.name])).rows[0] : null;
    const [orders, invoicesRows, paymentsRows, purchaseOrderRows, bills, vendorPaymentsRows, ledgerRows, creditRows, disputeRows, receiptRows, commands] = await Promise.all([
      customer ? pool.query('select id, order_no as "orderNo", status, total, created_at as "createdAt" from sales_orders where customer_id = $1 order by created_at desc limit 20', [customer.id]) : { rows: [] },
      customer ? pool.query('select id, invoice_no as "invoiceNo", status, total, amount_paid as "amountPaid", due_date as "dueDate" from invoices where customer_id = $1 order by created_at desc limit 20', [customer.id]) : { rows: [] },
      customer ? pool.query('select id, method, amount, unapplied_amount as "unappliedAmount", category, location_bucket as "locationBucket", created_at as "createdAt" from payments where customer_id = $1 order by created_at desc limit 20', [customer.id]) : { rows: [] },
      vendor ? pool.query('select id, po_no as "poNo", status, total, expected_date as "expectedDate", created_at as "createdAt" from purchase_orders where vendor_id = $1 order by created_at desc limit 20', [vendor.id]) : { rows: [] },
      vendor ? pool.query('select id, bill_no as "billNo", amount, amount_paid as "amountPaid", status, due_reason as "dueReason", scheduled_for as "scheduledFor" from vendor_bills where vendor_id = $1 order by due_date limit 20', [vendor.id]) : { rows: [] },
      vendor ? pool.query('select vp.id, vp.amount, vp.method, vp.reference, vp.created_at as "createdAt", vb.bill_no as "billNo" from vendor_payments vp join vendor_bills vb on vb.id = vp.vendor_bill_id where vb.vendor_id = $1 order by vp.created_at desc limit 20', [vendor.id]) : { rows: [] },
      customer ? pool.query('select id, kind, amount, balance_after as "balanceAfter", note, created_at as "createdAt" from client_ledger_entries where customer_id = $1 order by created_at desc limit 30', [customer.id]) : { rows: [] },
      customer ? pool.query('select id, amount, status, reason, created_at as "createdAt" from credit_overrides where customer_id = $1 order by created_at desc limit 20', [customer.id]) : { rows: [] },
      customer
        ? pool.query(
            `select d.id, d.status, d.reason, d.resolution, d.created_at as "createdAt", i.invoice_no as "invoiceNo"
             from invoice_disputes d
             join invoices i on i.id = d.invoice_id
             where i.customer_id = $1
             order by d.created_at desc
             limit 20`,
            [customer.id]
          )
        : { rows: [] },
      vendor ? pool.query('select id, receipt_no as "receiptNo", total, status, created_at as "createdAt" from purchase_receipts where vendor_id = $1 order by created_at desc limit 20', [vendor.id]) : { rows: [] },
      // Use = ANY for GIN-eligible scan. Pass empty-string placeholders rather
      // than nulls because the SQL operator requires a non-null left operand;
      // the no-match outcome is identical (empty string never matches a UUID).
      pool.query(`select id, command_name as "commandName", actor_name as "actorName", status, created_at as "createdAt" from command_journal where $1 = any(affected_ids) or $2 = any(affected_ids) order by created_at desc limit 20`, [input.customerId ?? '', input.vendorId ?? vendor?.id ?? ''])
    ]);
    return {
      customer,
      vendor,
      orders: orders.rows,
      invoices: invoicesRows.rows,
      payments: paymentsRows.rows,
      purchaseOrders: purchaseOrderRows.rows,
      bills: bills.rows,
      vendorPayments: vendorPaymentsRows.rows,
      ledger: ledgerRows.rows,
      creditOverrides: creditRows.rows,
      disputes: disputeRows.rows,
      receipts: receiptRows.rows,
      commands: commands.rows
    };
  }),
  // UX-U01 (UX-N01 / UF-014 / JY-16) — entity timeline.
  // Sanctioned new read-only query (docs/ux-audit-2026-06-12.md §N + §U01,
  // execution decisions header): merges one chronological event list per
  // entity (customer / vendor / order / lot) from EXISTING tables only —
  // command_journal (commands), payments + payment_allocations (money),
  // vendor_payments (vendor money), pick_lists + fulfillment_lines
  // (fulfillment marks), batch_media (media publishes). No writes, no new
  // schema; operator-auth via protectedProcedure like sibling queries.
  // Paginated limit+offset with limit capped at 100.
  entityTimeline: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(['customer', 'vendor', 'order', 'lot']),
        entityId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(900).default(0)
      })
    )
    .query(async ({ input }) => {
      // Fetch enough rows from each source to satisfy the requested page even
      // when a single source dominates the merged ordering (cap 100/source).
      const perSource = Math.min(input.offset + input.limit, 100);
      const none = Promise.resolve({ rows: [] as Record<string, unknown>[] });
      const commandsQ = pool.query(
        `select id, command_name as "commandName", actor_name as "actorName", status,
                reversed_by_command_id as "reversedByCommandId", created_at as "occurredAt"
         from command_journal
         where $1 = any(affected_ids)
         order by created_at desc
         limit $2`,
        [input.entityId, perSource]
      );
      const paymentsQ =
        input.entityType === 'customer'
          ? pool.query(
              `select id, method, amount, direction, status, created_at as "occurredAt"
               from payments
               where customer_id = $1
               order by created_at desc
               limit $2`,
              [input.entityId, perSource]
            )
          : input.entityType === 'vendor'
            ? pool.query(
                `select vp.id, vp.method, vp.amount, vp.status,
                        vb.id as "vendorBillId", vb.bill_no as "billNo",
                        vp.created_at as "occurredAt"
                 from vendor_payments vp
                 join vendor_bills vb on vb.id = vp.vendor_bill_id
                 where vb.vendor_id = $1
                 order by vp.created_at desc
                 limit $2`,
                [input.entityId, perSource]
              )
            : none;
      const allocationsQ =
        input.entityType === 'customer' || input.entityType === 'order'
          ? pool.query(
              `select pa.id, pa.amount, pa.created_at as "occurredAt",
                      i.invoice_no as "invoiceNo", i.order_id as "orderId",
                      pa.payment_id as "paymentId"
               from payment_allocations pa
               join payments p on p.id = pa.payment_id
               left join invoices i on i.id = pa.invoice_id
               where ${input.entityType === 'order' ? 'i.order_id = $1' : 'p.customer_id = $1'}
               order by pa.created_at desc
               limit $2`,
              [input.entityId, perSource]
            )
          : none;
      const picksQ =
        input.entityType === 'customer' || input.entityType === 'order'
          ? pool.query(
              `select pl.id, pl.pick_no as "pickNo", pl.status,
                      pl.order_id as "orderId", so.order_no as "orderNo",
                      pl.updated_at as "occurredAt"
               from pick_lists pl
               join sales_orders so on so.id = pl.order_id
               where ${input.entityType === 'order' ? 'pl.order_id = $1' : 'so.customer_id = $1'}
               order by pl.updated_at desc
               limit $2`,
              [input.entityId, perSource]
            )
          : none;
      const fulfillmentQ =
        input.entityType === 'order' || input.entityType === 'lot'
          ? pool.query(
              `select fl.id, fl.status, fl.bag_code as "bagCode", fl.actual_qty as "actualQty",
                      pl.pick_no as "pickNo", pl.id as "pickListId", pl.order_id as "orderId",
                      fl.updated_at as "occurredAt"
               from fulfillment_lines fl
               join pick_lists pl on pl.id = fl.pick_list_id
               where ${input.entityType === 'order' ? 'pl.order_id = $1' : 'fl.batch_id = $1'}
                 and fl.status <> 'open'
               order by fl.updated_at desc
               limit $2`,
              [input.entityId, perSource]
            )
          : none;
      const mediaQ =
        input.entityType === 'lot'
          ? pool.query(
              `select id, original_filename as "originalFilename", role, status,
                      coalesce(published_at, created_at) as "occurredAt"
               from batch_media
               where batch_id = $1 and status = 'published'
               order by coalesce(published_at, created_at) desc
               limit $2`,
              [input.entityId, perSource]
            )
          : none;
      const [commandRows, paymentRows, allocationRows, pickRows, fulfillmentRows, mediaRows] = await Promise.all([
        commandsQ,
        paymentsQ,
        allocationsQ,
        picksQ,
        fulfillmentQ,
        mediaQ
      ]);
      interface TimelineEvent {
        id: string;
        eventType: 'command' | 'payment' | 'vendor_payment' | 'allocation' | 'pick' | 'fulfillment' | 'media';
        label: string;
        actor: string | null;
        status: string | null;
        amount: string | null;
        refNo: string | null;
        targetType: string | null;
        targetId: string | null;
        occurredAt: Date | string;
      }
      const text = (value: unknown) => (value == null ? null : String(value));
      const events: TimelineEvent[] = [
        ...commandRows.rows.map((row): TimelineEvent => ({
          id: `command:${String(row.id)}`,
          eventType: 'command',
          // Raw command name — the client humanizes via commandLabelFor so the
          // shared commandCatalog stays the single label source.
          label: String(row.commandName ?? ''),
          actor: text(row.actorName),
          status: row.reversedByCommandId ? 'reversed' : text(row.status),
          amount: null,
          refNo: null,
          targetType: null,
          targetId: null,
          occurredAt: row.occurredAt as Date
        })),
        ...paymentRows.rows.map((row): TimelineEvent =>
          input.entityType === 'vendor'
            ? {
                id: `vendor_payment:${String(row.id)}`,
                eventType: 'vendor_payment',
                label: `Vendor payment (${String(row.method ?? 'cash')})${row.billNo ? ` on ${String(row.billNo)}` : ''}`,
                actor: null,
                status: text(row.status),
                amount: text(row.amount),
                refNo: text(row.billNo),
                targetType: row.vendorBillId ? 'vendorBill' : null,
                targetId: text(row.vendorBillId),
                occurredAt: row.occurredAt as Date
              }
            : {
                id: `payment:${String(row.id)}`,
                eventType: 'payment',
                label: `${String(row.direction ?? 'money_in') === 'money_in' ? 'Payment received' : 'Payment out'} (${String(row.method ?? '')})`,
                actor: null,
                status: text(row.status),
                amount: text(row.amount),
                refNo: null,
                targetType: 'payment',
                targetId: text(row.id),
                occurredAt: row.occurredAt as Date
              }
        ),
        ...allocationRows.rows.map((row): TimelineEvent => ({
          id: `allocation:${String(row.id)}`,
          eventType: 'allocation',
          label: `Payment applied${row.invoiceNo ? ` to ${String(row.invoiceNo)}` : ''}`,
          actor: null,
          status: null,
          amount: text(row.amount),
          refNo: text(row.invoiceNo),
          targetType: row.orderId ? 'order' : 'payment',
          targetId: text(row.orderId) ?? text(row.paymentId),
          occurredAt: row.occurredAt as Date
        })),
        ...pickRows.rows.map((row): TimelineEvent => ({
          id: `pick:${String(row.id)}`,
          eventType: 'pick',
          label: `Pick ${String(row.pickNo ?? '')} ${String(row.status ?? '')}`.trim(),
          actor: null,
          status: text(row.status),
          amount: null,
          refNo: text(row.pickNo),
          targetType: 'pick',
          targetId: text(row.id),
          occurredAt: row.occurredAt as Date
        })),
        ...fulfillmentRows.rows.map((row): TimelineEvent => ({
          id: `fulfillment:${String(row.id)}`,
          eventType: 'fulfillment',
          label: `Line ${String(row.status ?? '')}${row.bagCode ? ` (bag ${String(row.bagCode)})` : ''} on pick ${String(row.pickNo ?? '')}`,
          actor: null,
          status: text(row.status),
          amount: null,
          refNo: text(row.pickNo),
          targetType: row.pickListId ? 'pick' : null,
          targetId: text(row.pickListId),
          occurredAt: row.occurredAt as Date
        })),
        ...mediaRows.rows.map((row): TimelineEvent => ({
          id: `media:${String(row.id)}`,
          eventType: 'media',
          label: `Media published (${String(row.role ?? 'additional')}): ${String(row.originalFilename ?? '')}`,
          actor: null,
          status: text(row.status),
          amount: null,
          refNo: null,
          targetType: null,
          targetId: null,
          occurredAt: row.occurredAt as Date
        }))
      ];
      const occurredMs = (value: Date | string) => (value instanceof Date ? value.getTime() : new Date(value).getTime());
      events.sort((a, b) => occurredMs(b.occurredAt) - occurredMs(a.occurredAt));
      const page = events.slice(input.offset, input.offset + input.limit);
      return {
        events: page,
        nextOffset: events.length > input.offset + input.limit ? input.offset + input.limit : null
      };
    }),
  globalSearch: protectedProcedure.input(z.object({ q: z.string().trim().min(1).max(200) })).query(async ({ input }) => {
    const q = `%${input.q.trim()}%`;
    const [customerRows, vendorRows, purchaseOrderRows, orderRows, invoiceRows, paymentRows, batchRows, needRows, supplyRows, pickRows, connectorRows, commandRows] = await Promise.all([
      pool.query('select id, id as "customerId", name as label, balance as detail, \'customer\' as type from customers where name ilike $1 or notes ilike $1 or tags::text ilike $1 limit 8', [q]),
      pool.query('select id, id as "vendorId", name as label, notes as detail, \'vendor\' as type from vendors where name ilike $1 or notes ilike $1 limit 8', [q]),
      pool.query(`select po.id, po.vendor_id as "vendorId", po.po_no as label, concat(coalesce(v.name, 'No vendor'), ' / ', po.status, ' / ', po.total) as detail, 'purchaseOrder' as type
                  from purchase_orders po left join vendors v on v.id = po.vendor_id
                  where po.po_no ilike $1 or po.buyer_notes ilike $1 or po.internal_notes ilike $1
                  limit 8`, [q]),
      pool.query('select id, customer_id as "customerId", order_no as label, status as detail, \'order\' as type from sales_orders where order_no ilike $1 or notes ilike $1 limit 8', [q]),
      pool.query('select id, customer_id as "customerId", invoice_no as label, status as detail, \'invoice\' as type from invoices where invoice_no ilike $1 limit 8', [q]),
      pool.query('select id, customer_id as "customerId", reference as label, amount as detail, \'payment\' as type from payments where reference ilike $1 or notes ilike $1 or location_bucket ilike $1 limit 8', [q]),
      pool.query(`select b.id, b.vendor_id as "vendorId", b.batch_code as "batchCode",
                         concat(b.batch_code, ' ', coalesce(i.alias, b.name)) as label,
                         concat(coalesce(b.source_code,''), ' ', coalesce(b.legacy_marker,''), ' ', coalesce(b.notes,'')) as detail,
                         'batch' as type,
                         case when i.alias is not null and i.alias ilike $1 and not (b.name ilike $1) then 'alias' else 'canonical' end as source
                  from batches b
                  left join items i on i.id = b.item_id
                  where b.batch_code ilike $1 or b.source_code ilike $1 or b.name ilike $1 or i.alias ilike $1 or b.category ilike $1 or b.notes ilike $1 or b.legacy_marker ilike $1 or b.shorthand ilike $1 or b.price_range ilike $1 or b.tags::text ilike $1
                  limit 12`, [q]),
      pool.query(`select cn.id, cn.customer_id as "customerId", cn.need_code as "needCode",
                         concat(cn.need_code, ' ', cn.product_name) as label,
                         concat(coalesce(c.name, 'No customer'), ' / ', cn.status, ' / ', array_to_string(cn.tags, ', ')) as detail,
                         'customerNeed' as type
                  from customer_needs cn left join customers c on c.id = cn.customer_id
                  where cn.need_code ilike $1 or cn.product_name ilike $1 or cn.category ilike $1 or cn.tags::text ilike $1 or cn.notes ilike $1
                  limit 8`, [q]),
      pool.query(`select vs.id, vs.vendor_id as "vendorId", vs.supply_code as "supplyCode",
                         concat(vs.supply_code, ' ', vs.product_name) as label,
                         concat(coalesce(v.name, 'No vendor'), ' / ', vs.status, ' / ', array_to_string(vs.tags, ', ')) as detail,
                         'vendorSupply' as type
                  from vendor_supply vs left join vendors v on v.id = vs.vendor_id
                  where vs.supply_code ilike $1 or vs.product_name ilike $1 or vs.category ilike $1 or vs.tags::text ilike $1 or vs.notes ilike $1
                  limit 8`, [q]),
      pool.query(`select pl.id, so.customer_id as "customerId", pl.pick_no as label, pl.tracking as detail, 'pick' as type
                  from pick_lists pl left join sales_orders so on so.id = pl.order_id
                  where pl.pick_no ilike $1 or pl.tracking ilike $1 limit 8`, [q]),
      pool.query("select id, customer_id as \"customerId\", concat(source, ' ', request_type) as label, status as detail, 'connector' as type from connector_requests where source ilike $1 or request_type ilike $1 or payload::text ilike $1 limit 8", [q]),
      pool.query("select id, command_name as label, status as detail, 'command' as type from command_journal where id::text ilike $1 or command_name ilike $1 or affected_ids::text ilike $1 limit 8", [q])
    ]);
    return { groups: { customers: customerRows.rows, vendors: vendorRows.rows, purchaseOrders: purchaseOrderRows.rows, orders: orderRows.rows, invoices: invoiceRows.rows, payments: paymentRows.rows, batches: batchRows.rows, customerNeeds: needRows.rows, vendorStock: supplyRows.rows, picks: pickRows.rows, connectors: connectorRows.rows, commands: commandRows.rows } };
  }),
  fulfillmentLines: protectedProcedure.input(z.object({ pickListId: z.string().uuid() })).query(async ({ input }) => {
    return (
      await pool.query(
        `select fl.id, fl.pick_list_id as "pickListId", fl.order_line_id as "orderLineId", sol.item_name as "itemName",
                coalesce(sol.display_name, i.alias, sol.item_name) as "displayName",
                b.batch_code as "batchCode", fl.expected_qty as "expectedQty", fl.actual_qty as "actualQty",
                fl.actual_weight as "actualWeight", fl.bag_code as "bagCode", fl.status, fl.updated_at as "updatedAt"
         from fulfillment_lines fl
         left join sales_order_lines sol on sol.id = fl.order_line_id
         left join batches b on b.id = fl.batch_id
         left join items i on i.id = b.item_id
         where fl.pick_list_id = $1
         order by fl.created_at`,
        [input.pickListId]
      )
    ).rows;
  }),
  vendorPayments: protectedProcedure.input(z.object({ vendorBillId: z.string().uuid().optional(), vendorId: z.string().uuid().optional() })).query(async ({ input }) => {
    return (
      await pool.query(
        `select vp.id, vp.vendor_bill_id as "vendorBillId", vb.vendor_id as "vendorId", vb.bill_no as "billNo",
                v.name as vendor, vp.amount, vp.method, vp.reference, vp.status, vp.created_at as "createdAt"
         from vendor_payments vp
         join vendor_bills vb on vb.id = vp.vendor_bill_id
         left join vendors v on v.id = vb.vendor_id
         where ($1::uuid is null or vp.vendor_bill_id = $1::uuid)
           and ($2::uuid is null or vb.vendor_id = $2::uuid)
         order by vp.created_at desc
         limit 80`,
        [input.vendorBillId ?? null, input.vendorId ?? null]
      )
    ).rows;
  }),
  inventoryMovements: protectedProcedure.input(z.object({ batchId: z.string().uuid().optional() })).query(async ({ input }) => {
    return (
      await pool.query(
        `select im.id, im.batch_id as "batchId", b.batch_code as "batchCode", im.command_id as "commandId",
                im.kind, im.qty_delta as "qtyDelta", im.reason, im.created_at as "createdAt"
         from inventory_movements im
         left join batches b on b.id = im.batch_id
         where ($1::uuid is null or im.batch_id = $1::uuid)
         order by im.created_at desc
         limit 100`,
        [input.batchId ?? null]
      )
    ).rows;
  }),
  photographyQueue: protectedProcedure.query(async () => {
    return (
      await pool.query(
        `select pq.id, pq.batch_id as "batchId", b.batch_code as "batchCode", b.name, b.media_status as "mediaStatus",
                pq.status, pq.notes, pq.created_at as "createdAt", pq.updated_at as "updatedAt"
         from photography_queue pq
         left join batches b on b.id = pq.batch_id
         order by case pq.status when 'open' then 0 when 'in_progress' then 1 else 2 end, pq.created_at desc
         limit 100`
      )
    ).rows;
  }),
  batchMediaList: protectedProcedure.input(z.object({ batchId: z.string().uuid() })).query(async ({ input }): Promise<Array<{
    id: string; batchId: string; mediaType: string; role: string; status: string;
    originalFilename: string; fileSize: number; mimeType: string; hasThumbnail: boolean;
    publishedAt: string | null; replacedAt: string | null; createdAt: string; updatedAt: string;
  }>> => {
    return (
      await pool.query(
        `select id,
                batch_id as "batchId",
                media_type as "mediaType",
                role,
                status,
                original_filename as "originalFilename",
                file_size as "fileSize",
                mime_type as "mimeType",
                (thumbnail_path is not null) as "hasThumbnail",
                published_at as "publishedAt",
                replaced_at as "replacedAt",
                created_at as "createdAt",
                updated_at as "updatedAt"
         from batch_media
         where batch_id = $1 and replaced_at is null
         order by case role when 'primary_photo' then 0 when 'primary_video' then 1 when 'additional' then 2 else 3 end, created_at desc`,
        [input.batchId]
      )
    ).rows;
  }),
  intakeQueue: protectedProcedure.query(async () => {
    const orders = (
      await pool.query(
        `select po.id, po.po_no as "poNo", v.name as vendor, po.vendor_id as "vendorId", po.status,
                po.expected_date as "expectedDate", po.ordered_at as "orderedAt", po.received_at as "receivedAt",
                po.total, po.internal_notes as "internalNotes", po.buyer_notes as "buyerNotes", po.created_at as "createdAt",
                coalesce(sum(pol.qty), 0) as "expectedTotalQty",
                coalesce(sum(pol.received_qty), 0) as "receivedTotalQty",
                coalesce(sum(pol.qty * pol.unit_cost), 0) as "expectedTotal"
         from purchase_orders po
         left join vendors v on v.id = po.vendor_id
         left join purchase_order_lines pol on pol.purchase_order_id = po.id
         where po.status in ('approved','partially_received','received','ordered')
           and exists (select 1 from batches b where b.purchase_order_id = po.id and b.archived_at is null and b.status in ('draft','ready','needs_fix','posted','returned'))
         group by po.id, v.name
         order by case po.status when 'approved' then 0 when 'partially_received' then 1 when 'ordered' then 2 when 'received' then 3 else 4 end,
                  po.created_at desc`
      )
    ).rows;
    const orderIds = orders.map((row) => row.id as string);
    const batchRows = orderIds.length
      ? (
          await pool.query(
            `select b.id, b.purchase_order_id as "purchaseOrderId", b.purchase_order_line_id as "purchaseOrderLineId",
                    b.batch_code as "batchCode", b.name, b.category, b.intake_qty as "intakeQty",
                    b.available_qty as "availableQty", b.unit_cost as "unitCost", b.unit_price as "unitPrice",
                    b.uom, b.status, b.notes, b.validation_issues as "validationIssues",
                    b.media_status as "mediaStatus", b.arrival_status as "arrivalStatus",
                    b.vendor_id as "vendorId", b.tags, b.location, b.lot_code as "lotCode",
                    b.item_id as "itemId", i.alias as "itemAlias",
                    pol.qty as "expectedQty", pol.unit_cost as "expectedUnitCost",
                    b.created_at as "createdAt"
             from batches b
             left join purchase_order_lines pol on pol.id = b.purchase_order_line_id
             left join items i on i.id = b.item_id
             where b.purchase_order_id = any($1::uuid[]) and b.archived_at is null
             order by b.created_at`,
            [orderIds]
          )
        ).rows
      : [];
    const grouped = new Map<string, typeof batchRows>();
    for (const row of batchRows) {
      const key = String(row.purchaseOrderId);
      const list = grouped.get(key);
      if (list) list.push(row);
      else grouped.set(key, [row]);
    }
    return orders.map((order) => ({ ...order, batches: grouped.get(order.id as string) ?? [] }));
  }),
  supportPacket: protectedProcedure.query(async () => {
    const [health, counts, errors, recent] = await Promise.all([
      getHealth(),
      pool.query(
        `select
           (select count(*)::int from batches) as batches,
           (select count(*)::int from purchase_orders) as "purchaseOrders",
           (select count(*)::int from sales_orders) as orders,
           (select count(*)::int from invoices) as invoices,
           (select count(*)::int from payments) as payments,
           (select count(*)::int from vendor_bills) as "vendorBills",
           (select count(*)::int from connector_requests) as connectors,
           (select count(*)::int from command_journal) as commands`
      ),
      pool.query(`select id, command_name as "commandName", error, created_at as "createdAt" from command_journal where status = 'failed' order by created_at desc limit 20`),
      pool.query(`select id, command_name as "commandName", actor_name as "actorName", status, created_at as "createdAt", result from command_journal order by created_at desc limit 40`)
    ]);
    return { generatedAt: new Date().toISOString(), health, counts: counts.rows[0], errors: errors.rows, recentCommands: recent.rows };
  }),
  // UX-M02: per-selection support packet — selected grid rows + their related
  // command journal entries + validation issues. Exported as JSON from the
  // RowInspector Issue tab. Narrow scope: max 50 rows × 20 commands each.
  selectionSupportPacket: protectedProcedure
    .input(z.object({
      rowIds: z.array(z.string()).max(50),
    }))
    .query(async ({ input }) => {
      const validIds = input.rowIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      if (validIds.length === 0) return { generatedAt: new Date().toISOString(), rows: [], commands: [] };
      const [rowsResult, commandsResult] = await Promise.all([
        pool.query(
          `select id, command_name as "commandName", actor_name as "actorName", status, error,
                  affected_ids as "affectedIds", created_at as "createdAt"
           from command_journal
           where affected_ids && $1::text[]
           order by created_at desc
           limit 200`,
          [validIds]
        ),
        pool.query(
          `select id, status, error, result, created_at as "createdAt"
           from command_journal
           where id = any($1::uuid[])`,
          [validIds]
        ),
      ]);
      return {
        generatedAt: new Date().toISOString(),
        selectedRowIds: validIds,
        rows: rowsResult.rows,
        commands: commandsResult.rows,
      };
    }),
  snapshotDiff: protectedProcedure.input(z.object({ backupId: z.string().uuid() })).query(async ({ input }) => {
    const backup = (await pool.query('select id, label, snapshot from backup_snapshots where id = $1', [input.backupId])).rows[0];
    if (!backup) return null;
    // [DYNAMIC-AUDIT-P1] previously this query omitted customers/vendors/
    // payments/vendorBills, so snapshotDiff reported current=0 for them, which
    // showed up as misleading negative deltas in the restore preview UI.
    const current = (
      await pool.query(
        `select
           (select count(*)::int from batches) as batches,
           (select count(*)::int from purchase_orders) as "purchaseOrders",
           (select count(*)::int from sales_orders) as orders,
           (select count(*)::int from invoices) as invoices,
           (select count(*)::int from command_journal) as commands,
           (select count(*)::int from customers) as customers,
           (select count(*)::int from vendors) as vendors,
           (select count(*)::int from payments) as payments,
           (select count(*)::int from vendor_bills) as "vendorBills"`
      )
    ).rows[0];
    const snapshotCounts = backup.snapshot?.counts ?? backup.snapshot ?? {};
    const keys = [...new Set([...Object.keys(snapshotCounts), ...Object.keys(current)])];
    return {
      backupId: backup.id,
      label: backup.label,
      rows: keys.map((key) => ({ key, backup: snapshotCounts[key] ?? 0, current: current[key] ?? 0, delta: Number(current[key] ?? 0) - Number(snapshotCounts[key] ?? 0) }))
    };
  }),
  findReplacePreview: protectedProcedure
    .input(z.object({ table: z.enum(['batches', 'customers', 'vendors', 'sales_orders', 'connector_requests']), find: z.string().min(1).max(200), replacement: z.string().max(2000).default('') }))
    .query(async ({ input }) => {
      const fields = replaceFields(input.table);
      const pattern = `%${input.find}%`;
      const where = fields.map((field, index) => `coalesce(${field}::text, '') ilike $${index + 1}`).join(' or ');
      const rows = (
        await pool.query(
          `select id, ${fields.map((field) => `${field}::text as "${field}"`).join(', ')}
           from ${input.table}
           where ${where}
           limit 40`,
          fields.map(() => pattern)
        )
      ).rows;
      return {
        table: input.table,
        fields,
        count: rows.length,
        rows: rows.map((row) => ({
          id: row.id,
          matches: fields
            .filter((field) => String(row[field] ?? '').toLowerCase().includes(input.find.toLowerCase()))
            .map((field) => ({ field, before: row[field], after: String(row[field] ?? '').split(input.find).join(input.replacement) }))
        }))
      };
    }),
  reversalPreview: protectedProcedure.input(z.object({ commandId: z.string().uuid() })).query(async ({ input }) => {
    const row = (
      await pool.query(
        `select id, command_name as "commandName", actor_name as "actorName", status, affected_ids as "affectedIds", before_snapshot as "beforeSnapshot", after_snapshot as "afterSnapshot", reversed_by_command_id as "reversedByCommandId", created_at as "createdAt"
         from command_journal where id = $1`,
        [input.commandId]
      )
    ).rows[0];
    if (!row) return null;
    const policy = reversalPolicies[row.commandName as keyof typeof reversalPolicies];
    return {
      ...row,
      policy,
      reversible: row.status === 'ok' && !row.reversedByCommandId && policy?.disposition === 'reversible',
      plainLanguageImpact:
        row.status !== 'ok'
          ? 'Failed commands do not change ledgers.'
          : policy?.disposition === 'reversible'
            ? `Reversal will mark or offset affected rows from ${row.commandName}.`
            : `${row.commandName} is ${policy?.disposition ?? 'not'} reversible. ${policy?.guidance ?? ''}`.trim()
    };
  }),
  closeoutPreview: protectedProcedure.input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) })).query(async ({ input }) => {
    return getCloseoutSafety(db, input.period);
  }),
  closeoutBlockerRows: protectedProcedure
    .input(
      z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/),
        blockerId: z.string().max(64)
      })
    )
    .query(async ({ input }) => {
      const { period, blockerId } = input;
      type Row = { id: string; label: string; status: string };
      // Parameterized queries — blockerId selects the SQL template; user input
      // is passed as a parameter ($1), never interpolated into the query string.
      const sql: Record<string, [string, unknown[]]> = {
        unsafeBatches: [
          `SELECT b.id::text, coalesce(b.name, b.id::text) AS label, b.status
           FROM batches b
           WHERE to_char(b.created_at, 'YYYY-MM') = $1
             AND b.status IN ('draft', 'needs_fix')
           ORDER BY b.created_at DESC LIMIT 40`,
          [period]
        ],
        unsafePurchaseOrders: [
          `SELECT po.id::text, coalesce(v.name, po.po_no, po.id::text) AS label, po.status
           FROM purchase_orders po LEFT JOIN vendors v ON v.id = po.vendor_id
           WHERE to_char(po.created_at, 'YYYY-MM') = $1
             AND po.status IN ('draft', 'approved', 'ordered', 'partially_received')
           ORDER BY po.created_at DESC LIMIT 40`,
          [period]
        ],
        openConnectors: [
          `SELECT cr.id::text, concat(cr.request_type, ' / ', coalesce(c.name, 'unassigned')) AS label, cr.status
           FROM connector_requests cr LEFT JOIN customers c ON c.id = cr.customer_id
           WHERE to_char(cr.created_at, 'YYYY-MM') = $1
             AND cr.status IN ('open','pending_review','approved','accepted','routed','posting','failed')
           ORDER BY cr.created_at DESC LIMIT 40`,
          [period]
        ],
        openFulfillment: [
          `SELECT pl.id::text, coalesce(so.order_no, pl.pick_no, pl.id::text) AS label, pl.status
           FROM pick_lists pl LEFT JOIN sales_orders so ON so.id = pl.order_id
           WHERE to_char(pl.created_at, 'YYYY-MM') = $1
             AND pl.status IN ('open', 'packed')
           ORDER BY pl.created_at DESC LIMIT 40`,
          [period]
        ],
        failedCommands: [
          `SELECT id::text, command_name AS label, status
           FROM command_journal
           WHERE to_char(created_at, 'YYYY-MM') = $1
             AND status = 'failed'
           ORDER BY created_at DESC LIMIT 40`,
          [period]
        ],
        unresolvedDrafts: [
          `SELECT o.id::text, coalesce(c.name, o.order_no, o.id::text) AS label, o.status
           FROM sales_orders o LEFT JOIN customers c ON c.id = o.customer_id
           WHERE to_char(o.created_at, 'YYYY-MM') = $1
             AND o.status = 'draft'
           ORDER BY o.created_at DESC LIMIT 40`,
          [period]
        ]
      };
      const entry = sql[blockerId];
      if (!entry) return { rows: [] as Row[] };
      const [query, params] = entry;
      const result = await pool.query(query, params as unknown[]);
      return { rows: result.rows as Row[] };
    }),
  salesSuggestions: protectedProcedure
    .input(
      z.object({
        customerId: z.string().uuid().optional(),
        category: z.string().optional(),
        vendorId: z.string().uuid().optional(),
        tag: z.string().optional(),
        priceBracket: z.string().optional(),
        minAvailable: z.coerce.number().optional(),
        agingOnly: z.boolean().optional()
      })
    )
    .query(async ({ input }) => {
    if (!input.customerId) return [];
    const params: unknown[] = [input.customerId];
    const where = ["b.status = 'posted'", 'b.available_qty > 0', '(b.tags && c.tags or cardinality(c.tags) = 0)'];
    if (input.category) {
      params.push(input.category);
      where.push(`b.category = $${params.length}`);
    }
    if (input.vendorId) {
      params.push(input.vendorId);
      where.push(`b.vendor_id = $${params.length}`);
    }
    if (input.tag) {
      params.push(input.tag.toLowerCase());
      where.push(`exists (select 1 from unnest(b.tags) tag where lower(tag) = $${params.length})`);
    }
    if (input.minAvailable != null) {
      params.push(input.minAvailable);
      where.push(`b.available_qty >= $${params.length}`);
    }
    if (input.priceBracket === 'under-25') where.push('b.unit_price < 25');
    if (input.priceBracket === '25-100') where.push('b.unit_price >= 25 and b.unit_price <= 100');
    if (input.priceBracket === '100-plus') where.push('b.unit_price > 100');
    if (input.agingOnly) where.push("(b.intake_date < now() - interval '30 days' OR (b.intake_date IS NULL AND b.created_at < now() - interval '30 days'))");
    return (
      await pool.query(
        `select b.id, b.batch_code as "batchCode", b.name, b.category, v.name as vendor,
                b.available_qty as "availableQty", b.unit_price as "unitPrice", b.unit_cost as "unitCost",
                (b.unit_price - b.unit_cost) as "estimatedMargin",
                array_to_string(b.tags, ', ') as tags,
                case when b.created_at < now() - interval '30 days' then 'Aging lot; ' else '' end ||
                'Matches buyer tags; price from posted batch unit price; margin visible internally' as reason
         from batches b
         join customers c on c.id = $1
         left join vendors v on v.id = b.vendor_id
         where ${where.join(' and ')}
         order by b.created_at desc
         limit 20`,
        params
      )
    ).rows;
  }),
  activeProcessors: protectedProcedure
    .query(async () => {
      return await db
        .select()
        .from(paymentProcessors)
        .where(eq(paymentProcessors.active, true))
        .orderBy(asc(paymentProcessors.name));
    }),
  processorWithTotals: protectedProcedure
    .input(z.object({ processorId: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await db.execute(sql`
        select p.id, p.name, p.processor_type as "processorType", p.fee_type as "feeType",
               p.fee_percentage as "feePercentage", p.fee_fixed_amount as "feeFixedAmount",
               p.default_user_split as "defaultUserSplit", p.default_processor_split as "defaultProcessorSplit",
               p.notes, p.active, p.created_at as "createdAt", p.updated_at as "updatedAt",
               coalesce(sum(pf.processing_fee_total), 0) as "totalFeesProcessed",
               coalesce(sum(case when pf.user_fee_status = 'collectible' then pf.user_fee_share else 0 end), 0) as "userFeesCollectible",
               coalesce(sum(case when pf.user_fee_status = 'collected' then pf.user_fee_share else 0 end), 0) as "userFeesCollected",
               coalesce(sum(case when pf.processor_fee_status = 'unpaid' then pf.processor_fee_share else 0 end), 0) as "processorFeesUnpaid"
        from payment_processors p
        left join processor_fees pf on pf.processor_id = p.id
        where p.id = ${input.processorId}
        group by p.id
      `);

      if (result.rows.length === 0) return null;

      return result.rows[0];
    }),
  processorFees: protectedProcedure
    .input(z.object({
      processorId: z.string().uuid().optional(),
      userFeeStatus: z.enum(['collectible', 'collected']).optional(),
      processorFeeStatus: z.enum(['paid', 'unpaid']).optional(),
    }))
    .query(async ({ input }) => {
      const conditions = [];

      if (input.processorId) {
        conditions.push(eq(processorFees.processorId, input.processorId));
      }
      if (input.userFeeStatus) {
        conditions.push(eq(processorFees.userFeeStatus, input.userFeeStatus));
      }
      if (input.processorFeeStatus) {
        conditions.push(eq(processorFees.processorFeeStatus, input.processorFeeStatus));
      }

      return await db
        .select()
        .from(processorFees)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(processorFees.createdAt))
        .limit(200);
    }),
  refereeCredits: protectedProcedure
    .input(z.object({ refereeId: z.string().uuid() }))
.query(async ({ input }) => {
      const result = await db.execute(sql`
        select rc.id,
               rc.referee_id as "refereeId",
               rc.referee_relationship_id as "refereeRelationshipId",
               rc.transaction_type as "transactionType",
               rc.transaction_id as "transactionId",
               rc.transaction_no as "transactionNo",
               rc.transaction_total as "transactionTotal",
               rc.credit_amount as "creditAmount",
               rc.amount_paid as "amountPaid",
               rc.status,
               rc.paid_at as "paidAt",
               rc.voided_at as "voidedAt",
               rc.voided_reason as "voidedReason",
               rc.notes,
               rc.created_at as "createdAt"
        from referee_credits rc
        where rc.referee_id = ${input.refereeId}
        order by rc.created_at desc
      `);
      return result.rows;
    }),
  poContextSignals: protectedProcedure.query(async () => {
    const [invRows, priceRows] = await Promise.all([
      // Current inventory grouped by category — includes zero-stock categories
      pool.query<{ category: string; subcategory: string | null; availableQty: string; batchCount: string; uom: string | null }>(`
        select category,
               subcategory,
               coalesce(sum(available_qty), 0)::numeric(14,3) as "availableQty",
               count(*) as "batchCount",
               min(uom) filter (where available_qty > 0) as uom
        from batches
        where status = 'posted'
          and category is not null
          and category <> ''
        group by category, subcategory
        order by coalesce(sum(available_qty), 0) asc, category, subcategory nulls last
      `),
      // Average recent procurement cost per category from PO lines in last 90 days
      pool.query<{ category: string; subcategory: string | null; avgCost: string; minCost: string; maxCost: string; poCount: number; lastPoDate: string | null }>(`
        select pol.category,
               pol.subcategory,
               round(avg(pol.unit_cost)::numeric, 2) as "avgCost",
               round(min(pol.unit_cost)::numeric, 2) as "minCost",
               round(max(pol.unit_cost)::numeric, 2) as "maxCost",
               count(distinct po.id)::int as "poCount",
               max(po.created_at) as "lastPoDate"
        from purchase_order_lines pol
        join purchase_orders po on po.id = pol.purchase_order_id
        where po.created_at > now() - interval '90 days'
          and pol.unit_cost > 0
          and pol.category is not null
          and pol.category <> ''
        group by pol.category, pol.subcategory
        order by pol.category, pol.subcategory nulls last
      `)
    ]);
    return {
      inventory: invRows.rows,
      pricing: priceRows.rows
    };
  }),
  // CAP-030 (TER-1498): Warehouse pick queue. Returns one row per pick_list that
  // has at least one pick-released, non-cancelled fulfillment line. Fully-packed
  // picks stay visible as "ready to close" so the operator can "Complete Order"
  // without the pick vanishing from the queue. Ordered by oldest pick_released_at
  // for FIFO.
  pickQueue: protectedProcedure.query(async () => {
    return (
      await pool.query(
        `SELECT
           pl.id,
           pl.pick_no AS "pickNo",
           pl.order_id AS "orderId",
           so.order_no AS "orderNo",
           c.name AS customer,
           CASE WHEN COUNT(fl.id) FILTER (WHERE fl.actual_qty = 0 AND fl.status = 'open' AND fl.status_extended IS DISTINCT FROM 'cancelled') = 0
                AND COUNT(fl.id) FILTER (WHERE fl.actual_qty > 0) > 0
                THEN 'ready_to_close'
                ELSE pl.status
           END AS status,
           pl.assigned_to AS "assignedTo",
           pl.created_at AS "createdAt",
           COUNT(fl.id) FILTER (WHERE fl.status = 'open' AND fl.status_extended IS DISTINCT FROM 'cancelled')::int AS "openLines",
           COUNT(fl.id)::int AS "totalLines",
           COALESCE(SUM(jsonb_array_length(fl.warehouse_alerts)), 0)::int AS "alertCount",
           MIN(sol.pick_released_at) AS "oldestReleasedAt"
         FROM pick_lists pl
         JOIN sales_orders so ON so.id = pl.order_id
         LEFT JOIN customers c ON c.id = so.customer_id
         LEFT JOIN fulfillment_lines fl ON fl.pick_list_id = pl.id
         LEFT JOIN sales_order_lines sol ON sol.id = fl.order_line_id AND sol.pick_released_at IS NOT NULL
         WHERE pl.status = 'open'
           AND EXISTS (
             SELECT 1 FROM fulfillment_lines fl2
             WHERE fl2.pick_list_id = pl.id
               AND fl2.status_extended IS DISTINCT FROM 'cancelled'
           )
         GROUP BY pl.id, so.order_no, c.name
         ORDER BY MIN(sol.pick_released_at) ASC NULLS LAST`
      )
    ).rows;
  }),

  // CAP-030 (TER-1498): Detail view of a single pick list — header plus all fulfillment
  // lines. Computes a derived pick_status for each line (released / picking / picked /
  // recall_pending / cancelled / recalled) so the UI doesn't have to reimplement that.
  pickListWithLines: protectedProcedure.input(z.object({ pickListId: z.string().uuid() })).query(async ({ input }) => {
    const header = (
      await pool.query(
        `SELECT pl.id, pl.pick_no AS "pickNo", pl.order_id AS "orderId",
                so.order_no AS "orderNo", c.name AS customer, pl.status,
                pl.assigned_to AS "assignedTo", pl.created_at AS "createdAt"
         FROM pick_lists pl
         JOIN sales_orders so ON so.id = pl.order_id
         LEFT JOIN customers c ON c.id = so.customer_id
         WHERE pl.id = $1
         LIMIT 1`,
        [input.pickListId]
      )
    ).rows[0] ?? null;

    const lines = (
      await pool.query(
        `SELECT
           fl.id,
           fl.order_line_id AS "orderLineId",
           fl.batch_id AS "batchId",
           sol.item_name AS "itemName",
           COALESCE(sol.display_name, i.alias, sol.item_name) AS "displayName",
           b.batch_code AS "batchCode",
           fl.expected_qty AS "expectedQty",
           fl.actual_qty AS "actualQty",
           fl.bag_code AS "bagCode",
           fl.status,
           fl.warehouse_alerts AS "warehouseAlerts",
           fl.status_extended AS "statusExtended",
           sol.pick_released_at AS "pickReleasedAt",
           CASE
             WHEN fl.status_extended = 'cancelled' THEN 'cancelled'
             WHEN fl.status_extended = 'recall_pending' THEN 'recall_pending'
             WHEN fl.actual_qty > 0 AND fl.status = 'packed' THEN 'picked'
             WHEN fl.actual_qty > 0 THEN 'picking'
             WHEN sol.pick_released_at IS NOT NULL THEN 'released'
             ELSE 'recalled'
           END AS "pickStatus",
           fl.updated_at AS "updatedAt"
         FROM fulfillment_lines fl
         LEFT JOIN sales_order_lines sol ON sol.id = fl.order_line_id
         LEFT JOIN batches b ON b.id = fl.batch_id
         LEFT JOIN items i ON i.id = b.item_id
         WHERE fl.pick_list_id = $1
         ORDER BY fl.created_at`,
        [input.pickListId]
      )
    ).rows;

    return { header, lines };
  }),

  // CAP-030 (TER-1498): Per-order release eligibility. Returns one entry per sales
  // line with a boolean `eligible` and a list of human-readable reasons when not.
  // Mirrors the eligibility rules enforced by the releaseLineForPicking command.
  releaseEligibility: protectedProcedure.input(z.object({ orderId: z.string().uuid() })).query(async ({ input }) => {
    const lines = (
      await pool.query(
        `SELECT
           sol.id AS "lineId",
           sol.item_name AS "itemName",
           sol.batch_id AS "batchId",
           sol.qty,
           sol.validation_issues AS "validationIssues",
           sol.pick_released_at AS "pickReleasedAt",
           b.reserved_qty AS "batchReservedQty"
         FROM sales_order_lines sol
         LEFT JOIN batches b ON b.id = sol.batch_id
         WHERE sol.order_id = $1
         ORDER BY sol.created_at`,
        [input.orderId]
      )
    ).rows;

    return lines.map((row: Record<string, unknown>) => {
      const reasons: string[] = [];
      if (!row.itemName) reasons.push('Item name is not set.');
      if (!row.batchId) reasons.push('No batch assigned.');
      if (Number(row.qty) <= 0) reasons.push('Quantity must be greater than zero.');
      const issues = Array.isArray(row.validationIssues) ? (row.validationIssues as string[]) : [];
      const fatalIssues = issues.filter((i: string) => !i.startsWith('Pick landed COGS'));
      if (fatalIssues.length) reasons.push(`Resolve validation issues: ${fatalIssues.join('; ')}`);
      if (row.batchId && Number(row.batchReservedQty) < Number(row.qty)) {
        reasons.push('Insufficient reservation — reserve inventory first.');
      }
      return {
        lineId: row.lineId,
        eligible: reasons.length === 0,
        alreadyReleased: !!row.pickReleasedAt,
        reasons
      };
    });
  }),

  // CAP-029 (TER-1564): Contact directory — paginated list of all contacts with
  // role filters, search, and key financial summary columns.
  contactDirectory: protectedProcedure
    .input(z.object({
      limit:      z.number().int().min(1).max(100).default(50),
      cursor:     z.string().optional(),
      roleFilter: z.array(z.enum(['customer', 'vendor', 'referee', 'processor', 'contractor', 'employee'])).optional(),
      query:      z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { limit, cursor, roleFilter, query: searchQuery } = input;

      // Cursor is encoded as "updatedAt_ISO|uuid" for stable keyset pagination
      let cursorTs: string | null = null;
      let cursorId: string | null = null;
      if (cursor) {
        const parts = cursor.split('|');
        cursorTs = parts[0] ?? null;
        cursorId = parts[1] ?? null;
      }

      let sql = `
        SELECT
          c.id, c.name, c.display_name AS "displayName", c.company_name AS "companyName",
          c.phone, c.email, c.active,
          c.is_customer AS "isCustomer", c.is_vendor AS "isVendor",
          c.is_referee AS "isReferee", c.is_processor AS "isProcessor",
          c.is_contractor AS "isContractor", c.is_employee AS "isEmployee",
          c.tags, c.updated_at AS "updatedAt",
          cu.balance AS "customerBalance", cu.credit_limit AS "customerCreditLimit",
          COALESCE(vb.open_bills_amount, 0) AS "vendorOpenBills"
        FROM contacts c
        LEFT JOIN customers cu ON cu.contact_id = c.id
        LEFT JOIN (
          SELECT v.contact_id, SUM(vb.amount - vb.amount_paid) AS open_bills_amount
          FROM vendor_bills vb
          JOIN vendors v ON v.id = vb.vendor_id
          WHERE vb.status IN ('approved','scheduled')
          GROUP BY v.contact_id
        ) vb ON vb.contact_id = c.id
        WHERE c.active = true
      `;
      const params: unknown[] = [];
      let idx = 1;

      if (cursorTs && cursorId) {
        sql += ` AND (c.updated_at, c.id) < ($${idx}::timestamptz, $${idx + 1}::uuid)`;
        params.push(cursorTs, cursorId); idx += 2;
      }
      if (searchQuery) {
        sql += ` AND (lower(c.name) LIKE $${idx} OR lower(c.email) LIKE $${idx})`;
        params.push(`%${searchQuery.toLowerCase()}%`); idx++;
      }
      if (roleFilter?.length) {
        const ROLE_COL_MAP: Record<string, string> = {
          customer: 'is_customer', vendor: 'is_vendor', referee: 'is_referee',
          processor: 'is_processor', contractor: 'is_contractor', employee: 'is_employee',
        };
        const conditions = roleFilter
          .filter((r) => r in ROLE_COL_MAP)
          .map((r) => `c.${ROLE_COL_MAP[r]} = true`)
          .join(' OR ');
        if (conditions) sql += ` AND (${conditions})`;
      }

      sql += ` ORDER BY c.updated_at DESC, c.id DESC LIMIT $${idx}`;
      params.push(limit + 1);

      const result = await pool.query(sql, params);
      const rows = result.rows;
      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      const lastRow = rows[rows.length - 1] as { updatedAt: string; id: string } | undefined;
      const nextCursor = hasMore && lastRow
        ? `${new Date(lastRow.updatedAt).toISOString()}|${lastRow.id}`
        : null;
      return { rows, nextCursor };
    }),

  // CAP-029 (TER-1564): Full contact profile — header contact plus all linked
  // entity rows (customer, vendor, referee, processor, user) and upcoming appointment count.
  contactProfile: protectedProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ input: { contactId } }) => {
      // GH #315: explicit column list — prevents future sensitive columns from
      // leaking automatically when the contacts table gains new fields.
      const contactResult = await pool.query(
        `SELECT id, name, display_name, phone, secondary_phone, email, address,
                company_name, contact_kind, preferred_contact_method, notes, tags,
                is_customer, is_vendor, is_referee, is_processor, is_contractor, is_employee,
                active, archived_at, archived_by, archived_reason, created_at, updated_at
         FROM contacts WHERE id = $1`,
        [contactId]
      );
      const contact = contactResult.rows[0] as Record<string, unknown> | undefined;
      if (!contact) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' });

      const [customerRow, vendorRow, refereeRow, processorRow, userRow, orderStats] = await Promise.all([
        // GH #315: explicit column list for customers — prevents future internal
        // credit-engine or PII columns from being silently exposed to the client.
        contact.is_customer
          ? pool.query(`SELECT cu.id, cu.name, cu.credit_limit, cu.balance, cu.tags,
              cu.pricing_rule, cu.notes, cu.engine_max, cu.stance_id,
              cu.credit_limit_source, cu.engine_enabled, cu.engine_disabled_at,
              cu.engine_disabled_by, cu.engine_disabled_reason, cu.last_assessment_id,
              cu.credit_limit_manual_set_at, cu.credit_limit_manual_set_by,
              cu.credit_limit_manual_reason, cu.credit_limit_reminder_days,
              cu.credit_limit_last_reviewed_at, cu.credit_limit_snooze_count,
              cu.contact_id, cu.created_at, cu.updated_at,
              COALESCE(so_stats.lifetime_order_count, 0) AS lifetime_order_count,
              COALESCE(so_stats.lifetime_revenue, 0) AS lifetime_revenue,
              so_stats.last_order_date,
              COALESCE(inv_stats.open_invoices_count, 0) AS open_invoices_count,
              COALESCE(inv_stats.open_invoices_amount, 0) AS open_invoices_amount,
              COALESCE(inv_stats.oldest_open_invoice_days, 0) AS oldest_open_invoice_days
            FROM customers cu
            LEFT JOIN (
              SELECT customer_id,
                COUNT(*) AS lifetime_order_count,
                COALESCE(SUM(total), 0) AS lifetime_revenue,
                MAX(created_at) AS last_order_date
              FROM sales_orders
              GROUP BY customer_id
            ) so_stats ON so_stats.customer_id = cu.id
            LEFT JOIN (
              SELECT customer_id,
                COUNT(*) FILTER (WHERE status IN ('open','partial')) AS open_invoices_count,
                COALESCE(SUM(total - amount_paid) FILTER (WHERE status IN ('open','partial')), 0) AS open_invoices_amount,
                COALESCE(MAX(EXTRACT(DAY FROM NOW() - created_at)) FILTER (WHERE status IN ('open','partial')), 0) AS oldest_open_invoice_days
              FROM invoices
              GROUP BY customer_id
            ) inv_stats ON inv_stats.customer_id = cu.id
            WHERE cu.contact_id = $1
            GROUP BY cu.id, cu.name, cu.credit_limit, cu.balance, cu.tags, cu.pricing_rule,
              cu.notes, cu.engine_max, cu.stance_id, cu.credit_limit_source, cu.engine_enabled,
              cu.engine_disabled_at, cu.engine_disabled_by, cu.engine_disabled_reason,
              cu.last_assessment_id, cu.credit_limit_manual_set_at, cu.credit_limit_manual_set_by,
              cu.credit_limit_manual_reason, cu.credit_limit_reminder_days,
              cu.credit_limit_last_reviewed_at, cu.credit_limit_snooze_count, cu.contact_id,
              cu.created_at, cu.updated_at,
              so_stats.lifetime_order_count, so_stats.lifetime_revenue, so_stats.last_order_date,
              inv_stats.open_invoices_count, inv_stats.open_invoices_amount, inv_stats.oldest_open_invoice_days`, [contactId])
          : Promise.resolve({ rows: [] }),
        // GH #315: explicit column list for vendors — prevents future columns
        // (e.g. internal payment routing fields) from leaking to the client.
        contact.is_vendor
          ? pool.query(`SELECT v.id, v.name, v.alias, v.terms_days, v.consignment_default,
              v.contact, v.notes, v.contact_id, v.created_at, v.updated_at,
              COALESCE(bill_stats.total_billed, 0) AS total_billed,
              COALESCE(bill_stats.total_paid, 0) AS total_paid,
              COALESCE(bill_stats.open_bills_count, 0) AS open_bills_count,
              COALESCE(bill_stats.open_bills_amount, 0) AS open_bills_amount,
              COALESCE(po_stats.open_po_count, 0) AS open_po_count
            FROM vendors v
            LEFT JOIN (
              SELECT vendor_id,
                COALESCE(SUM(amount), 0) AS total_billed,
                COALESCE(SUM(amount_paid), 0) AS total_paid,
                COUNT(*) FILTER (WHERE status NOT IN ('paid','void','reversed')) AS open_bills_count,
                COALESCE(SUM(amount - amount_paid) FILTER (WHERE status NOT IN ('paid','void','reversed')), 0) AS open_bills_amount
              FROM vendor_bills
              GROUP BY vendor_id
            ) bill_stats ON bill_stats.vendor_id = v.id
            LEFT JOIN (
              SELECT vendor_id,
                COUNT(*) FILTER (WHERE status NOT IN ('received','cancelled')) AS open_po_count
              FROM purchase_orders
              GROUP BY vendor_id
            ) po_stats ON po_stats.vendor_id = v.id
            WHERE v.contact_id = $1
            GROUP BY v.id, v.name, v.alias, v.terms_days, v.consignment_default, v.contact,
              v.notes, v.contact_id, v.created_at, v.updated_at,
              bill_stats.total_billed, bill_stats.total_paid, bill_stats.open_bills_count,
              bill_stats.open_bills_amount, po_stats.open_po_count`, [contactId])
          : Promise.resolve({ rows: [] }),
        // GH #315: explicit referee columns — tax_id and payment_details are
        // sensitive; enumerating columns ensures future additions are not
        // accidentally included unless explicitly opted in.
        contact.is_referee
          ? pool.query(
              `SELECT id, name, email, phone, tax_id, balance, lifetime_earned,
                      payment_method, payment_details, notes, active,
                      contact_id, created_at, updated_at
               FROM referees WHERE contact_id = $1 LIMIT 1`,
              [contactId]
            )
          : Promise.resolve({ rows: [] }),
        // GH #315: explicit processor columns — fee configuration is sensitive
        // financial data; explicit list prevents future fields from leaking.
        contact.is_processor
          ? pool.query(
              `SELECT id, name, processor_type, fee_type, fee_percentage, fee_fixed_amount,
                      default_user_split, default_processor_split, notes, active,
                      contact_id, created_at, updated_at
               FROM payment_processors WHERE contact_id = $1 LIMIT 1`,
              [contactId]
            )
          : Promise.resolve({ rows: [] }),
        contact.is_employee
          ? pool.query(`SELECT id, name, email, role, work_loop AS "workLoop" FROM users WHERE contact_id = $1 LIMIT 1`, [contactId])
          : Promise.resolve({ rows: [] }),
        pool.query(`SELECT COUNT(*) AS upcoming_count FROM appointments WHERE contact_id = $1 AND starts_at > NOW() AND status = 'scheduled'`, [contactId]),
      ]);

      return {
        contact,
        customer:  customerRow.rows[0]  ?? null,
        vendor:    vendorRow.rows[0]    ?? null,
        referee:   refereeRow.rows[0]   ?? null,
        processor: processorRow.rows[0] ?? null,
        user:      userRow.rows[0]      ?? null,
        upcomingAppointmentCount: Number((orderStats.rows[0] as { upcoming_count?: unknown } | undefined)?.upcoming_count ?? 0),
      };
    }),

  // CAP-029 (TER-1564): Upcoming and past appointments for a contact.
  contactAppointments: protectedProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ input: { contactId } }) => {
      // GH #315: explicit appointment columns — prevents future internal audit or
      // notification fields from leaking when the appointments table gains new columns.
      const apptCols = `id, contact_id, title, description, starts_at, ends_at,
                         appointment_type, status, location, created_by, notes,
                         created_at, updated_at`;
      const [upcomingResult, pastResult] = await Promise.all([
        pool.query(
          `SELECT ${apptCols} FROM appointments
           WHERE contact_id = $1 AND starts_at > NOW() AND status = 'scheduled'
           ORDER BY starts_at ASC`,
          [contactId]
        ),
        pool.query(
          `SELECT ${apptCols} FROM appointments
           WHERE contact_id = $1 AND (starts_at <= NOW() OR status IN ('completed','cancelled'))
           ORDER BY starts_at DESC LIMIT 50`,
          [contactId]
        ),
      ]);
      return {
        upcoming: upcomingResult.rows,
        past:     pastResult.rows,
      };
    }),

  // CAP-029 (TER-1564): Contact ledger with running balance via window function.
  // TER-1654: Added kind filter and total count for browsable ledger panel.
  contactLedger: protectedProcedure
    .input(z.object({
      contactId: z.string().uuid(),
      limit:     z.number().int().min(1).max(200).default(50),
      cursor:    z.string().optional(),
      kind:      z.string().optional(),
    }))
    .query(async ({ input: { contactId, limit, cursor, kind } }) => {
      // GH #300 — real keyset cursor: encode as "created_at_ISO|uuid"
      let cursorTs: string | null = null;
      let cursorId: string | null = null;
      if (cursor) {
        const parts = cursor.split('|');
        cursorTs = parts[0] ?? null;
        cursorId = parts[1] ?? null;
      }

      // Build filter conditions for reuse in both count and data queries.
      const filterClauses: string[] = [];
      const filterParams: unknown[] = [];
      let filterIdx = 1;

      // contact_id filter (always present in CTE / count)
      filterClauses.push(`contact_id = $${filterIdx}`);
      filterParams.push(contactId); filterIdx++;

      if (kind) {
        filterClauses.push(`kind = $${filterIdx}`);
        filterParams.push(kind); filterIdx++;
      }

      const whereFilter = filterClauses.join(' AND ');

      // CTE: compute running_balance over ALL entries for this contact so the
      // running balance stays correct even when filtered by kind (TER-1654).
      const cte = `WITH all_entries AS (
        SELECT id, kind, amount, method, reference, note, created_at,
          SUM(amount) OVER (PARTITION BY contact_id ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
        FROM contact_ledger_entries
        WHERE contact_id = $1
      )`;

      let dataSql = `${cte} SELECT * FROM all_entries WHERE ${whereFilter}`;
      const dataParams: unknown[] = [...filterParams];
      let dataIdx = filterIdx;

      if (cursorTs && cursorId) {
        dataSql += ` AND (created_at, id) < ($${dataIdx}::timestamptz, $${dataIdx + 1}::uuid)`;
        dataParams.push(cursorTs, cursorId); dataIdx += 2;
      }

      dataSql += ` ORDER BY created_at DESC LIMIT $${dataIdx}`;
      dataParams.push(limit + 1);

      const countSql = `SELECT COUNT(*) FROM contact_ledger_entries WHERE ${whereFilter}`;

      const [dataResult, countResult] = await Promise.all([
        pool.query(dataSql, dataParams),
        pool.query(countSql, filterParams)
      ]);

      const rows = dataResult.rows;
      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      const lastRow = rows[rows.length - 1] as { created_at: string; id: string } | undefined;
      const nextCursor = hasMore && lastRow
        ? `${new Date(lastRow.created_at).toISOString()}|${lastRow.id}`
        : null;
      const total = Number(countResult.rows[0]?.count ?? 0);
      return { rows, nextCursor, total };
    }),

  // CAP-029 (TER-1564): Sales order history for a customer entity.
  customerOrderHistory: protectedProcedure
    .input(z.object({
      customerId: z.string().uuid(),
      limit:      z.number().int().min(1).max(200).default(50),
      cursor:     z.string().optional(),   // GH #300 — composite "created_at_ISO|uuid" cursor
    }))
    .query(async ({ input: { customerId, limit, cursor } }) => {
      // GH #300 — real keyset cursor: encode as "created_at_ISO|uuid"
      let cursorTs: string | null = null;
      let cursorId: string | null = null;
      if (cursor) {
        const parts = cursor.split('|');
        cursorTs = parts[0] ?? null;
        cursorId = parts[1] ?? null;
      }

      let sql = `SELECT id, order_no AS "orderNo", created_at AS "createdAt",
        (SELECT COUNT(*) FROM sales_order_lines WHERE sales_order_lines.order_id = sales_orders.id) AS line_count,
        total, status, posted_at AS "postedAt"
       FROM sales_orders
       WHERE customer_id = $1`;
      const params: unknown[] = [customerId];
      let idx = 2;

      if (cursorTs && cursorId) {
        sql += ` AND (created_at, id) < ($${idx}::timestamptz, $${idx + 1}::uuid)`;
        params.push(cursorTs, cursorId); idx += 2;
      }

      sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
      params.push(limit + 1);

      const result = await pool.query(sql, params);
      const rows = result.rows;
      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      const lastRow = rows[rows.length - 1] as { createdAt: string; id: string } | undefined;
      const nextCursor = hasMore && lastRow
        ? `${new Date(lastRow.createdAt).toISOString()}|${lastRow.id}`
        : null;
      return { rows, nextCursor };
    }),

  // CAP-029 (TER-1653): Paginated, filterable client ledger entries for a customer.
  customerLedgerEntries: protectedProcedure
    .input(z.object({
      customerId: z.string().uuid(),
      kind:       z.string().optional(),          // filter by transaction kind
      dateFrom:   z.string().optional(),          // ISO date YYYY-MM-DD
      dateTo:     z.string().optional(),          // ISO date YYYY-MM-DD
      limit:      z.number().int().min(1).max(200).default(50),
      cursor:     z.string().optional(),          // composite "created_at_ISO|uuid"
    }))
    .query(async ({ input: { customerId, kind, dateFrom, dateTo, limit, cursor } }) => {
      let cursorTs: string | null = null;
      let cursorId: string | null = null;
      if (cursor) {
        const parts = cursor.split('|');
        cursorTs = parts[0] ?? null;
        cursorId = parts[1] ?? null;
      }

      let sql = `SELECT id, kind, amount, balance_after AS "balanceAfter", note, created_at AS "createdAt"
        FROM client_ledger_entries
        WHERE customer_id = $1`;
      const params: unknown[] = [customerId];
      let idx = 2;

      if (kind) {
        sql += ` AND kind = $${idx}`;
        params.push(kind); idx++;
      }
      if (dateFrom) {
        sql += ` AND created_at >= $${idx}::timestamptz`;
        params.push(dateFrom); idx++;
      }
      if (dateTo) {
        sql += ` AND created_at < ($${idx}::timestamptz + interval '1 day')`;
        params.push(dateTo); idx++;
      }

      if (cursorTs && cursorId) {
        sql += ` AND (created_at, id) < ($${idx}::timestamptz, $${idx + 1}::uuid)`;
        params.push(cursorTs, cursorId); idx += 2;
      }

      sql += ` ORDER BY created_at DESC, id DESC LIMIT $${idx}`;
      params.push(limit + 1);

      const result = await pool.query(sql, params);
      const rows = result.rows;
      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      const lastRow = rows[rows.length - 1] as { createdAt: string; id: string } | undefined;
      const nextCursor = hasMore && lastRow
        ? `${new Date(lastRow.createdAt).toISOString()}|${lastRow.id}`
        : null;
      return { rows, nextCursor };
    }),

  mergeCandidateCount: protectedProcedure.query(async () => {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM contact_merge_candidates WHERE reviewed = false AND dismissed = false`
    );
    return { count: Number(result.rows[0]?.count ?? 0) };
  }),

  /**
   * Returns pending merge candidates with contact details for review.
   * Joins contact_merge_candidates with contacts twice to resolve both sides.
   */
  mergeCandidates: protectedProcedure.query(async () => {
    const result = await pool.query(
      `SELECT
        cmc.id,
        cmc.contact_a_id AS "contactAId",
        cmc.contact_b_id AS "contactBId",
        cmc.match_reason AS "matchReason",
        cmc.reviewed,
        cmc.dismissed,
        cmc.merged_into AS "mergedInto",
        cmc.created_at AS "createdAt",
        ca.name AS "contactAName",
        ca.phone AS "contactAPhone",
        ca.email AS "contactAEmail",
        cb.name AS "contactBName",
        cb.phone AS "contactBPhone",
        cb.email AS "contactBEmail"
       FROM contact_merge_candidates cmc
       JOIN contacts ca ON ca.id = cmc.contact_a_id
       JOIN contacts cb ON cb.id = cmc.contact_b_id
       WHERE cmc.reviewed = false
       ORDER BY cmc.created_at DESC
       LIMIT 100`
    );
    return { rows: result.rows };
  }),

  /**
   * Returns recent command journal entries (up to 500, newest first).
   * This procedure exists for testing and support/debugging use only;
   * there is no operator-facing journal view at this time.
   * Used by adversarial idempotency tests to verify that concurrent requests
   * with the same idempotency key produce exactly one journal row.
   * Manager-gated so it cannot be called from viewer/operator surfaces.
   */
  commandJournal: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user, 'manager');

    return db
      .select({
        id: commandJournal.id,
        commandName: commandJournal.commandName,
        idempotencyKey: commandJournal.idempotencyKey,
        actorId: commandJournal.actorId,
        actorName: commandJournal.actorName,
        status: commandJournal.status,
        affectedIds: commandJournal.affectedIds,
        createdAt: commandJournal.createdAt,
      })
      .from(commandJournal)
      .orderBy(desc(commandJournal.createdAt))
      .limit(500);
  }),

  // TER-1632 — "Your drafts (N)" dashboard row.
  // Returns draft POs and draft SOs that belong to the currently-logged-in
  // operator. Actor ownership is resolved via command_journal (GIN index on
  // affected_ids from migration 0043) so no schema migration is required.
  // purchase_orders.ordered_by is used as a fast fallback for POs.
  myDrafts: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    return (await pool.query<{
      id: string;
      route: string;
      lane: string;
      title: string;
      status: string;
      createdAt: string;
      detail: string;
      type: string;
    }>(`
      select id, route, lane, title, status, "createdAt", detail, type
      from (
        -- Draft purchase orders owned by the current user
        select po.id, 'purchaseOrders' as route, 'Purchase' as lane, po.po_no as title,
               po.status, po.created_at as "createdAt",
               concat(coalesce(v.name, 'No vendor'), ' / $', po.total) as detail,
               'purchaseOrder' as type
        from purchase_orders po
        left join vendors v on v.id = po.vendor_id
        where po.status = 'draft'
          and (
            po.ordered_by = $1
            or exists (
              select 1 from command_journal cj
              where po.id::text = any(cj.affected_ids)
                and cj.actor_id = $1
                and cj.command_name = 'createPurchaseOrder'
            )
          )
        union all
        -- Draft sales orders created by the current user
        select so.id, 'orders' as route, 'Sales' as lane, so.order_no as title,
               so.status, so.created_at as "createdAt",
               concat(coalesce(c.name, 'No customer'), ' / $', so.total) as detail,
               'salesOrder' as type
        from sales_orders so
        left join customers c on c.id = so.customer_id
        where so.status = 'draft'
          and exists (
            select 1 from command_journal cj
            where so.id::text = any(cj.affected_ids)
              and cj.actor_id = $1
              and cj.command_name = 'createSalesOrder'
          )
      ) t
      order by "createdAt" desc
    `, [userId])).rows;
  }),

  // TER-1618 follow-up: Priority 2 — return the qty from the most recent
  // confirmed/posted sales order line for this customer+batch so InventoryFinderPanel
  // can pre-fill the qty input with the customer's last ordered amount.
  customerLastOrderedQty: publicProcedure
    .input(z.object({ batchId: z.string().uuid(), customerId: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query<{ qty: string }>(
        `select sol.qty
         from sales_order_lines sol
         join sales_orders so on so.id = sol.order_id
         where sol.batch_id = $1
           and so.customer_id = $2
           and sol.status in ('confirmed', 'reserved', 'allocated', 'posted')
         order by sol.created_at desc
         limit 1`,
        [input.batchId, input.customerId]
      );
      return result.rows[0]?.qty ?? null;
    }),

  // SX-A01: Bulk variant replaces per-row customerLastOrderedQty queries.
  // A single customer+batchIds query stays within HTTP header limits (the
  // per-row pattern exceeded them at ~80 rows → HTTP 431).
  customerLastOrderedQtyBulk: publicProcedure
    .input(z.object({ customerId: z.string().uuid(), batchIds: z.array(z.string().uuid()).max(200) }))
    .query(async ({ input }) => {
      if (!input.batchIds.length) return {};
      const result = await pool.query<{ batch_id: string; qty: string }>(
        `select distinct on (sol.batch_id) sol.batch_id, sol.qty
         from sales_order_lines sol
         join sales_orders so on so.id = sol.order_id
         where sol.batch_id = any($1::uuid[])
           and so.customer_id = $2
           and sol.status in ('confirmed', 'reserved', 'allocated', 'posted')
         order by sol.batch_id, sol.created_at desc`,
        [input.batchIds, input.customerId]
      );
      const map: Record<string, string | null> = {};
      for (const row of result.rows) {
        map[row.batch_id] = row.qty;
      }
      return map;
    }),

  // -- Entity tab queries (T-B-08) --
  ...entityTabProcedures,

  // -- Detail queries for slide-over entities (T-B-09) --
  ...detailQueryProcedures,
});

type ReplaceTable = 'batches' | 'customers' | 'vendors' | 'sales_orders' | 'connector_requests';

function replaceFields(table: ReplaceTable) {
  const map: Record<ReplaceTable, string[]> = {
    batches: ['name', 'source_code', 'shorthand', 'legacy_marker', 'notes'],
    customers: ['name', 'notes'],
    vendors: ['name', 'notes'],
    sales_orders: ['delivery_window', 'legacy_status_markers', 'notes'],
    connector_requests: ['operator_notes']
  };
  return map[table];
}

// ─── gridSqlParts — structured builder returning body + default order-by.
// Used by gridSql (backwards compat) and buildGridV2Query (new filter/sort/paginate).
export interface GridSqlParts {
  body: string;
  defaultOrderBy: string;
}

function gridSqlParts(view: z.infer<typeof viewSchema>): GridSqlParts {
  switch (view) {
    case 'reports':
      return {
        body: `select key as id, label, value, definition, severity, checked_at as "createdAt"
               from (
                 select 'inventory_value' as key, 'Inventory value' as label, coalesce(sum(available_qty * unit_cost), 0)::text as value,
                        'Available quantity multiplied by unit cost' as definition, 'neutral' as severity, now() as checked_at
                 from batches where archived_at is null
                 union all
                 select 'receivables' as key, 'Receivables' as label, coalesce(sum(total - amount_paid), 0)::text as value,
                        'Open invoice balance' as definition, 'watch' as severity, now() as checked_at
                 from invoices where status in ('open','partial')
                 union all
                 select 'payables' as key, 'Payables' as label, coalesce(sum(amount - amount_paid), 0)::text as value,
                        'Open vendor bill balance' as definition, 'watch' as severity, now() as checked_at
                 from vendor_bills where status in ('open','approved','scheduled','partial')
               ) reports`,
        defaultOrderBy: 'label',
      };
    case 'intake':
      return {
        body: `select b.id, b.batch_code as "batchCode", b.shorthand, b.name, b.category, v.name as vendor, b.vendor_id as "vendorId",
                      po.po_no as "poNo", b.purchase_order_id as "purchaseOrderId", b.purchase_order_line_id as "purchaseOrderLineId",
                      b.source_code as "sourceCode", b.intake_date as "intakeDate", b.ticket_cost as "ticketCost", b.price_range as "priceRange",
                      b.tags, b.intake_qty as "intakeQty", b.available_qty as "availableQty", b.uom, b.unit_cost as "unitCost",
                      b.unit_price as "unitPrice", b.location, b.lot_code as "lotCode", b.ownership_status as "ownershipStatus",
                      b.legacy_marker as "legacyMarker", b.arrival_confirmed as "arrivalConfirmed", b.arrival_status as "arrivalStatus",
                      b.validation_issues as "validationIssues", b.media_status as "mediaStatus", b.expiration_date as "expirationDate",
                      b.item_id as "itemId", i.alias as "itemAlias",
                      b.notes, b.status, b.created_at as "createdAt"
               from batches b
               left join vendors v on v.id = b.vendor_id
               left join purchase_orders po on po.id = b.purchase_order_id
               left join items i on i.id = b.item_id
               where b.archived_at is null`,
        defaultOrderBy: 'b.created_at desc',
      };
    case 'purchaseOrders':
      return {
        body: `select po.id, po.po_no as "poNo", v.name as vendor, po.vendor_id as "vendorId", po.status,
                      po.expected_date as "expectedDate", po.ordered_at as "orderedAt", po.received_at as "receivedAt",
                      po.cancelled_at as "cancelledAt", po.total, po.prepayment_amount as "prepaymentAmount",
                      coalesce((select sum(vp.amount) from vendor_payments vp where vp.purchase_order_id = po.id and vp.status = 'posted'), 0) as "prepaidAmount",
                      greatest(0, po.prepayment_amount - coalesce((select sum(vp.amount) from vendor_payments vp where vp.purchase_order_id = po.id and vp.status = 'posted'), 0)) as "remainingPrepay",
                      count(pol.id)::int as lines,
                      coalesce(sum(pol.qty), 0) as "orderedQty", coalesce(sum(pol.received_qty), 0) as "receivedQty",
                      po.buyer_notes as "buyerNotes", po.internal_notes as "internalNotes", po.created_at as "createdAt"
               from purchase_orders po
               left join vendors v on v.id = po.vendor_id
               left join purchase_order_lines pol on pol.purchase_order_id = po.id
               group by po.id, v.name`,
        defaultOrderBy: `case po.status when 'draft' then 0 when 'approved' then 1 when 'partially_received' then 2 when 'received' then 3 else 4 end,
                         po.created_at desc`,
      };
    case 'sales':
      return {
        body: `select so.id, so.order_no as "orderNo", c.name as customer, so.customer_id as "customerId", so.status,
                      so.pricing_strategy as "pricingStrategy", so.total, so.internal_margin as "internalMargin",
                      count(sol.id)::int as lines, so.delivery_window as "deliveryWindow", so.notes,
                      bool_or(coalesce(sol.packed, false)) as packed,
                      bool_or(coalesce(sol.inventory_posted, false)) as "inventoryPosted",
                      bool_or(coalesce(sol.payment_followup, false)) as "paymentFollowup",
                      string_agg(distinct sol.legacy_status_marker, ', ') filter (where sol.legacy_status_marker is not null) as "legacyStatusMarkers",
                      so.validation_issues as "validationIssues", so.created_at as "createdAt"
               from sales_orders so
               left join customers c on c.id = so.customer_id
               left join sales_order_lines sol on sol.order_id = so.id
               group by so.id, c.name`,
        defaultOrderBy: 'so.created_at desc',
      };
    case 'matchmaking':
      return {
        body: `select mm.id, mm.customer_need_id as "customerNeedId", cn.need_code as "needCode",
                      cn.customer_id as "customerId", c.name as customer, cn.product_name as "needProduct",
                      cn.category, cn.tags as "needTags", cn.qty_min as "qtyMin", cn.qty_max as "qtyMax",
                      cn.target_price as "targetPrice", cn.needed_by as "neededBy", cn.urgency,
                      mm.vendor_supply_id as "vendorSupplyId", vs.supply_code as "supplyCode",
                      vs.vendor_id as "vendorId", v.name as vendor, vs.product_name as "vendorProduct",
                      vs.tags as "supplyTags", vs.available_qty as "availableQty", vs.asking_price as "askingPrice",
                      vs.available_date as "availableDate", vs.location, mm.score, mm.reasons, mm.status,
                      mm.created_at as "createdAt", mm.updated_at as "updatedAt"
               from matchmaking_matches mm
               join customer_needs cn on cn.id = mm.customer_need_id
               join vendor_supply vs on vs.id = mm.vendor_supply_id
               left join customers c on c.id = cn.customer_id
               left join vendors v on v.id = vs.vendor_id`,
        defaultOrderBy: `case mm.status when 'open' then 0 when 'accepted' then 1 when 'dismissed' then 2 else 3 end,
                         mm.score desc, mm.updated_at desc`,
      };
    case 'orders':
      return {
        body: `select so.id, so.order_no as "orderNo", c.name as customer, so.status, so.total, so.delivery_window as "deliveryWindow", so.notes,
                      so.packed, so.inventory_posted as "inventoryPosted", so.payment_followup as "paymentFollowup",
                      so.legacy_status_markers as "legacyStatusMarkers", so.validation_issues as "validationIssues",
                      i.id as "invoiceId", i.invoice_no as "invoiceNo", i.status as "invoiceStatus", so.posted_at as "postedAt", so.fulfilled_at as "fulfilledAt",
                      (select d.id from invoice_disputes d where d.invoice_id = i.id and d.status = 'open' limit 1) as "openDisputeId",
                      (select string_agg(distinct so2.order_no, ', ')
                         from sales_order_lines sol
                         join sales_order_lines sol2
                           on coalesce(sol2.source_row_key, sol2.batch_id::text) = coalesce(sol.source_row_key, sol.batch_id::text)
                          and sol2.order_id <> sol.order_id
                         join sales_orders so2 on so2.id = sol2.order_id
                        where sol.order_id = so.id
                          and coalesce(sol.source_row_key, sol.batch_id::text) is not null
                          and so2.status in ('draft', 'confirmed')) as "crossOrderSourceOrders"
               from sales_orders so
               left join customers c on c.id = so.customer_id
               left join invoices i on i.order_id = so.id`,
        defaultOrderBy: 'so.created_at desc',
      };
    case 'payments':
      return {
        body: `select p.id, c.name as customer, p.customer_id as "customerId", p.direction, p.category, p.method, p.amount, p.unapplied_amount as "unappliedAmount",
                      p.allocation_intent as "allocationIntent", p.impact_preview as "impactPreview",
                      p.reference, p.location_bucket as "locationBucket", p.notes, p.status, p.created_at as "createdAt"
               from payments p left join customers c on c.id = p.customer_id`,
        defaultOrderBy: 'p.created_at desc',
      };
    case 'inventory':
      return {
        body: `select b.id, b.batch_code as "batchCode", b.name, b.category, b.subcategory, v.name as vendor, b.vendor_id as "vendorId",
                      b.item_id as "itemId", i.alias as "itemAlias",
                      coalesce(i.alias, b.name) as "displayName",
                      b.available_qty as "availableQty",
                      b.reserved_qty as "reservedQty", b.uom, b.unit_cost as "unitCost", b.unit_price as "unitPrice",
                      b.price_range as "priceRange",
                      b.tags, b.location, b.ownership_status as "ownershipStatus", b.legacy_marker as "legacyMarker",
                      b.arrival_status as "arrivalStatus", b.media_status as "mediaStatus", b.status, b.lot_code as "lotCode", b.expiration_date as "expirationDate",
                      floor(extract(epoch from (now() - coalesce(b.intake_date, b.created_at))) / 86400)::int as "ageDays"
               from batches b
               left join vendors v on v.id = b.vendor_id
               left join items i on i.id = b.item_id
               where b.archived_at is null`,
        defaultOrderBy: 'b.category, b.name',
      };
    case 'clients':
      return {
        body: `select c.id, c.name, c.credit_limit as "creditLimit", c.balance, c.tags, c.notes,
                      c.contact_id AS "contactId",
                      c.credit_limit - c.balance as "headroom",
                      count(i.id)::int as "invoiceCount",
                      count(case when i.status in ('open','partial') then 1 end)::int as "openInvoiceCount",
                      coalesce(round(dp."avgDaysToPay"::numeric, 1), null) as "avgDaysToPay",
                      coalesce(floor(extract(epoch from (now() - min(case when i.status in ('open','partial') then i.due_date end))) / 86400)::int, 0) as "daysPastDue",
                      coalesce(sum(case when i.status in ('open','partial') then i.total - i.amount_paid end), 0) as "unpaidBalance",
                      (c.contact_id is not null and vdr.id is not null) as "isDualRole"
               from customers c
               left join invoices i on i.customer_id = c.id
               left join lateral (
                 select avg(extract(epoch from (p.created_at - invp.created_at)) / 86400) as "avgDaysToPay"
                 from payment_allocations pa
                 join payments p on p.id = pa.payment_id and p.status not in ('reversed', 'refunded')
                 join invoices invp on invp.id = pa.invoice_id
                 where invp.customer_id = c.id
               ) dp on true
               left join lateral (
                 select id from vendors where contact_id = c.contact_id limit 1
               ) vdr on c.contact_id is not null
               group by c.id, dp."avgDaysToPay", vdr.id`,
        defaultOrderBy: 'c.balance desc, c.name',
      };
    case 'vendors':
      return {
        body: `select vb.id, v.name as vendor, vb.vendor_id as "vendorId", vb.bill_no as "billNo", po.po_no as "poNo", vb.purchase_order_id as "purchaseOrderId",
                      vb.amount, vb.amount_paid as "amountPaid", vb.status, vb.due_date as "dueDate", vb.scheduled_for as "scheduledFor",
                      vb.due_reason as "dueReason", vb.consignment_triggered as "consignmentTriggered",
                      v.contact_id AS "contactId",
                      pr.id AS "receiptId", pr.receipt_no AS "receiptNo",
                      (v.contact_id is not null and cust.id is not null) as "isDualRole"
               from vendor_bills vb
               left join vendors v on v.id = vb.vendor_id
               left join purchase_orders po on po.id = vb.purchase_order_id
               left join lateral (
                 select id, receipt_no
                 from purchase_receipts
                 where purchase_order_id = vb.purchase_order_id
                 order by created_at
                 limit 1
               ) pr on vb.purchase_order_id is not null
               left join lateral (
                 select id from customers where contact_id = v.contact_id limit 1
               ) cust on v.contact_id is not null`,
        defaultOrderBy: 'vb.due_date, v.name',
      };
    case 'fulfillment':
      return {
        body: `select pl.id, pl.order_id as "orderId", pl.pick_no as "pickNo", so.order_no as "orderNo", c.name as customer, pl.status,
                      pl.units_per_bag as "unitsPerBag", pl.label_format as "labelFormat", pl.labels_printed as "labelsPrinted",
                      pl.manifest_path as "manifestPath", pl.tracking, count(fl.id)::int as lines,
                      coalesce(sum(jsonb_array_length(fl.warehouse_alerts)), 0)::int as "alertCount"
               from pick_lists pl
               join sales_orders so on so.id = pl.order_id
               left join customers c on c.id = so.customer_id
               left join fulfillment_lines fl on fl.pick_list_id = pl.id
               group by pl.id, so.order_no, c.name`,
        defaultOrderBy: 'pl.created_at desc',
      };
    case 'connectors':
      return {
        body: `select cr.id, cr.source, cr.request_type as "requestType", c.name as customer, cr.customer_id as "customerId", cr.status, cr.routed_to as "routedTo",
                      cr.operator_notes as "operatorNotes", cr.safety_note as "safetyNote", cr.payload, cr.review_history as "reviewHistory", cr.created_at as "createdAt"
               from connector_requests cr left join customers c on c.id = cr.customer_id`,
        defaultOrderBy: 'cr.created_at desc',
      };
    case 'recovery':
      return {
        body: `select id, command_name as "commandName", actor_name as "actorName", status, error, affected_ids as "affectedIds",
                      input_payload as "inputPayload", reversed_by_command_id as "reversedByCommandId", created_at as "createdAt"
               from command_journal`,
        defaultOrderBy: 'created_at desc',
      };
    case 'closeout':
      return {
        body: `select id, period, status, control_totals as "controlTotals", csv_path as "csvPath", jsonl_path as "jsonlPath", pdf_path as "pdfPath", created_at as "createdAt"
               from archive_runs`,
        defaultOrderBy: 'created_at desc',
      };
    case 'referees':
      return {
        body: `select r.id, r.name, r.email, r.phone, r.balance, r.lifetime_earned as "lifetimeEarned",
                      r.payment_method as "paymentMethod", r.payment_details as "paymentDetails",
                      r.notes, r.active, r.created_at as "createdAt",
                      r.contact_id AS "contactId",
                      count(distinct rr.id)::int as "relationshipsCount"
               from referees r
               left join referee_relationships rr on rr.referee_id = r.id and rr.active = true
               group by r.id`,
        defaultOrderBy: 'r.created_at desc',
      };
    case 'processors':
      return {
        body: `select p.id, p.name, p.processor_type as "processorType", p.fee_type as "feeType",
                      p.fee_percentage as "feePercentage", p.fee_fixed_amount as "feeFixedAmount",
                      p.default_user_split as "defaultUserSplit", p.default_processor_split as "defaultProcessorSplit",
                      p.notes, p.active, p.created_at as "createdAt",
                      p.contact_id AS "contactId",
                      coalesce(sum(pf.processing_fee_total), 0) as "totalFeesProcessed",
                      coalesce(sum(case when pf.user_fee_status = 'collectible' then pf.user_fee_share else 0 end), 0) as "userFeesCollectible",
                      coalesce(sum(case when pf.user_fee_status = 'collected' then pf.user_fee_share else 0 end), 0) as "userFeesCollected",
                      coalesce(sum(case when pf.processor_fee_status = 'unpaid' then pf.processor_fee_share else 0 end), 0) as "processorFeesUnpaid",
                      count(pf.id)::int as "relationshipsCount"
               from payment_processors p
               left join processor_fees pf on pf.processor_id = p.id
               group by p.id`,
        defaultOrderBy: 'p.name',
      };
    case 'photography':
      return {
        body: `select
                 b.id,
                 b.id as "batchId",
                 b.batch_code as "batchCode",
                 b.name,
                 b.media_status as "mediaStatus",
                 bms.media_updated_at as "mediaUpdatedAt",
                 bms.published_media_count as "publishedMediaCount",
                 bms.draft_media_count as "draftMediaCount",
                 bms.has_primary_photo as "hasPrimaryPhoto",
                 bms.has_primary_video as "hasPrimaryVideo",
                 b.created_at as "createdAt"
               from batches b
               left join batch_media_summary bms on bms.batch_id = b.id
               where b.archived_at is null`,
        defaultOrderBy: `case when bms.has_primary_photo then 1 else 0 end asc,
                         bms.media_updated_at asc nulls first,
                         b.created_at asc`,
      };
    case 'purchaseReceipts':
      return {
        body: `select pr.id, pr.receipt_no as "receiptNo", v.name as vendor, pr.vendor_id as "vendorId",
                      po.po_no as "poNo", pr.purchase_order_id as "purchaseOrderId",
                      pr.total, pr.status, pr.created_at as "createdAt",
                      count(prl.id)::int as lines
               from purchase_receipts pr
               left join vendors v on v.id = pr.vendor_id
               left join purchase_orders po on po.id = pr.purchase_order_id
               left join purchase_receipt_lines prl on prl.receipt_id = pr.id
               group by pr.id, v.name, po.po_no`,
        defaultOrderBy: 'pr.created_at desc',
      };
    case 'items':
      return {
        body: `select i.id, i.sku, i.name, i.alias, i.category, i.tags,
                      i.pricing_rule as "pricingRule", i.status,
                      i.description,
                      count(distinct b.id)::int as "batchCount",
                      coalesce(sum(b.available_qty), 0)::numeric(12,3) as "totalAvailableQty",
                      i.created_at as "createdAt", i.updated_at as "updatedAt"
               from items i
               left join batches b on b.item_id = i.id and b.archived_at is null
               group by i.id`,
        defaultOrderBy: 'i.name',
      };
    case 'disputes':
      return {
        body: `select d.id, d.invoice_id as "invoiceId", d.status, d.reason, d.resolution,
                      d.created_at as "createdAt", d.updated_at as "updatedAt",
                      i.invoice_no as "invoiceNo", i.total as "invoiceAmount", i.status as "invoiceStatus",
                      c.name as customer, c.id as "customerId"
               from invoice_disputes d
               join invoices i on i.id = d.invoice_id
               left join customers c on c.id = i.customer_id`,
        defaultOrderBy: 'd.created_at desc',
      };
  }
}

// ─── buildGridV2Query — composes the full SQL for the grid v2 procedure.
// Wraps the entity's base SQL in a subquery, injects `count(*) OVER ()` for
// pagination metadata, applies filter WHERE, sort ORDER BY, and LIMIT/OFFSET.
// @param startParam — the next available $n parameter index (after the caller's
//   own params, if any). Defaults to 1.
export function buildGridV2Query(
  entityType: z.infer<typeof viewSchema>,
  filtersInput: GridFilters | undefined,
  sortInput: GridSort | undefined,
  groupBy: string | undefined,
  limit: number | null,
  offset: number,
  startParam: number = 1,
): { sql: string; params: unknown[] } {
  const parts = gridSqlParts(entityType);

  // Compile filter conditions
  const whereResult = buildGridWhereClause(entityType, filtersInput);
  const filterParams = whereResult.params;
  const filterConditions = whereResult.conditions;

  // Build filter WHERE string with parameter offsets
  let p = startParam;
  const filterWhereParts: string[] = [];
  const finalParams: unknown[] = [];

  // Re-index filter conditions starting from startParam
  for (const cond of whereResult.conditions) {
    // Replace $1, $2, etc. with offset values
    const reindexed = cond.replace(/\$(\d+)/g, (_match, num) => {
      const newNum = parseInt(num, 10) + p - 1;
      return `$${newNum}`;
    });
    filterWhereParts.push(reindexed);
  }
  finalParams.push(...filterParams);
  p += filterParams.length;

  // Build ORDER BY
  let orderBy: string;
  if (sortInput) {
    orderBy = `${sortInput.field} ${sortInput.direction}`;
  } else if (groupBy) {
    orderBy = `${groupBy} asc, ${parts.defaultOrderBy}`;
  } else {
    orderBy = parts.defaultOrderBy;
  }

  // Build GROUP BY
  let groupByClause = '';
  let selectExtra = '';

  if (groupBy) {
    groupByClause = `group by "${groupBy}"`;
    selectExtra = `, count(*) as "_groupCount"`;
  }

  // Compose the final SQL
  // Strategy: wrap base SQL in a subquery, add count(*) OVER () for totalRows,
  // then apply user filters, sort, pagination on the outer query.
  const innerSql = parts.body;
  const filterWhere = filterWhereParts.length > 0
    ? `where ${filterWhereParts.join(' AND ')}`
    : '';

  const limitClause = limit !== null && limit > 0
    ? `limit $${p++}`
    : '';
  if (limit !== null && limit > 0) {
    finalParams.push(limit);
  }

  const offsetClause = offset > 0
    ? `offset $${p++}`
    : '';
  if (offset > 0) {
    finalParams.push(offset);
  }

  // For groupBy: we use a CTE approach
  if (groupBy) {
    const sql = `
with grouped_data as (
  ${innerSql}
),
group_counts as (
  select "${groupBy}" as "_groupKey", count(*)::int as "_groupCount"
  from grouped_data
  group by "${groupBy}"
)
select *, count(*) over () as "__totalRows"
from grouped_data
${filterWhere}
order by ${orderBy}
${limitClause}
${offsetClause}`;
    return { sql, params: finalParams };
  }

  // Standard subquery wrapper
  const sql = `
select *, count(*) over () as "__totalRows"
from (
  ${innerSql}
) sub
${filterWhere}
order by ${orderBy}
${limitClause}
${offsetClause}`;
  return { sql, params: finalParams };
}

function customerNeedsSql() {
  return `select cn.id, cn.need_code as "needCode", cn.customer_id as "customerId", c.name as customer,
                 cn.product_name as "productName", cn.category, cn.tags, cn.qty_min as "qtyMin", cn.qty_max as "qtyMax",
                 cn.target_price as "targetPrice", cn.needed_by as "neededBy", cn.urgency, cn.notes, cn.status,
                 cn.created_at as "createdAt", cn.updated_at as "updatedAt"
          from customer_needs cn
          left join customers c on c.id = cn.customer_id
          order by case cn.status when 'open' then 0 when 'matched' then 1 when 'accepted' then 2 when 'dismissed' then 3 else 4 end,
                   cn.updated_at desc`;
}

function vendorSupplySql() {
  return `select vs.id, vs.supply_code as "supplyCode", vs.vendor_id as "vendorId", v.name as vendor,
                 vs.product_name as "productName", vs.category, vs.tags, vs.available_qty as "availableQty",
                 vs.asking_price as "askingPrice", vs.available_date as "availableDate", vs.location, vs.grade,
                 vs.terms, vs.notes, vs.status, vs.created_at as "createdAt", vs.updated_at as "updatedAt"
          from vendor_supply vs
          left join vendors v on v.id = vs.vendor_id
          order by case vs.status when 'open' then 0 when 'held_for_match' then 1 when 'accepted' then 2 when 'dismissed' then 3 else 4 end,
                   vs.updated_at desc`;
}

function matchmakingSql() {
  const parts = gridSqlParts('matchmaking');
  return parts.body + '\norder by ' + parts.defaultOrderBy;
}

export function gridSql(view: z.infer<typeof viewSchema>) {
  const parts = gridSqlParts(view);
  if (view === 'recovery') {
    return parts.body + '\norder by ' + parts.defaultOrderBy + '\nlimit 100';
  }
  if (view === 'matchmaking') {
    return parts.body + '\norder by ' + parts.defaultOrderBy;
  }
  return parts.body + '\norder by ' + parts.defaultOrderBy;
}

function drilldownSql(metricKey: string) {
  switch (metricKey) {
    case 'payables':
      return gridSql('vendors');
    case 'receivables':
      return `select i.id, i.invoice_no as "invoiceNo", c.name as customer, i.total, i.amount_paid as "amountPaid", i.status, i.due_date as "dueDate"
              from invoices i left join customers c on c.id = i.customer_id where i.status in ('open','partial') order by i.due_date`;
    case 'inventory_value':
    case 'aging_inventory':
    case 'matchmaking':
      return gridSql('matchmaking');
    case 'debt_leader':
      return gridSql('clients');
    case 'cash':
    default:
      return gridSql('payments');
  }
}

export function deterministicHeaders(view: z.infer<typeof viewSchema>) {
  const map: Record<z.infer<typeof viewSchema>, string[]> = {
    reports: ['id', 'label', 'value', 'definition', 'severity', 'createdAt'],
    intake: ['id', 'batchCode', 'poNo', 'purchaseOrderId', 'sourceCode', 'intakeDate', 'shorthand', 'legacyMarker', 'name', 'category', 'tags', 'vendor', 'ticketCost', 'priceRange', 'intakeQty', 'availableQty', 'uom', 'unitCost', 'unitPrice', 'location', 'lotCode', 'expirationDate', 'ownershipStatus', 'arrivalStatus', 'arrivalConfirmed', 'validationIssues', 'mediaStatus', 'notes', 'status'],
    purchaseOrders: ['id', 'poNo', 'vendor', 'status', 'expectedDate', 'orderedAt', 'receivedAt', 'total', 'lines', 'orderedQty', 'receivedQty', 'buyerNotes', 'internalNotes', 'createdAt'],
    sales: ['id', 'orderNo', 'customer', 'status', 'pricingStrategy', 'total', 'internalMargin', 'lines', 'packed', 'inventoryPosted', 'paymentFollowup', 'legacyStatusMarkers', 'deliveryWindow', 'notes'],
    matchmaking: ['id', 'needCode', 'customer', 'needProduct', 'category', 'needTags', 'qtyMin', 'qtyMax', 'targetPrice', 'neededBy', 'urgency', 'supplyCode', 'vendor', 'vendorProduct', 'supplyTags', 'availableQty', 'askingPrice', 'availableDate', 'score', 'reasons', 'status', 'createdAt'],
    orders: ['id', 'orderNo', 'customer', 'status', 'total', 'packed', 'inventoryPosted', 'paymentFollowup', 'legacyStatusMarkers', 'deliveryWindow', 'notes', 'invoiceNo', 'invoiceStatus', 'openDisputeId'],
    payments: ['id', 'customer', 'direction', 'category', 'method', 'amount', 'unappliedAmount', 'allocationIntent', 'impactPreview', 'reference', 'locationBucket', 'notes', 'status', 'createdAt'],
    inventory: ['id', 'batchCode', 'name', 'category', 'tags', 'vendor', 'availableQty', 'reservedQty', 'uom', 'unitCost', 'unitPrice', 'priceRange', 'location', 'ownershipStatus', 'legacyMarker', 'arrivalStatus', 'mediaStatus', 'lotCode', 'expirationDate', 'ageDays', 'status'],
    clients: ['id', 'name', 'creditLimit', 'balance', 'headroom', 'tags', 'notes', 'invoiceCount', 'openInvoiceCount', 'daysPastDue', 'unpaidBalance', 'avgDaysToPay'],
    vendors: ['id', 'vendor', 'billNo', 'poNo', 'purchaseOrderId', 'amount', 'amountPaid', 'status', 'dueDate', 'scheduledFor', 'dueReason', 'consignmentTriggered', 'receiptId', 'receiptNo'],
    fulfillment: ['id', 'pickNo', 'orderNo', 'customer', 'status', 'unitsPerBag', 'labelFormat', 'labelsPrinted', 'manifestPath', 'tracking', 'lines'],
    connectors: ['id', 'source', 'requestType', 'customer', 'status', 'operatorNotes', 'createdAt'],
    recovery: ['id', 'commandName', 'actorName', 'status', 'error', 'affectedIds', 'reversedByCommandId', 'createdAt'],
    closeout: ['id', 'period', 'status', 'controlTotals', 'csvPath', 'jsonlPath', 'pdfPath', 'createdAt'],
    referees: ['id', 'name', 'email', 'phone', 'balance', 'lifetimeEarned', 'paymentMethod', 'paymentDetails', 'notes', 'active', 'relationshipsCount', 'createdAt'],
    processors: ['id', 'name', 'processorType', 'feeType', 'feePercentage', 'feeFixedAmount', 'defaultUserSplit', 'defaultProcessorSplit', 'notes', 'active', 'totalFeesProcessed', 'userFeesCollectible', 'userFeesCollected', 'processorFeesUnpaid', 'relationshipsCount', 'createdAt'],
    photography: ['id', 'batchId', 'batchCode', 'name', 'mediaStatus', 'mediaUpdatedAt', 'publishedMediaCount', 'draftMediaCount', 'hasPrimaryPhoto', 'hasPrimaryVideo', 'createdAt'],
    purchaseReceipts: ['id', 'receiptNo', 'vendor', 'poNo', 'purchaseOrderId', 'total', 'status', 'lines', 'createdAt'],
    items: ['id', 'sku', 'name', 'alias', 'category', 'tags', 'pricingRule', 'status', 'description', 'batchCount', 'totalAvailableQty', 'createdAt', 'updatedAt'],
    disputes: ['id', 'invoiceId', 'invoiceNo', 'customer', 'customerId', 'invoiceAmount', 'invoiceStatus', 'status', 'reason', 'resolution', 'createdAt', 'updatedAt'],
  };
  return map[view];
}
