/**
 * EXT-REVIEW 2026-06 finding #4 — in-process background workers.
 *
 * The external review observed: "data in the Credit Review section is clearly
 * stuck. This suggests that workers or services have hung, or perhaps they are
 * missing or simply non-functional." The diagnosis was correct in the third
 * clause: the workers were MISSING. Commands enqueue rows into
 * `credit_recompute_queue`, and the cron entrypoints under `scripts/` exist,
 * but the deployed App Platform spec only ran the web service — nothing ever
 * drained the queue, ran the stuck-row reaper, ran the nightly audit, or ran
 * the customer-balance reconciliation. Queue rows accumulated in 'pending'
 * forever and the Credit Review surface displayed permanently stale data.
 *
 * This module starts those workers INSIDE the web process:
 *
 *   - queue drain      every CREDIT_DRAIN_INTERVAL_MS (default 15s), up to
 *                      DRAIN_BATCH_MAX rows per tick
 *   - stuck-row reaper every REAPER_INTERVAL_MS (default 5m)
 *   - nightly jobs     once per UTC day at NIGHTLY_UTC_HOUR (default 09:00 UTC
 *                      ≈ 1–2am Pacific): credit-engine audit + customer-balance
 *                      reconciliation
 *
 * Multi-instance safety: every tick takes a Postgres advisory lock
 * (pg_try_advisory_lock) before doing work, so scaling `instance_count` above
 * 1 cannot double-process the queue or double-run nightly jobs. If the lock is
 * held by a peer, the tick is a no-op.
 *
 * External-scheduler escape hatch: set BACKGROUND_WORKERS=false to disable the
 * in-process scheduler entirely (e.g. when running the `pnpm cron:*` scripts
 * from DO scheduled jobs / k8s CronJobs instead). The `scripts/` entrypoints
 * remain valid and share the same service-layer functions.
 *
 * Observability: every tick updates an in-memory heartbeat which /api/health
 * exposes (see getWorkerStatus + services/metrics.ts). "Stuck" is now a
 * visible, monitorable condition instead of a silent one.
 */
import type { Pool } from 'pg';
import { reapStaleProcessingRows } from './creditEngine/reaper';
import { processOneRecompute } from './creditEngine/worker';
import { runNightlyCreditEngineAudit } from './creditEngine/nightlyCron';
import { reconcileCustomerBalances } from './balanceReconciliation';

// Advisory lock keys — arbitrary but stable 32-bit app-scoped constants.
const LOCK_DRAIN = 0x7e29_0001;
const LOCK_REAPER = 0x7e29_0002;
const LOCK_NIGHTLY = 0x7e29_0003;

const DRAIN_INTERVAL_MS = readIntEnv('CREDIT_DRAIN_INTERVAL_MS', 15_000);
const REAPER_INTERVAL_MS = readIntEnv('REAPER_INTERVAL_MS', 5 * 60_000);
const NIGHTLY_CHECK_INTERVAL_MS = readIntEnv('NIGHTLY_CHECK_INTERVAL_MS', 10 * 60_000);
const NIGHTLY_UTC_HOUR = readIntEnv('NIGHTLY_UTC_HOUR', 9);
const DRAIN_BATCH_MAX = readIntEnv('CREDIT_DRAIN_BATCH_MAX', 50);

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface WorkerStatus {
  enabled: boolean;
  startedAt: string | null;
  lastDrainAt: string | null;
  lastDrainProcessed: number;
  lastReaperAt: string | null;
  lastNightlyDay: string | null; // 'YYYY-MM-DD' UTC
  lastError: string | null;
  pendingQueueDepth: number | null; // refreshed each drain tick
}

const status: WorkerStatus = {
  enabled: false,
  startedAt: null,
  lastDrainAt: null,
  lastDrainProcessed: 0,
  lastReaperAt: null,
  lastNightlyDay: null,
  lastError: null,
  pendingQueueDepth: null
};

/** Read-only snapshot for /api/health and tests. */
export function getWorkerStatus(): WorkerStatus {
  return { ...status };
}

/** Whether the in-process scheduler is enabled (BACKGROUND_WORKERS env gate). */
export function backgroundWorkersEnabled(): boolean {
  const raw = process.env.BACKGROUND_WORKERS;
  if (raw === undefined) return true; // default ON — the review-fix posture
  return raw.toLowerCase() === 'true';
}

/**
 * Run `fn` only if this instance wins the advisory lock; always unlocks.
 * Uses a dedicated client so lock/unlock happen on the same session.
 */
async function withAdvisoryLock(pool: Pool, key: number, fn: () => Promise<void>): Promise<boolean> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [key]
    );
    if (!rows[0]?.locked) return false;
    try {
      await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key]);
    }
    return true;
  } finally {
    client.release();
  }
}

