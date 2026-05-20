import { describe, expect, it } from 'vitest';
import { poolConfig } from './db';

describe('db pool config', () => {
  it('sets max to 25 (raised from 12 per CODE-09 to handle peak operator load)', () => {
    expect(poolConfig.max).toBe(25);
  });

  it('sets a statement_timeout of 5000 ms to cap runaway queries (CODE-09)', () => {
    // pg driver expects the option in milliseconds (snake_case).
    expect(poolConfig.statement_timeout).toBe(5000);
  });

  it('keeps idleTimeoutMillis set so idle clients are reaped from the pool', () => {
    expect(poolConfig.idleTimeoutMillis).toBe(30_000);
  });

  it('exposes a connectionString for pg.Pool', () => {
    expect(typeof poolConfig.connectionString).toBe('string');
    expect(poolConfig.connectionString.length).toBeGreaterThan(0);
  });
});
