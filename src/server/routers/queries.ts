import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { protectedProcedure, router } from '../trpc';
import { getDashboardData, getHealth } from '../services/metrics';
import { rowsToCsv } from '../services/csv';
import { getCloseoutSafety } from '../services/closeout';
import { commandLabels, commandMinRole, commandNames, internalOnlyCommandNames, reversalPolicies } from '../../shared/commandCatalog';
import { paymentProcessors, processorFees } from '../schema';

const viewSchema = z.enum(['reports', 'intake', 'purchaseOrders', 'sales', 'matchmaking', 'orders', 'payments', 'inventory', 'clients', 'vendors', 'fulfillment', 'connectors', 'recovery', 'closeout', 'referees', 'processors', 'photography']);

export const queriesRouter = router({
  dashboard: protectedProcedure.query(() => getDashboardData()),
  health: protectedProcedure.query(() => getHealth()),
  reference: protectedProcedure.query(async () => {
    const [customers, vendors, staff, transactionTypes, items, tags, invoices, batches, orders, purchaseOrders, backups, referees, refereeRelationships, processors, pricingDefaults] = await Promise.all([
      pool.query('select id, name, credit_limit as "creditLimit", balance, tags, pricing_rule as "pricingRule" from customers order by name'),
      pool.query('select id, name, terms_days as "termsDays", consignment_default as "consignmentDefault" from vendors order by name'),
      pool.query("select id, name, role from users where role in ('owner','manager','operator') and active order by name"),
      pool.query(`select id, slug, label, direction, allowed_entity_types as "allowedEntityTypes",
                         default_method as "defaultMethod", default_bucket as "defaultBucket",
                         default_allocation_intent as "defaultAllocationIntent",
                         requires_approval as "requiresApproval", is_system as "isSystem", is_active as "isActive"
                  from transaction_types
                  where is_active
                  order by is_system desc, direction, label`),
      pool.query('select id, sku, name, alias, category, tags from items order by name'),
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
                         b.created_at as "createdAt",
                         floor(extract(epoch from (now() - b.created_at)) / 86400)::int as "ageDays"
                  from batches b
                  left join vendors v on v.id = b.vendor_id
                  left join items i on i.id = b.item_id
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
      pool.query("select value from system_settings where key = 'pricing.defaults' limit 1")
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
      categories: ['Flower', 'Infused', 'Extract', 'Pre-roll', 'Vape'],
      priceBrackets: ['under-25', '25-100', '100-plus'],
      commands: commandNames
        .filter((name) => !(internalOnlyCommandNames as readonly string[]).includes(name))
        .map((name) => ({ name, label: commandLabels[name], minRole: commandMinRole[name] }))
    };
  }),
  grid: protectedProcedure.input(z.object({ view: viewSchema })).query(async ({ input }) => {
    return (await pool.query(gridSql(input.view))).rows;
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
  drilldown: protectedProcedure.input(z.object({ metricKey: z.string() })).query(async ({ input }) => {
    return (await pool.query(drilldownSql(input.metricKey))).rows;
  }),
  recoverySearch: protectedProcedure.input(z.object({ q: z.string().default('') })).query(async ({ input }) => {
    const q = `%${input.q.trim()}%`;
    return (
      await pool.query(
        `select id, command_name as "commandName", actor_name as "actorName", status, error, created_at as "createdAt", result,
                input_payload as "inputPayload", affected_ids as "affectedIds", reversed_by_command_id as "reversedByCommandId"
         from command_journal
         where $1 = '%%'
            or id::text ilike $1
            or command_name ilike $1
            or actor_name ilike $1
            or affected_ids::text ilike $1
         order by created_at desc
         limit 80`,
        [q]
      )
    ).rows;
  }),
  workQueue: protectedProcedure.query(async () => {
    return (
      await pool.query(
        `select * from (
           select b.id, 'intake' as route, 'Intake' as lane, b.name as title, b.status, b.created_at as "createdAt",
                  concat(coalesce(v.name, 'No vendor'), ' / ', b.intake_qty, ' ', b.uom) as detail
           from batches b left join vendors v on v.id = b.vendor_id
           where b.status in ('ready','needs_fix')
           union all
           select po.id, 'purchaseOrders' as route, 'Purchase' as lane, po.po_no as title, po.status, po.created_at as "createdAt",
                  concat(coalesce(v.name, 'No vendor'), ' / ', po.total) as detail
           from purchase_orders po left join vendors v on v.id = po.vendor_id
           where po.status in ('draft','approved','ordered','partially_received')
           union all
           select so.id, 'orders' as route, 'Sales' as lane, so.order_no as title, so.status, so.created_at as "createdAt",
                  concat(c.name, ' / ', so.total) as detail
           from sales_orders so left join customers c on c.id = so.customer_id
           where so.status in ('draft','confirmed')
           union all
           select i.id, 'payments' as route, 'Payments' as lane, i.invoice_no as title, i.status, i.created_at as "createdAt",
                  concat(c.name, ' / due ', i.total - i.amount_paid) as detail
           from invoices i left join customers c on c.id = i.customer_id
           where i.status in ('open','partial')
           union all
           select vb.id, 'vendors' as route, 'Vendor' as lane, vb.bill_no as title, vb.status, vb.created_at as "createdAt",
                  concat(v.name, ' / due ', vb.amount - vb.amount_paid) as detail
           from vendor_bills vb left join vendors v on v.id = vb.vendor_id
           where vb.status in ('open','approved','scheduled','partial')
           union all
           select cr.id, 'connectors' as route, 'Connector' as lane, cr.source as title, cr.status, cr.created_at as "createdAt",
                  concat(cr.request_type, ' / ', coalesce(c.name, 'unassigned')) as detail
           from connector_requests cr left join customers c on c.id = cr.customer_id
           where cr.status = 'open'
           union all
           select pl.id, 'fulfillment' as route, 'Fulfillment' as lane, pl.pick_no as title, pl.status, pl.created_at as "createdAt",
                  concat(so.order_no, ' / ', count(fl.id), ' line(s)') as detail
           from pick_lists pl join sales_orders so on so.id = pl.order_id left join fulfillment_lines fl on fl.pick_list_id = pl.id
           where pl.status in ('open','packed')
           group by pl.id, so.order_no
         ) q
         order by "createdAt" desc
         limit 80`
      )
    ).rows;
  }),
  salesOrderLines: protectedProcedure.input(z.object({ orderId: z.string().uuid() })).query(async ({ input }) => {
    return (
      await pool.query(
        `select sol.id, sol.order_id as "orderId", sol.batch_id as "batchId", b.batch_code as "batchCode",
                sol.item_name as "itemName",
                coalesce(sol.display_name, i.alias, sol.item_name) as "displayName",
                i.alias as "itemAlias",
                sol.qty, sol.unit_price as "unitPrice", sol.unit_cost as "unitCost",
                sol.unit_cost_resolved as "unitCostResolved", sol.landed_cost_basis as "landedCostBasis",
                sol.source_row_key as "sourceRowKey", sol.unresolved_source_text as "unresolvedSourceText",
                sol.legacy_status_marker as "legacyStatusMarker", sol.packed, sol.inventory_posted as "inventoryPosted",
                sol.payment_followup as "paymentFollowup", sol.validation_issues as "validationIssues", sol.status,
                b.available_qty as "availableQty", b.legacy_marker as "legacyMarker", b.price_range as "priceRange",
                b.category as "batchCategory",
                b.media_status as "mediaStatus", v.name as vendor
         from sales_order_lines sol
         left join batches b on b.id = sol.batch_id
         left join items i on i.id = b.item_id
         left join vendors v on v.id = b.vendor_id
         where sol.order_id = $1
         order by sol.created_at`,
        [input.orderId]
      )
    ).rows;
  }),
  purchaseOrderLines: protectedProcedure.input(z.object({ purchaseOrderId: z.string().uuid() })).query(async ({ input }) => {
    return (
      await pool.query(
        `select pol.id, pol.purchase_order_id as "purchaseOrderId", pol.item_id as "itemId",
                pol.product_name as "productName", pol.category, pol.tags, pol.qty, pol.received_qty as "receivedQty",
                pol.uom, pol.unit_cost as "unitCost", pol.unit_price as "unitPrice", pol.source_code as "sourceCode",
                pol.shorthand, pol.legacy_marker as "legacyMarker", pol.ownership_status as "ownershipStatus",
                pol.notes, pol.status, pol.created_at as "createdAt", i.sku
         from purchase_order_lines pol
         left join items i on i.id = pol.item_id
         where pol.purchase_order_id = $1
         order by pol.created_at`,
        [input.purchaseOrderId]
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
                so.validation_issues as "validationIssues", so.created_at as "createdAt"
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
  receiptPreview: protectedProcedure.input(z.object({ batchIds: z.array(z.string().uuid()).min(1) })).query(async ({ input }) => {
    const rows = (
      await pool.query(
        `select b.id, b.batch_code as "batchCode", b.name, b.vendor_id as "vendorId", v.name as vendor,
                b.intake_qty as "intakeQty", b.unit_cost as "unitCost", b.status, b.intake_date as "intakeDate",
                b.ownership_status as "ownershipStatus", b.legacy_marker as "legacyMarker",
                (b.intake_qty * b.unit_cost) as subtotal
         from batches b
         left join vendors v on v.id = b.vendor_id
         where b.id = any($1::uuid[])
         order by b.created_at`,
        [input.batchIds]
      )
    ).rows;
    const vendorIds = new Set(rows.map((row) => row.vendorId).filter(Boolean));
    const statuses = new Set(rows.map((row) => row.status));
    const total = rows.reduce((sum, row) => sum + Number(row.subtotal ?? 0), 0);
    const conflicts: string[] = [];
    if (rows.length !== input.batchIds.length) conflicts.push('One or more selected rows no longer exists.');
    if (vendorIds.size !== 1) conflicts.push('Selected rows must share one vendor.');
    if ([...statuses].some((status) => !['draft', 'ready'].includes(String(status)))) conflicts.push('Only Draft or Ready rows can be receipted.');
    for (const row of rows) {
      if (!row.vendorId) conflicts.push(`${row.name} needs a vendor.`);
      if (Number(row.intakeQty ?? 0) <= 0) conflicts.push(`${row.name} needs intake quantity above zero.`);
      if (Number(row.unitCost ?? 0) < 0) conflicts.push(`${row.name} cannot have negative cost.`);
    }
    return { rows, total: total.toFixed(2), conflicts, ok: conflicts.length === 0, vendor: rows[0]?.vendor ?? '' };
  }),
  relatedCommands: protectedProcedure.input(z.object({ entityId: z.string().uuid() })).query(async ({ input }) => {
    return (
      await pool.query(
        `select id, command_name as "commandName", actor_name as "actorName", actor_role as "actorRole",
                status, reason, error, affected_ids as "affectedIds", before_snapshot as "beforeSnapshot",
                after_snapshot as "afterSnapshot", result, reversed_by_command_id as "reversedByCommandId",
                created_at as "createdAt"
         from command_journal
         where $1 = any(affected_ids) or input_payload::text ilike $2
         order by created_at desc
         limit 25`,
        [input.entityId, `%${input.entityId}%`]
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
  globalSearch: protectedProcedure.input(z.object({ q: z.string().min(1) })).query(async ({ input }) => {
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
  batchMediaList: protectedProcedure.input(z.object({ batchId: z.string().uuid() })).query(async ({ input }) => {
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
    .input(z.object({ table: z.enum(['batches', 'customers', 'vendors', 'sales_orders', 'connector_requests']), find: z.string().min(1), replacement: z.string().default('') }))
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
        `select id, command_name as "commandName", status, affected_ids as "affectedIds", before_snapshot as "beforeSnapshot", after_snapshot as "afterSnapshot", reversed_by_command_id as "reversedByCommandId"
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
  csvExport: protectedProcedure.input(z.object({ view: viewSchema })).query(async ({ input }) => {
    const rows = (await pool.query(gridSql(input.view))).rows;
    const headers = deterministicHeaders(input.view);
    return { filename: `${input.view}.csv`, csv: rowsToCsv(rows, headers), headers };
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
    if (input.agingOnly) where.push("b.created_at < now() - interval '30 days'");
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
    })
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
  return `select mm.id, mm.customer_need_id as "customerNeedId", cn.need_code as "needCode",
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
          left join vendors v on v.id = vs.vendor_id
          order by case mm.status when 'open' then 0 when 'accepted' then 1 when 'dismissed' then 2 else 3 end,
                   mm.score desc, mm.updated_at desc`;
}

function gridSql(view: z.infer<typeof viewSchema>) {
  switch (view) {
    case 'reports':
      return `select key as id, label, value, definition, severity, checked_at as "createdAt"
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
              ) reports
              order by label`;
    case 'intake':
      return `select b.id, b.batch_code as "batchCode", b.shorthand, b.name, b.category, v.name as vendor, b.vendor_id as "vendorId",
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
              where b.archived_at is null
              order by b.created_at desc`;
    case 'purchaseOrders':
      return `select po.id, po.po_no as "poNo", v.name as vendor, po.vendor_id as "vendorId", po.status,
                     po.expected_date as "expectedDate", po.ordered_at as "orderedAt", po.received_at as "receivedAt",
                     po.cancelled_at as "cancelledAt", po.total, po.prepayment_amount as "prepaymentAmount",
                     count(pol.id)::int as lines,
                     coalesce(sum(pol.qty), 0) as "orderedQty", coalesce(sum(pol.received_qty), 0) as "receivedQty",
                     po.buyer_notes as "buyerNotes", po.internal_notes as "internalNotes", po.created_at as "createdAt"
              from purchase_orders po
              left join vendors v on v.id = po.vendor_id
              left join purchase_order_lines pol on pol.purchase_order_id = po.id
              group by po.id, v.name
              order by case po.status when 'draft' then 0 when 'approved' then 1 when 'partially_received' then 2 when 'received' then 3 else 4 end,
                       po.created_at desc`;
    case 'sales':
      return `select so.id, so.order_no as "orderNo", c.name as customer, so.customer_id as "customerId", so.status,
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
              group by so.id, c.name
              order by so.created_at desc`;
    case 'matchmaking':
      return matchmakingSql();
    case 'orders':
      return `select so.id, so.order_no as "orderNo", c.name as customer, so.status, so.total, so.delivery_window as "deliveryWindow", so.notes,
                     so.packed, so.inventory_posted as "inventoryPosted", so.payment_followup as "paymentFollowup",
                     so.legacy_status_markers as "legacyStatusMarkers", so.validation_issues as "validationIssues",
                     i.id as "invoiceId", i.invoice_no as "invoiceNo", i.status as "invoiceStatus", so.posted_at as "postedAt", so.fulfilled_at as "fulfilledAt"
              from sales_orders so
              left join customers c on c.id = so.customer_id
              left join invoices i on i.order_id = so.id
              order by so.created_at desc`;
    case 'payments':
      return `select p.id, c.name as customer, p.customer_id as "customerId", p.direction, p.category, p.method, p.amount, p.unapplied_amount as "unappliedAmount",
                     p.allocation_intent as "allocationIntent", p.impact_preview as "impactPreview",
                     p.reference, p.location_bucket as "locationBucket", p.notes, p.status, p.created_at as "createdAt"
              from payments p left join customers c on c.id = p.customer_id
              order by p.created_at desc`;
    case 'inventory':
      return `select b.id, b.batch_code as "batchCode", b.name, b.category, v.name as vendor, b.vendor_id as "vendorId",
                     b.item_id as "itemId", i.alias as "itemAlias",
                     coalesce(i.alias, b.name) as "displayName",
                     b.available_qty as "availableQty",
                     b.reserved_qty as "reservedQty", b.uom, b.unit_cost as "unitCost", b.unit_price as "unitPrice",
                     b.price_range as "priceRange",
                     b.tags, b.location, b.ownership_status as "ownershipStatus", b.legacy_marker as "legacyMarker",
                     b.arrival_status as "arrivalStatus", b.media_status as "mediaStatus", b.status, b.lot_code as "lotCode", b.expiration_date as "expirationDate",
                     floor(extract(epoch from (now() - b.created_at)) / 86400)::int as "ageDays"
              from batches b
              left join vendors v on v.id = b.vendor_id
              left join items i on i.id = b.item_id
              where b.archived_at is null
              order by b.category, b.name`;
    case 'clients':
      return `select c.id, c.name, c.credit_limit as "creditLimit", c.balance, c.tags, c.notes,
                     count(i.id)::int as "invoiceCount"
              from customers c left join invoices i on i.customer_id = c.id
              group by c.id
              order by c.balance desc, c.name`;
    case 'vendors':
      return `select vb.id, v.name as vendor, vb.vendor_id as "vendorId", vb.bill_no as "billNo", po.po_no as "poNo", vb.purchase_order_id as "purchaseOrderId",
                     vb.amount, vb.amount_paid as "amountPaid", vb.status, vb.due_date as "dueDate", vb.scheduled_for as "scheduledFor",
                     vb.due_reason as "dueReason", vb.consignment_triggered as "consignmentTriggered"
              from vendor_bills vb
              left join vendors v on v.id = vb.vendor_id
              left join purchase_orders po on po.id = vb.purchase_order_id
              order by vb.due_date, v.name`;
    case 'fulfillment':
      return `select pl.id, pl.order_id as "orderId", pl.pick_no as "pickNo", so.order_no as "orderNo", c.name as customer, pl.status,
                     pl.units_per_bag as "unitsPerBag", pl.label_format as "labelFormat", pl.labels_printed as "labelsPrinted",
                     pl.manifest_path as "manifestPath", pl.tracking, count(fl.id)::int as lines
              from pick_lists pl
              join sales_orders so on so.id = pl.order_id
              left join customers c on c.id = so.customer_id
              left join fulfillment_lines fl on fl.pick_list_id = pl.id
              group by pl.id, so.order_no, c.name
              order by pl.created_at desc`;
    case 'connectors':
      return `select cr.id, cr.source, cr.request_type as "requestType", c.name as customer, cr.customer_id as "customerId", cr.status, cr.routed_to as "routedTo",
                     cr.operator_notes as "operatorNotes", cr.safety_note as "safetyNote", cr.payload, cr.review_history as "reviewHistory", cr.created_at as "createdAt"
              from connector_requests cr left join customers c on c.id = cr.customer_id
              order by cr.created_at desc`;
    case 'recovery':
      return `select id, command_name as "commandName", actor_name as "actorName", status, error, affected_ids as "affectedIds",
                     input_payload as "inputPayload", reversed_by_command_id as "reversedByCommandId", created_at as "createdAt"
              from command_journal order by created_at desc limit 100`;
    case 'closeout':
      return `select id, period, status, control_totals as "controlTotals", csv_path as "csvPath", jsonl_path as "jsonlPath", pdf_path as "pdfPath", created_at as "createdAt"
              from archive_runs order by created_at desc`;
    case 'referees':
      return `select r.id, r.name, r.email, r.phone, r.balance, r.lifetime_earned as "lifetimeEarned",
                     r.payment_method as "paymentMethod", r.payment_details as "paymentDetails",
                     r.notes, r.active, r.created_at as "createdAt",
                     count(distinct rr.id)::int as "relationshipsCount"
              from referees r
              left join referee_relationships rr on rr.referee_id = r.id and rr.active = true
              group by r.id
              order by r.created_at desc`;
    case 'processors':
      return `select p.id, p.name, p.processor_type as "processorType", p.fee_type as "feeType",
                     p.fee_percentage as "feePercentage", p.fee_fixed_amount as "feeFixedAmount",
                     p.default_user_split as "defaultUserSplit", p.default_processor_split as "defaultProcessorSplit",
                     p.notes, p.active, p.created_at as "createdAt",
                     coalesce(sum(pf.processing_fee_total), 0) as "totalFeesProcessed",
                     coalesce(sum(case when pf.user_fee_status = 'collectible' then pf.user_fee_share else 0 end), 0) as "userFeesCollectible",
                     coalesce(sum(case when pf.user_fee_status = 'collected' then pf.user_fee_share else 0 end), 0) as "userFeesCollected",
                     coalesce(sum(case when pf.processor_fee_status = 'unpaid' then pf.processor_fee_share else 0 end), 0) as "processorFeesUnpaid",
                     count(pf.id)::int as "relationshipsCount"
              from payment_processors p
              left join processor_fees pf on pf.processor_id = p.id
              group by p.id
              order by p.name`;
    case 'photography':
      // Batches needing photos surface first (no primary photo, oldest first),
      // then batches that already have a primary photo trail behind. Uses the
      // batch_media_summary view (migration 0036) for aggregate counts.
      return `select
                b.id,
                b.id as "batchId",
                b.batch_code as "batchCode",
                b.name,
                bms.media_updated_at as "mediaUpdatedAt",
                bms.published_media_count as "publishedMediaCount",
                bms.draft_media_count as "draftMediaCount",
                bms.has_primary_photo as "hasPrimaryPhoto",
                bms.has_primary_video as "hasPrimaryVideo",
                b.created_at as "createdAt"
              from batches b
              left join batch_media_summary bms on bms.batch_id = b.id
              where b.archived_at is null
              order by
                case when bms.has_primary_photo then 1 else 0 end asc,
                bms.media_updated_at asc nulls first,
                b.created_at asc`;
  }
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

function deterministicHeaders(view: z.infer<typeof viewSchema>) {
  const map: Record<z.infer<typeof viewSchema>, string[]> = {
    reports: ['id', 'label', 'value', 'definition', 'severity', 'createdAt'],
    intake: ['id', 'batchCode', 'poNo', 'purchaseOrderId', 'sourceCode', 'intakeDate', 'shorthand', 'legacyMarker', 'name', 'category', 'tags', 'vendor', 'ticketCost', 'priceRange', 'intakeQty', 'availableQty', 'uom', 'unitCost', 'unitPrice', 'location', 'lotCode', 'expirationDate', 'ownershipStatus', 'arrivalStatus', 'arrivalConfirmed', 'validationIssues', 'mediaStatus', 'notes', 'status'],
    purchaseOrders: ['id', 'poNo', 'vendor', 'status', 'expectedDate', 'orderedAt', 'receivedAt', 'total', 'lines', 'orderedQty', 'receivedQty', 'buyerNotes', 'internalNotes', 'createdAt'],
    sales: ['id', 'orderNo', 'customer', 'status', 'pricingStrategy', 'total', 'internalMargin', 'lines', 'packed', 'inventoryPosted', 'paymentFollowup', 'legacyStatusMarkers', 'deliveryWindow', 'notes'],
    matchmaking: ['id', 'needCode', 'customer', 'needProduct', 'category', 'needTags', 'qtyMin', 'qtyMax', 'targetPrice', 'neededBy', 'urgency', 'supplyCode', 'vendor', 'vendorProduct', 'supplyTags', 'availableQty', 'askingPrice', 'availableDate', 'score', 'reasons', 'status', 'createdAt'],
    orders: ['id', 'orderNo', 'customer', 'status', 'total', 'packed', 'inventoryPosted', 'paymentFollowup', 'legacyStatusMarkers', 'deliveryWindow', 'notes', 'invoiceNo', 'invoiceStatus'],
    payments: ['id', 'customer', 'direction', 'category', 'method', 'amount', 'unappliedAmount', 'allocationIntent', 'impactPreview', 'reference', 'locationBucket', 'notes', 'status', 'createdAt'],
    inventory: ['id', 'batchCode', 'name', 'category', 'tags', 'vendor', 'availableQty', 'reservedQty', 'uom', 'unitCost', 'unitPrice', 'priceRange', 'location', 'ownershipStatus', 'legacyMarker', 'arrivalStatus', 'mediaStatus', 'lotCode', 'expirationDate', 'ageDays', 'status'],
    clients: ['id', 'name', 'creditLimit', 'balance', 'tags', 'notes', 'invoiceCount'],
    vendors: ['id', 'vendor', 'billNo', 'poNo', 'purchaseOrderId', 'amount', 'amountPaid', 'status', 'dueDate', 'scheduledFor', 'dueReason', 'consignmentTriggered'],
    fulfillment: ['id', 'pickNo', 'orderNo', 'customer', 'status', 'unitsPerBag', 'labelFormat', 'labelsPrinted', 'manifestPath', 'tracking', 'lines'],
    connectors: ['id', 'source', 'requestType', 'customer', 'status', 'operatorNotes', 'createdAt'],
    recovery: ['id', 'commandName', 'actorName', 'status', 'error', 'affectedIds', 'reversedByCommandId', 'createdAt'],
    closeout: ['id', 'period', 'status', 'controlTotals', 'csvPath', 'jsonlPath', 'pdfPath', 'createdAt'],
    referees: ['id', 'name', 'email', 'phone', 'balance', 'lifetimeEarned', 'paymentMethod', 'paymentDetails', 'notes', 'active', 'relationshipsCount', 'createdAt'],
    processors: ['id', 'name', 'processorType', 'feeType', 'feePercentage', 'feeFixedAmount', 'defaultUserSplit', 'defaultProcessorSplit', 'notes', 'active', 'totalFeesProcessed', 'userFeesCollectible', 'userFeesCollected', 'processorFeesUnpaid', 'relationshipsCount', 'createdAt'],
    photography: ['id', 'batchId', 'batchCode', 'name', 'mediaUpdatedAt', 'publishedMediaCount', 'draftMediaCount', 'hasPrimaryPhoto', 'hasPrimaryVideo', 'createdAt']
  };
  return map[view];
}
