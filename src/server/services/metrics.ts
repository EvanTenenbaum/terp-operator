import { sql } from 'drizzle-orm';
import { db, pingDatabase, pool } from '../db';
import { batches, commandJournal, invoices, salesOrders, vendorBills } from '../schema';
import { checkJournalWritable } from './journal';
import type { DashboardData, HealthStatus, KpiMetric, Role } from '../../shared/types';
import { canRole } from '../rbac';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export async function getHealth(): Promise<HealthStatus> {
  const warnings: string[] = [];
  let database: HealthStatus['database'] = 'ok';
  let journal: HealthStatus['journal'] = 'ok';

  try {
    await pingDatabase();
  } catch {
    database = 'down';
    warnings.push('Database did not answer a health probe.');
  }

  try {
    await checkJournalWritable();
  } catch {
    journal = 'down';
    warnings.push('JSONL command journal is not writable.');
  }

  return {
    ok: database === 'ok' && journal === 'ok',
    database,
    journal,
    websocket: 'ok',
    checkedAt: new Date().toISOString(),
    warnings
  };
}

export async function getDashboardData(role: Role): Promise<DashboardData> {
  const cashRow = (await pool.query<{ cash: string }>("select coalesce(sum(amount), 0)::text as cash from payments where status = 'posted'")).rows[0];
  const receivablesRow = (
    await pool.query<{ receivables: string }>(
      "select coalesce(sum(total - amount_paid), 0)::text as receivables from invoices where status in ('open', 'partial')"
    )
  ).rows[0];
  const payablesRow = (
    await pool.query<{ payables: string }>(
      "select coalesce(sum(amount - amount_paid), 0)::text as payables from vendor_bills where status in ('open', 'approved', 'scheduled')"
    )
  ).rows[0];
  const inventoryRow = (
    await pool.query<{ inventory_value: string }>(
      "select coalesce(sum(available_qty * unit_cost), 0)::text as inventory_value from batches where status in ('posted', 'ready', 'draft')"
    )
  ).rows[0];
  const agingRow = (
    await pool.query<{ aging_count: string }>(
      "select count(*)::text as aging_count from batches where status = 'posted' and created_at < now() - interval '30 days' and available_qty > 0"
    )
  ).rows[0];
  const debtRow = (
    await pool.query<{ debt_name: string | null; debt: string | null }>(
      'select c.name as debt_name, c.balance::text as debt from customers c order by c.balance desc limit 1'
    )
  ).rows[0];
  const opportunityRow = (
    await pool.query<{ opportunities: string }>(
      "select count(*)::text as opportunities from matchmaking_matches where status = 'open'"
    )
  ).rows[0];
  const moneyBuckets = (
    await pool.query<{ bucket: string; amount: string }>(
      "select coalesce(location_bucket, 'unassigned') as bucket, coalesce(sum(amount), 0)::text as amount from payments where status = 'posted' group by coalesce(location_bucket, 'unassigned') order by bucket"
    )
  ).rows;

  const intakeReady = await db.select({ count: sql<number>`count(*)::int` }).from(batches).where(sql`${batches.status} = 'ready'`);
  const salesReady = await db.select({ count: sql<number>`count(*)::int` }).from(salesOrders).where(sql`${salesOrders.status} = 'confirmed'`);
  const paymentsReady = await db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(sql`${invoices.status} in ('open', 'partial')`);
  const recentActivity = await db
    .select({
      id: commandJournal.id,
      commandName: commandJournal.commandName,
      actorName: commandJournal.actorName,
      createdAt: commandJournal.createdAt,
      toast: sql<string | null>`${commandJournal.result}->>'toast'`
    })
    .from(commandJournal)
    .orderBy(sql`${commandJournal.createdAt} desc`)
    .limit(12);

  const metrics: KpiMetric[] = [
    {
      key: 'cash',
      label: 'Cash/files on hand',
      value: money.format(Number(cashRow?.cash ?? 0)),
      definition: 'Posted payments recorded in TERP Agro, net of reversals and refunds.',
      severity: 'good',
      minRole: 'manager'
    },
    {
      key: 'payables',
      label: 'Payables due/scheduled',
      value: money.format(Number(payablesRow?.payables ?? 0)),
      definition: 'Open, approved, or scheduled vendor bills not fully paid.',
      severity: Number(payablesRow?.payables ?? 0) > 50_000 ? 'watch' : 'neutral',
      minRole: 'manager'
    },
    {
      key: 'receivables',
      label: 'Receivables',
      value: money.format(Number(receivablesRow?.receivables ?? 0)),
      definition: 'Open customer invoice balances after allocations.',
      severity: Number(receivablesRow?.receivables ?? 0) > 40_000 ? 'watch' : 'neutral',
      minRole: 'manager'
    },
    {
      key: 'inventory_value',
      label: 'Inventory value',
      value: money.format(Number(inventoryRow?.inventory_value ?? 0)),
      definition: 'Available posted inventory valued at unit cost.',
      severity: 'neutral',
      minRole: 'manager'
    },
    {
      key: 'aging_inventory',
      label: 'Aging inventory',
      value: `${Number(agingRow?.aging_count ?? 0)} lots`,
      definition: 'Posted lots older than 30 days with quantity still available.',
      severity: Number(agingRow?.aging_count ?? 0) > 5 ? 'watch' : 'good'
    },
    {
      key: 'debt_leader',
      label: 'Debt leaderboard',
      value: debtRow?.debt_name ? `${debtRow.debt_name}: ${money.format(Number(debtRow.debt ?? 0))}` : 'No debt',
      definition: 'Customer with the highest current balance.',
      severity: Number(debtRow?.debt ?? 0) > 20_000 ? 'bad' : 'neutral',
      minRole: 'manager'
    },
    {
      key: 'matchmaking',
      label: 'Matchmaking',
      value: `${Number(opportunityRow?.opportunities ?? 0)} matches`,
      definition: 'Open deterministic matches between customer needs and vendor stock.',
      severity: 'good'
    }
  ];

  const visibleMetrics = metrics.filter(m => !m.minRole || canRole(role, m.minRole));

  return {
    metrics: visibleMetrics,
    pendingQueues: [
      { key: 'intake', label: 'Intake ready', count: intakeReady[0]?.count ?? 0 },
      { key: 'sales', label: 'Sales ready', count: salesReady[0]?.count ?? 0 },
      { key: 'payments', label: 'Payments ready', count: paymentsReady[0]?.count ?? 0 }
    ],
    recentActivity: recentActivity.map((activity) => ({
      ...activity,
      createdAt: activity.createdAt.toISOString()
    })),
    moneyBuckets: canRole(role, 'manager')
      ? moneyBuckets.map((bucket) => ({
          bucket: bucket.bucket,
          amount: bucket.amount,
          definition: 'Posted payment rows assigned to this cash/file bucket. Negative rows are buyer credits/down payments.'
        }))
      : [],
    health: await getHealth()
  };
}
