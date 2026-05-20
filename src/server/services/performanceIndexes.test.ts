import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Contract test for migrations/0043_performance_indexes.sql (issue #17 slice 4,
 * PERF-A1/A2/A3).
 *
 * The audit (#17) flagged these missing indexes that force full-table scans on
 * hot paths:
 *   - PERF-A1: no GIN index on command_journal.affected_ids
 *   - PERF-A2: batches.created_at / archived_at unindexed
 *   - PERF-A3: missing FK indexes on customer_id / vendor_id / batch_id /
 *     pick_list_id / order_id columns
 *
 * This file asserts the migration SQL has the expected shape WITHOUT executing
 * it against a live database. The migration runs CONCURRENTLY (no table lock)
 * outside an explicit transaction; migrate.ts detects the CONCURRENTLY keyword
 * (added in PR #88) and skips the BEGIN/COMMIT wrapper.
 *
 * The corresponding rollback lives in migrations/rollback/.
 */
describe('migrations/0043_performance_indexes.sql (issue #17 slice 4)', () => {
  const migrationPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'migrations',
    '0043_performance_indexes.sql'
  );
  const rollbackPath = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'migrations',
    'rollback',
    '0043_drop_performance_indexes.sql'
  );

  let sql = '';
  let rollbackSql = '';

  beforeAll(async () => {
    sql = await fs.readFile(migrationPath, 'utf8');
    rollbackSql = await fs.readFile(rollbackPath, 'utf8');
  });

  /**
   * Every CREATE INDEX statement must use CONCURRENTLY so the migration
   * never takes an AccessExclusiveLock on a production table. Postgres
   * forbids concurrent DDL inside an explicit transaction, which is why
   * migrate.ts strips BEGIN/COMMIT when the file contains CONCURRENTLY
   * (see isConcurrentMigration in src/server/migrate.ts).
   *
   * If this assertion fails, either:
   *   - a non-CONCURRENTLY statement crept in (will fail on prod under load), or
   *   - the migration was wrapped in BEGIN/COMMIT (Postgres will reject it).
   */
  it('every CREATE INDEX uses CONCURRENTLY and IF NOT EXISTS', () => {
    const createMatches = sql.match(/create\s+index\s+/gi) ?? [];
    const concurrentMatches = sql.match(/create\s+index\s+concurrently\s+if\s+not\s+exists\s+/gi) ?? [];
    expect(createMatches.length).toBeGreaterThan(0);
    expect(concurrentMatches.length).toBe(createMatches.length);
  });

  it('does NOT wrap the migration in BEGIN/COMMIT (migrate.ts handles tx for CONCURRENTLY)', () => {
    // We only care about explicit transaction control statements; comments
    // and the word "begin" inside other contexts should not match.
    const stripped = sql.replace(/--[^\n]*/g, '');
    expect(stripped).not.toMatch(/\bbegin\s*;/i);
    expect(stripped).not.toMatch(/\bcommit\s*;/i);
    expect(stripped).not.toMatch(/\bstart\s+transaction\b/i);
  });

  /**
   * PERF-A1: every dashboard/drawer/recovery query does
   *   affected_ids::text ILIKE '%uuid%'
   * which forces a sequential scan. A GIN index on the text[] column lets
   * Postgres answer `affected_ids @> ARRAY['uuid']` in log time.
   */
  it('PERF-A1: creates GIN index on command_journal.affected_ids', () => {
    expect(sql).toMatch(
      /create\s+index\s+concurrently\s+if\s+not\s+exists\s+command_journal_affected_ids_gin\s+on\s+command_journal\s+using\s+gin\s*\(\s*affected_ids\s*\)/i
    );
  });

  /**
   * PERF-A2: batches list is filtered by archived_at IS NULL and ordered by
   * created_at DESC. A partial index on the active subset is the right tool;
   * we also index archived_at on its own for the archived-batches reports.
   */
  it('PERF-A2: creates partial index on batches.created_at WHERE archived_at IS NULL', () => {
    expect(sql).toMatch(
      /create\s+index\s+concurrently\s+if\s+not\s+exists\s+batches_created_at_active_idx\s+on\s+batches\s*\(\s*created_at[^)]*\)\s+where\s+archived_at\s+is\s+null/i
    );
  });

  it('PERF-A2: creates index on batches.archived_at', () => {
    expect(sql).toMatch(
      /create\s+index\s+concurrently\s+if\s+not\s+exists\s+batches_archived_at_idx\s+on\s+batches\s*\(\s*archived_at\s*\)/i
    );
  });

  /**
   * PERF-A3: Postgres does NOT auto-index FK columns. Every FK column in a hot
   * path needs an explicit btree index, otherwise referential-integrity checks
   * (cascades, set-null) and join paths sequentially scan the child table.
   */
  const fkIndexes: Array<{ name: string; table: string; column: string }> = [
    { name: 'sales_orders_customer_id_idx', table: 'sales_orders', column: 'customer_id' },
    { name: 'invoices_customer_id_idx', table: 'invoices', column: 'customer_id' },
    { name: 'payments_customer_id_idx', table: 'payments', column: 'customer_id' },
    { name: 'vendor_bills_vendor_id_idx', table: 'vendor_bills', column: 'vendor_id' },
    { name: 'purchase_receipts_vendor_id_idx', table: 'purchase_receipts', column: 'vendor_id' },
    { name: 'inventory_movements_batch_id_idx', table: 'inventory_movements', column: 'batch_id' },
    { name: 'fulfillment_lines_pick_list_id_idx', table: 'fulfillment_lines', column: 'pick_list_id' },
    { name: 'pick_lists_order_id_idx', table: 'pick_lists', column: 'order_id' }
  ];

  for (const { name, table, column } of fkIndexes) {
    it(`PERF-A3: creates ${name} on ${table}(${column})`, () => {
      const pattern = new RegExp(
        `create\\s+index\\s+concurrently\\s+if\\s+not\\s+exists\\s+${name}\\s+on\\s+${table}\\s*\\(\\s*${column}\\s*\\)`,
        'i'
      );
      expect(sql).toMatch(pattern);
    });
  }

  describe('rollback (migrations/rollback/0043_drop_performance_indexes.sql)', () => {
    it('drops every index the forward migration creates, using CONCURRENTLY + IF EXISTS', () => {
      const expectedIndexNames = [
        'command_journal_affected_ids_gin',
        'batches_created_at_active_idx',
        'batches_archived_at_idx',
        ...fkIndexes.map((fk) => fk.name)
      ];
      for (const indexName of expectedIndexNames) {
        const pattern = new RegExp(
          `drop\\s+index\\s+concurrently\\s+if\\s+exists\\s+${indexName}\\b`,
          'i'
        );
        expect(rollbackSql).toMatch(pattern);
      }
    });

    it('does NOT wrap rollback in BEGIN/COMMIT', () => {
      const stripped = rollbackSql.replace(/--[^\n]*/g, '');
      expect(stripped).not.toMatch(/\bbegin\s*;/i);
      expect(stripped).not.toMatch(/\bcommit\s*;/i);
    });
  });
});
