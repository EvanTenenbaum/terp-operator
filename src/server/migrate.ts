import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pool } from './db';

async function migrate() {
  await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const migrationDir = path.resolve(process.cwd(), 'migrations');
  const files = (await fs.readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const applied = await pool.query('select 1 from schema_migrations where name = $1', [file]);
    if (applied.rowCount) continue;
    const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
    await pool.query('begin');
    try {
      await pool.query(sql);
      await pool.query('insert into schema_migrations (name) values ($1)', [file]);
      await pool.query('commit');
      console.log(`Applied ${file}`);
    } catch (error) {
      await pool.query('rollback');
      throw error;
    }
  }
}

migrate()
  .then(async () => {
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
