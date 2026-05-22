#!/usr/bin/env bash
# QA Preflight — verifies schema is migrated and seed can run.
# Exit 0 = OK. Exit 1 = broken (seed will fail).
set -euo pipefail

echo "[qa:preflight] Checking database schema..."

pnpm exec -- tsx -e "
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function preflight() {
  // Check required tables exist
  const result = await db.execute(sql\`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('customers', 'batches', 'vendors', 'purchase_orders', 'sales_orders', 'users')
  \`);

  const found = (result.rows as { table_name: string }[]).map(r => r.table_name);
  const required = ['customers', 'batches', 'vendors', 'purchase_orders', 'sales_orders', 'users'];
  const missing = required.filter(t => !found.includes(t));

  if (missing.length > 0) {
    throw new Error('Missing tables: ' + missing.join(', ') + ' — run pnpm db:migrate first');
  }

  console.log('[qa:preflight] Schema: OK (' + found.length + ' required tables confirmed)');
  await pool.end();
}

preflight().catch(e => {
  console.error('[qa:preflight] FAIL:', e.message);
  process.exit(1);
});
" 2>&1

echo "[qa:preflight] PASSED"
