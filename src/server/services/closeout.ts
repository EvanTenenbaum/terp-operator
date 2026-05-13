import type { Pool } from 'pg';

type Queryable = Pick<Pool, 'query'>;

export interface CloseoutBlocker {
  id: string;
  label: string;
  count: number;
}

export interface CloseoutSafety {
  period: string;
  locked: boolean;
  eligible: boolean;
  openWorkCount: number;
  unsafeRows: number;
  blockers: CloseoutBlocker[];
  controlTotals: Record<string, number>;
}

export async function getCloseoutSafety(db: Queryable, period: string): Promise<CloseoutSafety> {
  const [
    lock,
    unsafeBatches,
    unsafePurchaseOrders,
    openConnectors,
    openFulfillment,
    failedCommands,
    unresolvedDrafts,
    batches,
    purchaseOrders,
    purchaseReceipts,
    salesOrders,
    invoices,
    payments,
    vendorBills,
    connectorRequests,
    fulfillment,
    commands
  ] = await Promise.all([
    countRows(db, 'period_locks', period, 'period = $1'),
    countRows(db, 'batches', period, "to_char(created_at, 'YYYY-MM') = $1 and status in ('draft','needs_fix')"),
    countRows(db, 'purchase_orders', period, "to_char(created_at, 'YYYY-MM') = $1 and status in ('draft','approved','ordered','partially_received')"),
    countRows(db, 'connector_requests', period, "to_char(created_at, 'YYYY-MM') = $1 and status in ('open','pending_review','approved','accepted','routed','posting','failed')"),
    countRows(db, 'pick_lists', period, "to_char(created_at, 'YYYY-MM') = $1 and status in ('open','packed')"),
    countFailedUnretriedCommands(db, period),
    countRows(db, 'sales_orders', period, "to_char(created_at, 'YYYY-MM') = $1 and status = 'draft'"),
    countRows(db, 'batches', period),
    countRows(db, 'purchase_orders', period),
    countRows(db, 'purchase_receipts', period),
    countRows(db, 'sales_orders', period),
    countRows(db, 'invoices', period),
    countRows(db, 'payments', period),
    countRows(db, 'vendor_bills', period),
    countRows(db, 'connector_requests', period),
    countRows(db, 'pick_lists', period),
    countRows(db, 'command_journal', period)
  ]);

  const blockers = [
    { id: 'unsafeBatches', label: 'Intake rows still in progress', count: unsafeBatches },
    { id: 'unsafePurchaseOrders', label: 'Purchase orders still open', count: unsafePurchaseOrders },
    { id: 'openConnectors', label: 'Requests waiting for review', count: openConnectors },
    { id: 'openFulfillment', label: 'Fulfillment work still open', count: openFulfillment },
    { id: 'failedCommands', label: 'Actions needing review', count: failedCommands },
    { id: 'unresolvedDrafts', label: 'Draft sales orders still open', count: unresolvedDrafts }
  ].filter((blocker) => blocker.count > 0);

  const unsafeRows = blockers.reduce((sum, blocker) => sum + blocker.count, 0);
  return {
    period,
    locked: lock > 0,
    eligible: lock > 0 && unsafeRows === 0,
    openWorkCount: unsafeRows,
    unsafeRows,
    blockers,
    controlTotals: {
      batches,
      purchaseOrders,
      purchaseReceipts,
      salesOrders,
      invoices,
      payments,
      vendorBills,
      connectorRequests,
      fulfillment,
      commands
    }
  };
}

async function countRows(db: Queryable, table: string, period: string, where = "to_char(created_at, 'YYYY-MM') = $1") {
  const result = await db.query(`select count(*)::int as count from ${table} where ${where}`, [period]);
  return Number(result.rows[0]?.count ?? 0);
}

async function countFailedUnretriedCommands(db: Queryable, period: string) {
  const result = await db.query(
    `select count(*)::int as count
     from command_journal failed
     where to_char(failed.created_at, 'YYYY-MM') = $1
       and failed.status = 'failed'
       and not exists (
         select 1
         from command_journal retry
         where retry.status = 'ok'
           and retry.command_name = failed.command_name
           and retry.input_payload = failed.input_payload
           and retry.created_at > failed.created_at
       )`,
    [period]
  );
  return Number(result.rows[0]?.count ?? 0);
}
