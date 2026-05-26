import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env';
import * as schema from './schema';

/**
 * Pool configuration is exported separately so it can be asserted in unit
 * tests without instantiating a live pg.Pool.
 *
 * Tuning rationale (CODE-09):
 *   - `max: 25` (raised from 12) — handles peak operator concurrency without
 *     starving requests when a few connections are blocked on slow queries.
 *     25 stays well under the typical 100-connection Postgres ceiling once
 *     replicas, migration jobs, and pgBouncer overhead are accounted for.
 *   - `statement_timeout: 60_000` (ms) — caps any individual server-side
 *     statement at 60s so a runaway query cannot hold a pool slot indefinitely.
 *     The pg driver expects this option in milliseconds. Analytical jobs that
 *     legitimately run longer (divergenceReport, nightlyCron) should run
 *     `SET LOCAL statement_timeout = 0` inside their transaction to lift the
 *     cap for that one connection.
 *   - `idleTimeoutMillis: 30_000` — preexisting; idle clients are reaped
 *     after 30s so the pool returns to baseline during quiet periods.
 */
export const poolConfig = {
  connectionString: databaseConnectionString(),
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED } : undefined,
  max: 25,
  statement_timeout: 60_000,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5000
} as const;

export const pool = new pg.Pool(poolConfig);

export const db = drizzle(pool, { schema });

/**
 * Typed Drizzle transaction handle inferred from the db instance.
 * Replaces the previous `export type Tx = any` (GH #301).
 * Import from here to avoid circular dependencies across service files.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function pingDatabase() {
  const client = await pool.connect();
  try {
    await client.query('select 1');
  } finally {
    client.release();
  }
}

function databaseConnectionString() {
  if (!env.DATABASE_SSL) return env.DATABASE_URL;
  const url = new URL(env.DATABASE_URL);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
    url.searchParams.delete(key);
  }
  return url.toString();
}
