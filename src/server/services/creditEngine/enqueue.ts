import type { Pool, PoolClient } from 'pg';

export type TriggerSource =
  | 'event:postSalesOrder' | 'event:confirmSalesOrder'
  | 'event:recordPayment' | 'event:allocatePayment'
  | 'event:postLedgerRow' | 'event:voidInvoice'
  | 'event:reverseSalesOrder' | 'event:disputeInvoice'
  | 'event:resolveDispute' | 'event:setEngineMax'
  | 'event:setStance' | 'event:stanceEdited'
  | 'nightly' | 'manualTrigger' | 'shadowMode' | 'bulkRevert' | 'reconciliation';

/**
 * Enqueue a customer for credit-engine recompute. Idempotent at the pending-row
 * level via the `credit_recompute_queue_pending_unique` partial index — at most
 * one pending row per customer. Use ON CONFLICT DO NOTHING so duplicate enqueues
 * (common from multiple events firing on the same customer in flight) collapse.
 *
 * Callers normally pass a transaction client so the enqueue rolls back with the
 * triggering command if it fails. The Pool overload exists for tests and the
 * nightly bulk path.
 *
 * Implementation note: commandBus passes Drizzle ORM transaction objects (NodePgTransaction),
 * which wrap a raw pg.PoolClient at `tx.session.client`. Drizzle's own `tx.query` property
 * is a relational query-builder object, NOT the pg Pool.query() function. We unwrap to the
 * raw PoolClient so the INSERT uses the same connection as the surrounding transaction
 * (i.e., the enqueue stays transactional and rolls back with the command if it fails).
 */
export async function enqueueCustomerRecompute(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: Pool | PoolClient | any,
  customerId: string,
  source: TriggerSource,
  commandId: string | null
): Promise<void> {
  // Unwrap Drizzle ORM transaction objects: NodePgTransaction stores the
  // underlying pg.PoolClient at client.session.client (inherited from PgDatabase).
  // Plain Pool / PoolClient callers have no .session, so the nullish fallback
  // keeps the existing behaviour for those paths.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const pgClient: Pool | PoolClient = (client as any)?.session?.client ?? (client as Pool | PoolClient);
  await pgClient.query(
    `INSERT INTO credit_recompute_queue (customer_id, enqueued_by, command_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (customer_id) WHERE status = 'pending' DO NOTHING`,
    [customerId, source, commandId]
  );
}

export interface EnqueueAllOptions {
  stanceId?: string | null;
  skipEngineDisabled?: boolean;
}

/**
 * Bulk-enqueue every customer (or filtered subset). Uses INSERT ... SELECT with
 * ON CONFLICT DO NOTHING to collapse duplicates against the pending-unique index.
 * Returns the number of rows actually inserted (not the input count).
 */
export async function enqueueAllCustomers(
  client: Pool | PoolClient,
  source: TriggerSource,
  options: EnqueueAllOptions = {}
): Promise<{ enqueued: number }> {
  const filters: string[] = [];
  const params: (string | null)[] = [source];
  if (options.stanceId !== undefined) {
    filters.push(`stance_id IS NOT DISTINCT FROM $${params.length + 1}`);
    params.push(options.stanceId);
  }
  if (options.skipEngineDisabled) {
    filters.push(`engine_disabled_at IS NULL`);
  }
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const { rowCount } = await client.query(
    `INSERT INTO credit_recompute_queue (customer_id, enqueued_by, status)
     SELECT id, $1, 'pending' FROM customers ${whereClause}
     ON CONFLICT (customer_id) WHERE status = 'pending' DO NOTHING`,
    params
  );
  return { enqueued: rowCount ?? 0 };
}
