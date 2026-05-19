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
 */
export async function enqueueCustomerRecompute(
  client: Pool | PoolClient,
  customerId: string,
  source: TriggerSource,
  commandId: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO credit_recompute_queue (customer_id, enqueued_by, command_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (customer_id) WHERE status = 'pending' DO NOTHING`,
    [customerId, source, commandId]
  );
}
