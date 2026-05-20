// scripts/credit-engine-nightly-cron.ts
//
// Phase 9 — nightly safety-net cron entrypoint.
//
// Invoked once per day by the operator's scheduler (DigitalOcean App Platform
// scheduled job, k8s CronJob, etc.). This file intentionally does NOT bundle
// an in-process scheduler — the host runtime owns scheduling.
//
// Usage:
//   pnpm cron:credit-engine-nightly
//
// Env vars consumed:
//   CREDIT_ENGINE_DRIFT_THRESHOLD_PCT  (default 25)
//   CREDIT_ENGINE_STUCK_AGE_MIN        (default 30)
//
// Exits 0 on success, 1 on failure.

import { pool } from '../src/server/db';
import { runNightlyCreditEngineAudit } from '../src/server/services/creditEngine/nightlyCron';

async function main(): Promise<void> {
  const now = new Date();
  const summary = await runNightlyCreditEngineAudit(pool, now);

  // Emit a single-line JSON record so log shippers can parse the run
  // outcome without scraping prose.
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'credit_engine_nightly_audit_complete',
      day: summary.day,
      decisionsIssued: summary.decisionsIssued,
      customersDrifted: summary.customersDrifted,
      stuckQueueItems: summary.stuckQueueItems,
      runStartedAt: summary.runStartedAt.toISOString(),
      runCompletedAt: summary.runCompletedAt.toISOString(),
      recompute: summary.recompute
    })
  );
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'credit_engine_nightly_audit_failed',
        error: err instanceof Error ? err.message : String(err)
      })
    );
    try {
      await pool.end();
    } catch {
      // Ignore pool-shutdown errors during a failed run.
    }
    process.exit(1);
  });
