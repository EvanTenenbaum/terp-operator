import { describe, expect, it } from 'vitest';
import { poolConfig } from './db';

describe('db pool config', () => {
  it('sets max to 8 (capped for pg connection ceiling; see CODE-09)', () => {
    expect(poolConfig.max).toBe(8);
  });

  it('does not set a client-side statement_timeout (enforced via DB role default for PgBouncer compatibility)', () => {
    // The 60s runaway-query cap is enforced server-side as the database role
    // default (`ALTER ROLE doadmin IN DATABASE defaultdb SET statement_timeout='60s'`).
    // PgBouncer (transaction mode) rejects `statement_timeout` as an unsupported
    // startup parameter, so the client pool intentionally omits it.
    expect('statement_timeout' in poolConfig).toBe(false);
  });

  it('keeps idleTimeoutMillis set so idle clients are reaped from the pool', () => {
    expect(poolConfig.idleTimeoutMillis).toBe(30_000);
  });

  it('exposes a connectionString for pg.Pool', () => {
    expect(typeof poolConfig.connectionString).toBe('string');
    expect(poolConfig.connectionString.length).toBeGreaterThan(0);
  });
});
