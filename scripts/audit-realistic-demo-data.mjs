import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : false
});

const expected = {
  days: Number(process.env.DEMO_DAYS || 100),
  monthlyRevenue: Number(process.env.DEMO_MONTHLY_REVENUE || 4_000_000),
  flowerShare: Number(process.env.DEMO_FLOWER_REVENUE_SHARE || 0.95),
  consignmentShare: Number(process.env.DEMO_CONSIGNED_FLOWER_PURCHASE_SHARE || 0.85),
  rangeShare: Number(process.env.DEMO_CONSIGNED_FLOWER_RANGE_SHARE || 0.5),
  whales: Number(process.env.DEMO_WHALE_CUSTOMERS || 8),
  smaller: Number(process.env.DEMO_SMALL_CUSTOMERS || 15),
  largeVendors: Number(process.env.DEMO_LARGE_VENDORS || 4),
  otherVendors: Number(process.env.DEMO_OTHER_VENDORS || 15),
  flowerAvgPrice: {
    outdoor: Number(process.env.DEMO_OUTDOOR_AVG_PRICE || 150),
    deps: Number(process.env.DEMO_DEPS_AVG_PRICE || 550),
    indoor: Number(process.env.DEMO_INDOOR_AVG_PRICE || 1100)
  }
};

try {
  const summary = await audit();
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await pool.end();
}

