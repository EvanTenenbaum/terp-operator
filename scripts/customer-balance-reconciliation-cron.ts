// scripts/customer-balance-reconciliation-cron.ts
//
// Issue #18 slice 4 — nightly customers.balance reconciliation cron entrypoint.
//
// Invoked once per night by the operator's scheduler (DigitalOcean App
// Platform scheduled job, k8s CronJob, etc.). This file intentionally does
// NOT bundle an in-process scheduler — the host runtime owns scheduling.
//
// Usage:
//   pnpm cron:balance-reconciliation
//
// Env vars consumed:
//   CUSTOMER_BALANCE_DRIFT_THRESHOLD  (default 0.01 — one cent)
//
// Exits 0 on success, 1 on failure. On success a single-line JSON log
// record is emitted so log shippers can parse the run outcome without
// scraping prose.

import { pool } from '../src/server/db';
import { reconcileCustomerBalances } from '../src/server/services/balanceReconciliation';

async function main(): Promise<void> {
  const now = new Date();
  const summary = await reconcileCustomerBalances(pool, now);

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'customer_balance_reconciliation_complete',
      runId: summary.run.id,
      customersChecked: summary.customersChecked,
      customersDrifted: summary.customersDrifted,
      totalDriftAbs: summary.totalDriftAbs,
      startedAt: summary.run.startedAt.toISOString(),
      completedAt: summary.run.completedAt.toISOString()
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
        event: 'customer_balance_reconciliation_failed',
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