/**
 * One drain tick: process up to DRAIN_BATCH_MAX pending recompute rows.
 * Exported for tests. Per-row errors are recorded by processOneRecompute
 * (attempts/last_error columns) and do not abort the batch.
 */
export async function drainCreditQueueOnce(pool: Pool, batchMax = DRAIN_BATCH_MAX): Promise<number> {
  let processed = 0;
  for (let i = 0; i < batchMax; i++) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM credit_recompute_queue
        WHERE status = 'pending'
        ORDER BY enqueued_at
        LIMIT 1`
    );
    if (rows.length === 0) break;
    try {
      const result = await processOneRecompute(pool, rows[0].id);
      if (!result.skipped) processed++;
    } catch (err) {
      status.lastError = err instanceof Error ? err.message : String(err);
      // processOneRecompute already rolled back + re-queued/failed the row.
    }
  }
  return processed;
}

async function refreshQueueDepth(pool: Pool): Promise<void> {
  try {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM credit_recompute_queue WHERE status = 'pending'`
    );
    status.pendingQueueDepth = Number(rows[0]?.n ?? 0);
  } catch {
    status.pendingQueueDepth = null;
  }
}

/** UTC day string for nightly once-per-day gating. */
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Nightly gate: run when current UTC hour >= NIGHTLY_UTC_HOUR and we have not
 * run for today's UTC day yet. The nightly audit table itself UPSERTs by day,
 * so even a gate race across restarts cannot duplicate audit rows.
 */
export function nightlyDue(now: Date, lastRunDay: string | null, utcHour = NIGHTLY_UTC_HOUR): boolean {
  return now.getUTCHours() >= utcHour && lastRunDay !== utcDay(now);
}

const timers: ReturnType<typeof setInterval>[] = [];

/**
 * Start the in-process schedulers. Idempotent per process; call once from
 * index.ts after the HTTP server is listening. No-ops (and logs why) when
 * BACKGROUND_WORKERS=false.
 */
export function startBackgroundWorkers(pool: Pool): void {
  if (!backgroundWorkersEnabled()) {
    console.log('[workers] BACKGROUND_WORKERS=false — in-process scheduler disabled (external cron expected).');
    return;
  }
  if (status.enabled) return; // idempotent
  status.enabled = true;
  status.startedAt = new Date().toISOString();
  console.log(
    `[workers] started: drain=${DRAIN_INTERVAL_MS}ms reaper=${REAPER_INTERVAL_MS}ms nightly@${NIGHTLY_UTC_HOUR}:00 UTC`
  );

  timers.push(
    setInterval(() => {
      void withAdvisoryLock(pool, LOCK_DRAIN, async () => {
        const processed = await drainCreditQueueOnce(pool);
        status.lastDrainAt = new Date().toISOString();
        status.lastDrainProcessed = processed;
        await refreshQueueDepth(pool);
        if (processed > 0) console.log(`[workers] credit drain processed ${processed} row(s)`);
      }).catch((err) => {
        status.lastError = err instanceof Error ? err.message : String(err);
        console.error('[workers] drain tick failed:', err);
      });
    }, DRAIN_INTERVAL_MS)
  );

  timers.push(
    setInterval(() => {
      void withAdvisoryLock(pool, LOCK_REAPER, async () => {
        await reapStaleProcessingRows(pool);
        status.lastReaperAt = new Date().toISOString();
      }).catch((err) => {
        status.lastError = err instanceof Error ? err.message : String(err);
        console.error('[workers] reaper tick failed:', err);
      });
    }, REAPER_INTERVAL_MS)
  );

  timers.push(
    setInterval(() => {
      const now = new Date();
      if (!nightlyDue(now, status.lastNightlyDay)) return;
      void withAdvisoryLock(pool, LOCK_NIGHTLY, async () => {
        // Re-check inside the lock — a peer may have just completed today's run.
        if (!nightlyDue(new Date(), status.lastNightlyDay)) return;
        console.log('[workers] nightly jobs starting');
        const audit = await runNightlyCreditEngineAudit(pool, now);
        const recon = await reconcileCustomerBalances(pool, now);
        status.lastNightlyDay = utcDay(now);
        console.log(
          JSON.stringify({
            level: 'info',
            event: 'workers_nightly_complete',
            day: status.lastNightlyDay,
            creditDecisions: audit.decisionsIssued,
            balanceDrift: recon.customersDrifted
          })
        );
      }).catch((err) => {
        status.lastError = err instanceof Error ? err.message : String(err);
        console.error('[workers] nightly tick failed:', err);
      });
    }, NIGHTLY_CHECK_INTERVAL_MS)
  );
}

/** Stop all timers (graceful shutdown / tests). */
export function stopBackgroundWorkers(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  status.enabled = false;
}