async function audit() {
  const [
    span,
    last30,
    allRevenue,
    flowerRevenue,
    flowerPurchases,
    flowerPrices,
    customers,
    vendors,
    credit,
    extras,
    rangeResolution,
    activeWork,
    coverage
  ] = await Promise.all([
    one(`select (max(created_at)::date - min(created_at)::date)::int as days from sales_orders`),
    one(`select coalesce(sum(total), 0)::numeric as revenue from invoices where created_at >= now() - interval '30 days'`),
    one(`select coalesce(sum(total), 0)::numeric as revenue from invoices`),
    one(`select coalesce(sum(sol.qty * sol.unit_price), 0)::numeric as revenue
         from sales_order_lines sol
         join batches b on b.id = sol.batch_id
         where b.category = 'Flower'`),
    one(`select
           coalesce(sum(intake_qty) filter (where category = 'Flower'), 0)::numeric as total_flower_qty,
           coalesce(sum(intake_qty) filter (where category = 'Flower' and ownership_status = 'C'), 0)::numeric as consigned_flower_qty,
           coalesce(sum(intake_qty) filter (where category = 'Flower' and ownership_status = 'C' and price_range is not null), 0)::numeric as ranged_consigned_qty
         from batches`),
    pool.query(`select
           case
             when b.tags @> array['outdoor']::text[] then 'outdoor'
             when b.tags @> array['mixed-light']::text[] then 'deps'
             when b.tags @> array['indoor']::text[] then 'indoor'
             else 'other'
           end as grade,
           coalesce(avg(sol.unit_price), 0)::numeric as avg_sale,
           count(*)::int as lines
         from sales_order_lines sol
         join batches b on b.id = sol.batch_id
         where b.category = 'Flower'
         group by 1`),
    one(`select
           count(*) filter (where tags @> array['whale']::text[])::int as whales,
           count(*) filter (where tags @> array['small']::text[])::int as smaller,
           count(*)::int as total
         from customers`),
    one(`select
           count(*) filter (where notes ilike '%large-vendor%')::int as large_vendors,
           count(*) filter (where notes ilike '%other-vendor%')::int as other_vendors,
           count(*)::int as total
         from vendors`),
    one(`select
           count(*) filter (where status in ('open','partial') and due_date < now())::int as overdue_invoices,
           count(*) filter (where status in ('open','partial'))::int as credit_invoices,
           count(*) filter (where amount_paid < total)::int as not_fully_paid
         from invoices`),
    one(`select
           (select count(*) from payments where direction = 'buyer_credit')::int as buyer_credits,
           (select count(*) from credit_overrides)::int as credit_overrides,
           (select count(*) from invoice_disputes)::int as disputes,
           (select count(*) from vendor_payments)::int as vendor_payments,
           (select count(*) from correction_journal_entries)::int as corrections,
           (select count(*) from connector_requests)::int as connectors,
           (select count(*) from matchmaking_matches)::int as matches`),
    one(`select count(*)::int as range_resolution_commands
         from command_journal
         where command_name = 'priceSalesOrder'
           and result::text ilike '%rangeResolutions%'`),
    one(`select
           (select count(*) from purchase_orders where status in ('draft', 'approved'))::int as open_purchase_orders,
           (select count(*) from batches where status in ('draft', 'ready'))::int as open_intake_rows,
           (select count(*) from sales_orders where status in ('draft', 'confirmed'))::int as open_sales_orders,
           (select count(*) from sales_order_lines where status in ('draft', 'ready'))::int as open_sales_lines,
           (select count(*) from payments where status in ('draft', 'ready'))::int as open_payment_rows,
           (select count(*) from pick_lists where status = 'open')::int as open_pick_lists,
           (select count(*) from connector_requests where status in ('open', 'approved'))::int as open_connector_requests,
           (select count(*) from backup_snapshots where snapshot->>'scenario' = 'realistic_100d')::int as scenario_markers`),
    one(`select
           (select count(*) from purchase_orders)::int as purchase_orders,
           (select count(*) from purchase_receipts)::int as purchase_receipts,
           (select count(*) from batches)::int as batches,
           (select count(*) from sales_orders)::int as sales_orders,
           (select count(*) from invoices)::int as invoices,
           (select count(*) from payments)::int as payments,
           (select count(*) from vendor_bills)::int as vendor_bills,
           (select count(*) from pick_lists)::int as pick_lists`)
  ]);

  const totalRevenue = Number(allRevenue.revenue);
  const flowerRev = Number(flowerRevenue.revenue);
  const flowerShare = totalRevenue ? flowerRev / totalRevenue : 0;
  const totalFlowerQty = Number(flowerPurchases.total_flower_qty);
  const consignmentShare = totalFlowerQty ? Number(flowerPurchases.consigned_flower_qty) / totalFlowerQty : 0;
  const rangeShare = Number(flowerPurchases.consigned_flower_qty) ? Number(flowerPurchases.ranged_consigned_qty) / Number(flowerPurchases.consigned_flower_qty) : 0;
  const flowerPriceRows = flowerPrices.rows;
  const flowerPriceByGrade = Object.fromEntries(flowerPriceRows.map((row) => [row.grade, { avgSale: Number(row.avg_sale), lines: Number(row.lines) }]));
  const failures = [];

  assertAtLeast(failures, 'history_days', Number(span.days), expected.days);
  assertBetween(failures, 'last_30_day_revenue', Number(last30.revenue), expected.monthlyRevenue * 0.75, expected.monthlyRevenue * 1.35);
  assertBetween(failures, 'flower_revenue_share', flowerShare, expected.flowerShare - 0.04, expected.flowerShare + 0.04);
  assertBetween(failures, 'consigned_flower_purchase_share', consignmentShare, expected.consignmentShare - 0.08, expected.consignmentShare + 0.08);
  assertBetween(failures, 'consigned_flower_range_share', rangeShare, expected.rangeShare - 0.12, expected.rangeShare + 0.12);
  for (const [grade, target] of Object.entries(expected.flowerAvgPrice)) {
    assertAtLeast(failures, `${grade}_flower_sale_lines`, flowerPriceByGrade[grade]?.lines ?? 0, 20);
    assertBetween(failures, `${grade}_avg_sale_price`, flowerPriceByGrade[grade]?.avgSale ?? 0, target * 0.9, target * 1.1);
  }
  assertAtLeast(failures, 'whale_customers', Number(customers.whales), expected.whales);
  assertAtLeast(failures, 'smaller_customers', Number(customers.smaller), expected.smaller);
  assertAtLeast(failures, 'large_vendors', Number(vendors.large_vendors), expected.largeVendors);
  assertAtLeast(failures, 'other_vendors', Number(vendors.other_vendors), expected.otherVendors);
  assertAtLeast(failures, 'open_credit_invoices', Number(credit.credit_invoices), 25);
  assertAtLeast(failures, 'overdue_invoices', Number(credit.overdue_invoices), 5);
  assertAtLeast(failures, 'buyer_credits', Number(extras.buyer_credits), 4);
  assertAtLeast(failures, 'credit_overrides', Number(extras.credit_overrides), 3);
  assertAtLeast(failures, 'invoice_disputes', Number(extras.disputes), 2);
  assertAtLeast(failures, 'vendor_payments', Number(extras.vendor_payments), 10);
  assertAtLeast(failures, 'range_resolution_commands', Number(rangeResolution.range_resolution_commands), 20);
  assertAtLeast(failures, 'open_purchase_orders', Number(activeWork.open_purchase_orders), 4);
  assertAtLeast(failures, 'open_intake_rows', Number(activeWork.open_intake_rows), 4);
  assertAtLeast(failures, 'open_sales_orders', Number(activeWork.open_sales_orders), 4);
  assertAtLeast(failures, 'open_sales_lines', Number(activeWork.open_sales_lines), 4);
  assertAtLeast(failures, 'open_payment_rows', Number(activeWork.open_payment_rows), 4);
  assertAtLeast(failures, 'open_pick_lists', Number(activeWork.open_pick_lists), 3);
  assertAtLeast(failures, 'open_connector_requests', Number(activeWork.open_connector_requests), 10);
  assertAtLeast(failures, 'realistic_scenario_marker', Number(activeWork.scenario_markers), 1);

  if (failures.length) {
    const error = new Error(`Realistic demo audit failed: ${failures.join('; ')}`);
    error.summary = { expected, span, last30, totalRevenue, flowerShare, consignmentShare, rangeShare, flowerPriceByGrade, customers, vendors, credit, extras, rangeResolution, activeWork, coverage };
    throw error;
  }

  return { ok: true, expected, span, last30, totalRevenue, flowerShare, consignmentShare, rangeShare, flowerPriceByGrade, customers, vendors, credit, extras, rangeResolution, activeWork, coverage };
}

async function one(sql) {
  return (await pool.query(sql)).rows[0];
}

function assertAtLeast(failures, key, actual, min) {
  if (actual < min) failures.push(`${key} expected >= ${min}, got ${actual}`);
}

function assertBetween(failures, key, actual, min, max) {
  if (actual < min || actual > max) failures.push(`${key} expected ${min}-${max}, got ${actual}`);
}
