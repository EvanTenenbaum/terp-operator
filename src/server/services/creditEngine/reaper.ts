import type { Pool } from 'pg';
import { creditEngineMetrics, logCreditEngineEvent } from './metrics';

const REAP_STALE_MINUTES = 10;

export interface ReapResult {
  reaped: number;
}

/**
 * Reset queue rows stuck in 'processing' for longer than the stale threshold
 * back to 'pending' so the next worker tick can retry them. Appends to last_error
 * for forensics. Safe to run concurrently — uses a single atomic UPDATE.
 *
 * Phase 7 observability (issue #68): each reaped row is counted as a
 * `credit_engine.worker_stalled` event so the alerts in
 * `docs/credit-engine-alerts.md` can detect stalled workers.
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
  const reaped = rowCount ?? 0;

  if (reaped > 0) {
    try {
      creditEngineMetrics.increment(
        'credit_engine.worker_stalled',
        { reason: 'stale_processing' },
        reaped
      );
      logCreditEngineEvent('credit_engine.worker_stalled', {
        reaped,
        stale_minutes_threshold: REAP_STALE_MINUTES
      });
    } catch {
      // Observability must never break the reaper.
    }
  }

  return { reaped };
}
