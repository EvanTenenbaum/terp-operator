// scripts/credit-engine-data-audit.ts
import { pool } from '../src/server/db';

async function auditUnitCost(): Promise<void> {
  const { rows } = await pool.query<{
    total_lines: string;
    null_unit_cost: string;
    zero_unit_cost: string;
    negative_unit_cost: string;
  }>(`
    SELECT
      COUNT(*)::text                                        AS total_lines,
      SUM(CASE WHEN unit_cost IS NULL THEN 1 ELSE 0 END)::text AS null_unit_cost,
      SUM(CASE WHEN unit_cost = 0   THEN 1 ELSE 0 END)::text AS zero_unit_cost,
      SUM(CASE WHEN unit_cost < 0   THEN 1 ELSE 0 END)::text AS negative_unit_cost
    FROM sales_order_lines
  `);
  const r = rows[0];
  const total = Number(r.total_lines);
  const nullPct = total === 0 ? 0 : (Number(r.null_unit_cost) / total) * 100;
  const zeroPct = total === 0 ? 0 : (Number(r.zero_unit_cost) / total) * 100;
  console.log('--- sales_order_lines.unit_cost audit ---');
  console.log(`Total lines:             ${r.total_lines}`);
  console.log(`Null unit_cost:          ${r.null_unit_cost} (${nullPct.toFixed(2)}%)`);
  console.log(`Zero unit_cost:          ${r.zero_unit_cost} (${zeroPct.toFixed(2)}%)`);
  console.log(`Negative unit_cost:      ${r.negative_unit_cost}`);
  console.log('');
}

async function main(): Promise<void> {
  await auditUnitCost();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
