// scripts/media-cleanup-cron.ts
//
// Scheduled entrypoint for media retention cleanup.
//
// Invoked periodically by the operator's scheduler (DigitalOcean App
// Platform scheduled job, k8s CronJob, etc.).  Runs all active retention
// policies, deletes expired files from disk, removes the DB rows, and
// writes audit rows to media_cleanup_log.
//
// Usage:
//   pnpm cron:media-cleanup
//
// Exits 0 on success, 1 on failure.
//
// See src/server/services/mediaCleanup.ts for the core logic.

import { db, pool } from '../src/server/db';
import { runMediaCleanup } from '../src/server/services/mediaCleanup';

async function main(): Promise<void> {
  const now = new Date();
  const results = await runMediaCleanup(db, now);

  const totalFilesDeleted = results.reduce((s, r) => s + r.filesDeleted, 0);
  const totalBytesFreed = results.reduce((s, r) => s + r.bytesFreed, 0);
  const errors = results.filter((r) => r.error);

  console.log(
    JSON.stringify({
      level: errors.length > 0 ? 'warn' : 'info',
      event: 'media_cleanup_complete',
      policiesRun: results.length,
      totalFilesDeleted,
      totalBytesFreed,
      errorCount: errors.length,
      runAt: now.toISOString(),
      details: results.map((r) => ({
        policy: r.policyName,
        filesDeleted: r.filesDeleted,
        bytesFreed: r.bytesFreed,
        error: r.error ?? null
      }))
    })
  );

  if (errors.length > 0) {
    process.exit(1);
  }
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
        event: 'media_cleanup_failed',
        error: err instanceof Error ? err.message : String(err)
      })
    );
    try {
      await pool.end();
    } catch {
      // Ignore pool-shutdown errors during a failed run
    }
    process.exit(1);
  });
