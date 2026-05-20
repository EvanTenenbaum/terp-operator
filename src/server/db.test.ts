import { describe, expect, it } from 'vitest';
import { poolConfig } from './db';

describe('db pool config', () => {
  it('sets max to 25 (raised from 12 per CODE-09 to handle peak operator load)', () => {
    expect(poolConfig.max).toBe(25);
  });

  it('sets a statement_timeout of 60_000 ms to cap runaway queries (CODE-09)', () => {
    // pg driver expects the option in milliseconds (snake_case). 60s is a
    // permissive default so the credit-engine divergenceReport + nightlyCron
    // analytical paths aren't killed; those jobs can SET LOCAL statement_timeout = 0
    // inside their tx if they legitimately need longer.
    expect(poolConfig.statement_timeout).toBe(60_000);
  });

  it('keeps idleTimeoutMillis set so idle clients are reaped from the pool', () => {
    expect(poolConfig.idleTimeoutMillis).toBe(30_000);
  });

  it('exposes a connectionString for pg.Pool', () => {
    expect(typeof poolConfig.connectionString).toBe('string');
    expect(poolConfig.connectionString.length).toBeGreaterThan(0);
  });
});
