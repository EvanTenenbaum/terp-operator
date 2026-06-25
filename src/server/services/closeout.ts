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

  // Phase 4 §9: include barter settlements in the period control totals so
  // the closeout PDF/JSONL/CSV archive matches what an operator can reconcile.
  // Counts + signed totals stay in NUMERIC(12,2) on the SQL side to preserve
  // cents precision; we convert to JS Number once at the boundary. Tables
  // shipped in Phase 0 may not exist in legacy environments where 0085 hasn't
  // been applied — wrap the query so missing-relation errors degrade to zeros
  // instead of crashing closeout.
  let barterSettlementCount = 0;
  let barterInboundCount = 0;
  let barterOutboundCount = 0;
  let barterSettlementAmountTotal = 0;
  let barterGainLossTotal = 0;
  try {
    const barterRes = await db.execute(sql`
      select
        count(*)::int as count,
        coalesce(sum(case when direction = 'inbound' then 1 else 0 end), 0)::int as inbound,
        coalesce(sum(case when direction = 'outbound' then 1 else 0 end), 0)::int as outbound,
        coalesce(sum(settlement_amount), 0)::text as settlement_total,
        coalesce(sum(gain_loss), 0)::text as gain_loss_total
      from barter_settlements
      where to_char(created_at, 'YYYY-MM') = ${period}
    `);
    const row = barterRes.rows[0] as
      | { count?: number; inbound?: number; outbound?: number; settlement_total?: string; gain_loss_total?: string }
      | undefined;
    if (row) {
      barterSettlementCount = Number(row.count ?? 0);
      barterInboundCount = Number(row.inbound ?? 0);
      barterOutboundCount = Number(row.outbound ?? 0);
      barterSettlementAmountTotal = Number(row.settlement_total ?? 0);
      barterGainLossTotal = Number(row.gain_loss_total ?? 0);
    }
  } catch {
    // Pre-Phase-0 environments — barter tables absent. Counts stay at zero.
  }

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
      commands,
      // Phase 4 §9 — barter settlements participate in the period control
      // totals. The amount/gain-loss aggregates are signed dollar values; the
      // counts are integer settlement headers for inbound/outbound directions.
      barterSettlements: barterSettlementCount,
      barterSettlementsInbound: barterInboundCount,
      barterSettlementsOutbound: barterOutboundCount,
      barterSettlementAmountTotal,
      barterGainLossTotal
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
