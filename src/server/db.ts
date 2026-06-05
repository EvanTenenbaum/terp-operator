import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env';
import * as schema from './schema';

/**
 * Pool configuration is exported separately so it can be asserted in unit
 * tests without instantiating a live pg.Pool.
 *
 * Tuning rationale (CODE-09):
 *   - `max: 8` — the production managed Postgres (DigitalOcean db-s-1vcpu-2gb)
 *     has max_connections=50 with 3 reserved for superuser (~47 usable) and NO
 *     PgBouncer pooler; the same pool config is reused by the deploy-time seed
 *     step, so during a zero-downtime deploy the old instance pool plus the new
 *     instance's migrate/seed pool must both fit under 47. A single 1-vCPU Node
 *     instance cannot usefully saturate more than a handful of connections;
 *     max:8 keeps worst-case deploy overlap (8 + 8) well under the ceiling and
 *     prevents error 53300 (too_many_connections).
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
  max: 8,
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
