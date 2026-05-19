import type { Pool } from 'pg';

const REAP_STALE_MINUTES = 10;

export interface ReapResult {
  reaped: number;
}

/**
 * Reset queue rows stuck in 'processing' for longer than the stale threshold
 * back to 'pending' so the next worker tick can retry them. Appends to last_error
 * for forensics. Safe to run concurrently — uses a single atomic UPDATE.
 */
export async function reapStaleProcessingRows(pool: Pool): Promise<ReapResult> {
  const { rowCount } = await pool.query(
    `UPDATE credit_recompute_queue
        SET status = 'pending',
            last_error = COALESCE(last_error, '') || ' [reaped from stale processing]'
      WHERE status = 'processing'
        AND last_attempted_at < now() - make_interval(mins => $1)`,
    [REAP_STALE_MINUTES]
  );
  return { reaped: rowCount ?? 0 };
}
