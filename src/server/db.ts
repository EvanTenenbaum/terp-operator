import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env';
import * as schema from './schema';

export const pool = new pg.Pool({
  connectionString: databaseConnectionString(),
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED } : undefined,
  max: 12,
  idleTimeoutMillis: 30_000
});

export const db = drizzle(pool, { schema });

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
