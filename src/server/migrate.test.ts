import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { runMigrations } from './migrate';

/**
 * Build a fake pg.Pool whose `connect()` always returns the same FakeClient
 * (or a fresh one per call), tracking every query so we can assert which
 * client received which command.
 */
type FakeClient = {
  id: number;
  released: boolean;
  queries: Array<{ sql: string; params?: unknown[] }>;
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  /** Configure which query (matched by substring, case-insensitive) should throw. */
  failOn?: string;
};

function makeClient(id: number, opts: { failOn?: string } = {}): FakeClient {
  const client: FakeClient = {
    id,
    released: false,
    queries: [],
    failOn: opts.failOn,
    query: vi.fn(),
    release: vi.fn()
  };

  client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    client.queries.push({ sql, params });
    if (client.failOn && sql.toLowerCase().includes(client.failOn.toLowerCase())) {
      throw new Error(`fake-failure on: ${sql}`);
    }
    return { rows: [], rowCount: 0 } as unknown as QueryResult;
  });

  client.release.mockImplementation(() => {
    client.released = true;
  });

  return client;
}

type FakePool = {
  pool: Pool;
  clients: FakeClient[];
  poolQueries: Array<{ sql: string; params?: unknown[] }>;
  /** Map of substring -> rows returned by pool.query (used for schema_migrations checks). */
  poolQueryRows: Map<string, Array<Record<string, unknown>>>;
  clientFactory: (id: number) => FakeClient;
};

function makePool(opts: { clientFailOn?: (id: number) => string | undefined } = {}): FakePool {
  const clients: FakeClient[] = [];
  const poolQueries: Array<{ sql: string; params?: unknown[] }> = [];
  const poolQueryRows = new Map<string, Array<Record<string, unknown>>>();

  const factory = (id: number) =>
    makeClient(id, { failOn: opts.clientFailOn?.(id) });

  const pool = {
    connect: vi.fn(async () => {
      const client = factory(clients.length + 1);
      clients.push(client);
      return client as unknown as PoolClient;
    }),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      poolQueries.push({ sql, params });
      for (const [needle, rows] of poolQueryRows.entries()) {
        if (sql.toLowerCase().includes(needle.toLowerCase())) {
          return { rows, rowCount: rows.length } as unknown as QueryResult;
        }
      }
      return { rows: [], rowCount: 0 } as unknown as QueryResult;
    }),
    end: vi.fn(async () => undefined)
  } as unknown as Pool;

  return { pool, clients, poolQueries, poolQueryRows, clientFactory: factory };
}

