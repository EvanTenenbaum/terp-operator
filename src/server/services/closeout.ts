import { sql, type SQL } from 'drizzle-orm';

type Queryable = {
  execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }>;
};

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
  const periodMatch = sql`to_char(created_at, 'YYYY-MM') = ${period}`;
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
    countQuery(db, sql`select count(*)::int as count from period_locks where period = ${period}`),
    countQuery(db, sql`select count(*)::int as count from batches where ${periodMatch} and status in ('draft','needs_fix')`),
    countQuery(
      db,
      sql`select count(*)::int as count from purchase_orders where ${periodMatch} and status in ('draft','approved','ordered','partially_received')`
    ),
    countQuery(
      db,
      sql`select count(*)::int as count from connector_requests where ${periodMatch} and status in ('open','pending_review','approved','accepted','routed','posting','failed')`
    ),
    countQuery(db, sql`select count(*)::int as count from pick_lists where ${periodMatch} and status in ('open','packed')`),
    countFailedUnretriedCommands(db, period),
    countQuery(db, sql`select count(*)::int as count from sales_orders where ${periodMatch} and status = 'draft'`),
    countQuery(db, sql`select count(*)::int as count from batches where ${periodMatch}`),
    countQuery(db, sql`select count(*)::int as count from purchase_orders where ${periodMatch}`),
    countQuery(db, sql`select count(*)::int as count from purchase_receipts where ${periodMatch}`),
    countQuery(db, sql`select count(*)::int as count from sales_orders where ${periodMatch}`),
    countQuery(db, sql`select count(*)::int as count from invoices where ${periodMatch}`),
    countQuery(db, sql`select count(*)::int as count from payments where ${periodMatch}`),
    countQuery(db, sql`select count(*)::int as count from vendor_bills where ${periodMatch}`),
    countQuery(db, sql`select count(*)::int as count from connector_requests where ${periodMatch}`),
    countQuery(db, sql`select count(*)::int as count from pick_lists where ${periodMatch}`),
    countQuery(db, sql`select count(*)::int as count from command_journal where ${periodMatch}`)
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

async function countQuery(db: Queryable, query: SQL) {
  const result = await db.execute(query);
  return Number((result.rows[0] as { count?: number | string | null } | undefined)?.count ?? 0);
}

async function countFailedUnretriedCommands(db: Queryable, period: string) {
  const result = await db.execute(sql`
    select count(*)::int as count
    from command_journal failed
    where to_char(failed.created_at, 'YYYY-MM') = ${period}
      and failed.status = 'failed'
      and not exists (
        select 1
        from command_journal retry
        where retry.status = 'ok'
          and retry.command_name = failed.command_name
          and retry.input_payload = failed.input_payload
          and retry.created_at > failed.created_at
      )
  `);
  return Number((result.rows[0] as { count?: number | string | null } | undefined)?.count ?? 0);
}
