import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { pool as defaultPool } from './db';

/**
 * Returns true when a migration's SQL contains the `CONCURRENTLY` keyword
 * (case-insensitive). Postgres rejects `CREATE INDEX CONCURRENTLY` (and
 * similar concurrent DDL) inside an explicit transaction, so the entire
 * file must run in auto-commit mode in that case.
 *
 * The check is intentionally coarse: any occurrence of the word
 * `concurrently` causes the file to be treated as non-transactional. This is
 * safe — mixing concurrent and non-concurrent DDL in a single migration is
 * already a bad practice — and avoids brittle SQL parsing.
 */
export function isConcurrentMigration(sql: string): boolean {
  return /\bconcurrently\b/i.test(sql);
}

/**
 * Split SQL into individual statements on semicolons that are outside
 * comments, quoted strings, and dollar-quoted blocks.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;

  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingleLineComment) {
      if (ch === '\n') {
        inSingleLineComment = false;
      }
      current += ch;
      i++;
      continue;
    }

    if (inMultiLineComment) {
      if (ch === '*' && next === '/') {
        inMultiLineComment = false;
        current += '*/';
        i += 2;
      } else {
        current += ch;
        i++;
      }
      continue;
    }

    if (inSingleQuote) {
      if (ch === "'" && next === "'") {
        current += "''";
        i += 2;
      } else if (ch === "'") {
        inSingleQuote = false;
        current += ch;
        i++;
      } else {
        current += ch;
        i++;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (ch === '"' && next === '"') {
        current += '""';
        i += 2;
      } else if (ch === '"') {
        inDoubleQuote = false;
        current += ch;
        i++;
      } else {
        current += ch;
        i++;
      }
      continue;
    }

    if (dollarTag !== null) {
      if (ch === '$') {
        let j = i + 1;
        let tag = '';
        while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
          tag += sql[j];
          j++;
        }
        if (j < sql.length && sql[j] === '$' && tag === dollarTag) {
          current += '$' + tag + '$';
          i = j + 1;
          dollarTag = null;
          continue;
        }
      }
      current += ch;
      i++;
      continue;
    }

    if (ch === '-' && next === '-') {
      inSingleLineComment = true;
      current += '--';
      i += 2;
      continue;
    }

    if (ch === '/' && next === '*') {
      inMultiLineComment = true;
      current += '/*';
      i += 2;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === '$') {
      let j = i + 1;
      let tag = '';
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) {
        tag += sql[j];
        j++;
      }
      if (j < sql.length && sql[j] === '$') {
        dollarTag = tag;
        current += '$' + tag + '$';
        i = j + 1;
        continue;
      }
    }

    if (ch === ';') {
      statements.push(current);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.trim().length > 0) {
    statements.push(current);
  }

  return statements.map((s) => s.trim()).filter((s) => s.length > 0);
}

export interface RunMigrationsOptions {
  pool: Pool;
  migrationDir: string;
  log?: (message: string) => void;
}

/**
 * Apply every `*.sql` file in `migrationDir` that has not yet been recorded
 * in the `schema_migrations` table.
 *
 * Transaction strategy (issue #17 slice 1, MIG-01):
 *  - Each migration borrows ONE pooled client via `pool.connect()`.
 *  - All of `BEGIN`, the migration SQL, the bookkeeping `INSERT INTO
 *    schema_migrations`, and `COMMIT` run on that same client so the
 *    transaction boundary is honored. Previously each call ran via
 *    `pool.query(...)`, which could land on different connections and
 *    silently break atomicity.
 *  - On error, `ROLLBACK` is issued on the same client, the client is
 *    released in a `finally`, and the error is rethrown with the file name
 *    so logs make it obvious which migration failed.
 *  - Migrations containing `CONCURRENTLY` (e.g. `CREATE INDEX
 *    CONCURRENTLY`) are run WITHOUT a `BEGIN/COMMIT` wrapper because
 *    Postgres forbids concurrent DDL inside an explicit transaction. The
 *    bookkeeping insert still runs on the same client.
 */
export async function runMigrations(options: RunMigrationsOptions): Promise<void> {
  const { pool, migrationDir } = options;
  const log = options.log ?? ((message: string) => console.log(message));

  await pool.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())'
  );

  const entries = await fs.readdir(migrationDir);
  const files = entries.filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const applied = await pool.query(
      'select 1 from schema_migrations where name = $1',
      [file]
    );
    if (applied.rowCount) continue;

    const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
    const concurrent = isConcurrentMigration(sql);

    const client = await pool.connect();
    try {
      if (concurrent) {
        // Concurrent DDL cannot run inside an explicit transaction. Run the
        // migration body in auto-commit, then record it.
        //
        // The pool's default statement_timeout (60s per PR #91) is too
        // aggressive for CREATE INDEX CONCURRENTLY on a large table — the
        // GIN build on command_journal.affected_ids after the realistic_100d
        // seed routinely exceeds 60s. Disable the cap for this session
        // before running the migration body, then leave it (the connection
        // is released back to the pool which resets per-session GUCs).
        await client.query("set statement_timeout = 0");
        const statements = splitSqlStatements(sql);
        for (const stmt of statements) {
          await client.query(stmt);
        }
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        log(`Applied ${file} (auto-commit; CONCURRENTLY detected; statement_timeout=0 for this session)`);
      } else {
        await client.query('begin');
        try {
          await client.query(sql);
          await client.query('insert into schema_migrations (name) values ($1)', [file]);
          await client.query('commit');
          log(`Applied ${file}`);
        } catch (error) {
          try {
            await client.query('rollback');
          } catch (rollbackError) {
            console.error(`Rollback failed for ${file}:`, rollbackError);
          }
          throw new Error(
            `Migration ${file} failed and was rolled back: ${
              error instanceof Error ? error.message : String(error)
            }`,
            { cause: error instanceof Error ? error : undefined }
          );
        }
      }
    } finally {
      client.release();
    }
  }
}

const isMainModule =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  /migrate(\.[cm]?[jt]s)?$/.test(process.argv[1]);

if (isMainModule) {
  const migrationDir = path.resolve(process.cwd(), 'migrations');
  runMigrations({ pool: defaultPool, migrationDir })
    .then(async () => {
      await defaultPool.end();
    })
    .catch(async (error) => {
      console.error(error);
      await defaultPool.end();
      process.exit(1);
    });
}
