import type { Pool, PoolClient, QueryResult } from 'pg';

export type TriggerSource =
  | 'event:postSalesOrder' | 'event:confirmSalesOrder'
  | 'event:recordPayment' | 'event:allocatePayment'
  | 'event:postLedgerRow' | 'event:voidInvoice'
  | 'event:reverseSalesOrder' | 'event:disputeInvoice'
  | 'event:resolveDispute' | 'event:rejectDispute' | 'event:setEngineMax'
  | 'event:setStance' | 'event:stanceEdited'
  | 'event:settleDebtWithProduct'
  | 'event:payWithProduct'
  | 'nightly' | 'manualTrigger' | 'shadowMode' | 'bulkRevert' | 'reconciliation';

/**
 * Unwrap the raw pg PoolClient from a Pool, PoolClient, or Drizzle ORM
 * transaction object. Drizzle NodePgTransaction stores the underlying
 * PoolClient at `tx.session.client`. Plain Pool / PoolClient callers
 * are returned as-is. The cast is safe because the runtime check for
 * `session.client` guards the Drizzle path.
 */
function unwrapPgClient(
  client: Pool | PoolClient | object
): { query(queryText: string, values?: unknown[]): Promise<QueryResult> } {
  if (
    client !== null &&
    typeof client === 'object' &&
    'session' in client &&
    client.session !== null &&
    typeof client.session === 'object' &&
    'client' in client.session
  ) {
    return (client.session as Record<string, unknown>).client as unknown as { query(queryText: string, values?: unknown[]): Promise<QueryResult> };
  }
  return client as { query(queryText: string, values?: unknown[]): Promise<QueryResult> };
}

/**
 * Enqueue a customer for credit-engine recompute. Idempotent at the pending-row
 * level via the `credit_recompute_queue_pending_unique` partial index — at most
 * one pending row per customer. Use ON CONFLICT DO NOTHING so duplicate enqueues
 * (common from multiple events firing on the same customer in flight) collapse.
 *
 * Callers normally pass a transaction client so the enqueue rolls back with the
 * triggering command if it fails. The Pool overload exists for tests and the
 * nightly bulk path.
 */
export async function enqueueCustomerRecompute(
  client: Pool | PoolClient | object,
  customerId: string,
  source: TriggerSource,
  commandId: string | null
): Promise<void> {
  const pgClient = unwrapPgClient(client);
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
  client: Pool | PoolClient | object,
  source: TriggerSource,
  options: EnqueueAllOptions = {}
): Promise<{ enqueued: number }> {
  const pgClient = unwrapPgClient(client);
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
  const { rowCount } = await pgClient.query(
    `INSERT INTO credit_recompute_queue (customer_id, enqueued_by, status)
     SELECT id, $1, 'pending' FROM customers ${whereClause}
     ON CONFLICT (customer_id) WHERE status = 'pending' DO NOTHING`,
    params
  );
  return { enqueued: rowCount ?? 0 };
}
