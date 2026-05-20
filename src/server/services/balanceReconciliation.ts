import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

/**
 * Nightly customer balance reconciliation cron (issue #18 slice 4).
 *
 * Safety-net for the denormalized `customers.balance` column. Issue #18 BIZ-01
 * notes that `customers.balance` is a denormalized projection of
 * `client_ledger_entries.amount` and currently has no SQL-level CHECK
 * constraint that ties the two together. This cron compares the two values
 * nightly and writes a `customer_balance_reconciliation` audit row for every
 * customer whose drift exceeds the configured threshold.
 *
 * Drift threshold:  `CUSTOMER_BALANCE_DRIFT_THRESHOLD` (default 0.01 — one cent)
 *
 * The drift comparison is performed in SQL — `SUM(cle.amount) - c.balance` —
 * so the subtraction stays in NUMERIC(12,2) precision the whole way. JS
 * doubles never touch the cents-level math. The threshold compare on the JS
 * side is fine because the default (and any realistic operator-configured
 * value) is exactly representable as a double.
 *
 * No in-process scheduler. The operator's host (DigitalOcean App Platform
 * scheduled job, k8s CronJob, etc.) invokes this via
 * `pnpm cron:balance-reconciliation`. Downstream dashboards read from the
 * `customer_balance_reconciliation` table directly — keyed by `run_id` for a
 * single nightly snapshot or by `customer_id` for that customer's history.
 */

const DEFAULT_DRIFT_THRESHOLD = 0.01;

export interface ReconciliationRun {
  id: string;
  startedAt: Date;
  completedAt: Date;
}

export interface ReconciliationSummary {
  customersChecked: number;
  customersDrifted: number;
  totalDriftAbs: number;
  run: ReconciliationRun;
}

interface DriftRow {
  customer_id: string;
  expected: string;
  actual: string;
  drift: string;
}

/**
 * Read the drift threshold from the environment. We accept any positive
 * number (decimal-format string). Anything else falls back to the default
 * cent threshold — the cron must never crash on a malformed env value.
 */
function readDriftThreshold(): number {
  const raw = process.env.CUSTOMER_BALANCE_DRIFT_THRESHOLD;
  if (raw === undefined || raw === '') return DEFAULT_DRIFT_THRESHOLD;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DRIFT_THRESHOLD;
  return n;
}

export async function reconcileCustomerBalances(
  pool: Pool,
  now: Date
): Promise<ReconciliationSummary> {
  const runId = randomUUID();
  const startedAt = new Date(now.getTime());
  const threshold = readDriftThreshold();

  // Pull every customer's expected balance (SUM of ledger amounts) and actual
  // balance (the denorm column). The LEFT JOIN ensures we still scan customers
  // with zero ledger entries — those should also read 0 in the denorm column
  // and we want to flag the case where they don't.
  //
  // COALESCE(SUM(...), 0) handles the no-ledger case so `expected` is always
  // NUMERIC, never NULL. The subtraction stays in NUMERIC(12,2) so cents-level
  // drift is preserved without any JS-double rounding.
  const driftRes = await pool.query<DriftRow>(
    `
    SELECT
      c.id::text AS customer_id,
      COALESCE(SUM(cle.amount), 0)::text AS expected,
      c.balance::text AS actual,
      (COALESCE(SUM(cle.amount), 0) - c.balance)::text AS drift
    FROM customers c
    LEFT JOIN client_ledger_entries cle ON cle.customer_id = c.id
    GROUP BY c.id, c.balance
    `
  );

  const customersChecked = driftRes.rows.length;
  const drifted: DriftRow[] = [];
  let totalDriftAbs = 0;

  for (const row of driftRes.rows) {
    // Keep the NUMERIC strings as the source of truth for the row INSERT
    // (we pass them straight through to Postgres). Only convert to Number
    // for the threshold comparison + summary aggregation.
    const driftNum = Number(row.drift);
    if (!Number.isFinite(driftNum)) continue;
    const absDrift = Math.abs(driftNum);
    if (absDrift > threshold) {
      drifted.push(row);
      totalDriftAbs += absDrift;
    }
  }

  if (drifted.length > 0) {
    // Build a single VALUES batch insert: cheaper than N individual round
    // trips when an operator has a serious drift event.
    const valueClauses: string[] = [];
    const params: unknown[] = [runId];
    let p = 2;
    for (const row of drifted) {
      valueClauses.push(`($1, $${p}, $${p + 1}, $${p + 2}, $${p + 3})`);
      params.push(row.customer_id, row.expected, row.actual, row.drift);
      p += 4;
    }
    await pool.query(
      `
      INSERT INTO customer_balance_reconciliation
        (run_id, customer_id, expected, actual, drift)
      VALUES ${valueClauses.join(', ')}
      `,
      params
    );
  }

  const completedAt = new Date();

  return {
    customersChecked,
    customersDrifted: drifted.length,
    totalDriftAbs,
    run: {
      id: runId,
      startedAt,
      completedAt
    }
  };
}
