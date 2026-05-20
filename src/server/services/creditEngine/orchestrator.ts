import type { Pool } from 'pg';
import { enqueueAllCustomers, type TriggerSource } from './enqueue';
import { processOneRecompute } from './worker';

export interface RecomputeAllOptions {
  source: TriggerSource;
  stanceId?: string | null;
  skipEngineDisabled?: boolean;
  maxRows?: number; // safety cap; default 10_000
}

export interface RecomputeAllResult {
  enqueued: number;
  processed: number;
  failed: number;
  skipped: number;
}

/**
 * Bulk-enqueue then drain. Used by the nightly safety net and by bulkRevertCustomersToEngine.
 * Pulls pending rows for this customer set one at a time and processes them.
 * Returns aggregate counts; per-row errors are logged but don't stop the batch.
 */
export async function recomputeAllCustomers(
  pool: Pool,
  options: RecomputeAllOptions
): Promise<RecomputeAllResult> {
  const maxRows = options.maxRows ?? 10_000;
  const { enqueued } = await enqueueAllCustomers(pool, options.source, {
    stanceId: options.stanceId,
    skipEngineDisabled: options.skipEngineDisabled
  });

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < maxRows; i++) {
    const { rows } = await pool.query<{ id: string }>(`
      SELECT id FROM credit_recompute_queue
       WHERE status = 'pending'
       ORDER BY enqueued_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
    `);
    if (rows.length === 0) break;
    try {
      const result = await processOneRecompute(pool, rows[0].id);
      if (result.skipped) skipped++;
      else processed++;
    } catch {
      failed++;
      // err already captured to last_error by processOneRecompute's catch
    }
  }

  return { enqueued, processed, failed, skipped };
}