async function makeMigrationDir(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'terp-migrate-test-'));
  for (const [name, sql] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), sql, 'utf8');
  }
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runMigrations', () => {
  it('runs BEGIN, SQL, INSERT into schema_migrations, and COMMIT all on the same client per migration file', async () => {
    const dir = await makeMigrationDir({
      '0001_a.sql': 'create table a (id int);',
      '0002_b.sql': 'create table b (id int);'
    });
    const { pool, clients } = makePool();

    await runMigrations({ pool, migrationDir: dir });

    // One client per migration file (no migrations are pre-applied)
    expect(clients).toHaveLength(2);

    for (const [index, client] of clients.entries()) {
      const sqls = client.queries.map((q) => q.sql.toLowerCase().trim());
      expect(sqls[0]).toMatch(/^begin/);
      // The migration's own SQL is in the middle
      const insertIdx = sqls.findIndex((s) => s.includes('insert into schema_migrations'));
      const commitIdx = sqls.findIndex((s) => s.startsWith('commit'));
      expect(insertIdx).toBeGreaterThan(0);
      expect(commitIdx).toBe(sqls.length - 1);
      // Verify the migration file SQL itself ran on this same client
      const fileSqlSeen = client.queries.some((q) =>
        q.sql.includes(index === 0 ? 'create table a' : 'create table b')
      );
      expect(fileSqlSeen).toBe(true);
      expect(client.released).toBe(true);
    }
  });

  it('on SQL error, runs ROLLBACK on the same client and releases the client in finally', async () => {
    const dir = await makeMigrationDir({
      '0001_bad.sql': 'create table broken (oops);'
    });
    // Make the migration file SQL throw on the client.
    const { pool, clients } = makePool({
      clientFailOn: () => 'create table broken'
    });

    await expect(runMigrations({ pool, migrationDir: dir })).rejects.toThrow(/fake-failure/);

    expect(clients).toHaveLength(1);
    const client = clients[0]!;
    const sqls = client.queries.map((q) => q.sql.toLowerCase().trim());
    expect(sqls[0]).toMatch(/^begin/);
    // Rollback must run on the same client after the failure
    expect(sqls.some((s) => s.startsWith('rollback'))).toBe(true);
    // No commit
    expect(sqls.some((s) => s.startsWith('commit'))).toBe(false);
    // Released in finally
    expect(client.released).toBe(true);
  });

  it('skips migrations whose name is already in schema_migrations', async () => {
    const dir = await makeMigrationDir({
      '0001_a.sql': 'create table a (id int);',
      '0002_b.sql': 'create table b (id int);'
    });
    const fake = makePool();
    // Pretend 0001 has been applied: pool.query("select 1 from schema_migrations where name = $1", ['0001_a.sql'])
    // returns one row. The implementation calls pool.query (or client.query) with the name as a param.
    fake.pool.query = vi.fn(async (sql: string, params?: unknown[]) => {
      const lower = sql.toLowerCase();
      if (lower.includes('schema_migrations') && lower.includes('select')) {
        const name = params?.[0];
        if (name === '0001_a.sql') {
          return { rows: [{ '?column?': 1 }], rowCount: 1 } as unknown as QueryResult;
        }
        return { rows: [], rowCount: 0 } as unknown as QueryResult;
      }
      return { rows: [], rowCount: 0 } as unknown as QueryResult;
    }) as unknown as Pool['query'];

    await runMigrations({ pool: fake.pool, migrationDir: dir });

    // Only one client should have been borrowed (for 0002), because 0001 was skipped
    expect(fake.clients).toHaveLength(1);
    const onlyClient = fake.clients[0]!;
    const fileSqlSeen = onlyClient.queries.some((q) => q.sql.includes('create table b'));
    expect(fileSqlSeen).toBe(true);
    const insertedNames = onlyClient.queries
      .filter((q) => q.sql.toLowerCase().includes('insert into schema_migrations'))
      .map((q) => q.params?.[0]);
    expect(insertedNames).toEqual(['0002_b.sql']);
  });

  it('runs CREATE INDEX CONCURRENTLY migrations WITHOUT a BEGIN/COMMIT wrapper (auto-commit)', async () => {
    const dir = await makeMigrationDir({
      '0001_concurrent_index.sql':
        'create index concurrently if not exists idx_foo on bar (baz);'
    });
    const { pool, clients } = makePool();

    await runMigrations({ pool, migrationDir: dir });

    expect(clients).toHaveLength(1);
    const client = clients[0]!;
    const sqls = client.queries.map((q) => q.sql.toLowerCase().trim());
    // No transaction control statements
    expect(sqls.some((s) => s.startsWith('begin'))).toBe(false);
    expect(sqls.some((s) => s.startsWith('commit'))).toBe(false);
    expect(sqls.some((s) => s.startsWith('rollback'))).toBe(false);
    // The migration SQL itself ran
    expect(sqls.some((s) => s.includes('create index concurrently'))).toBe(true);
    // The bookkeeping insert still happens on the same client
    const inserted = client.queries.find((q) =>
      q.sql.toLowerCase().includes('insert into schema_migrations')
    );
    expect(inserted?.params?.[0]).toBe('0001_concurrent_index.sql');
    // Client released
    expect(client.released).toBe(true);
  });
});
