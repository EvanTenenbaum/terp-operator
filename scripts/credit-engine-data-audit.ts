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

async function auditDueDate(): Promise<void> {
  const { rows } = await pool.query<{
    total_invoices: string;
    future_issued: string;
    negative_total: string;
    due_before_issued: string;
    terms_lt_5: string;
    terms_5_to_14: string;
    terms_15_to_30: string;
    terms_31_to_60: string;
    terms_61_plus: string;
    terms_avg: string | null;
  }>(`
    SELECT
      COUNT(*)::text                                                              AS total_invoices,
      SUM(CASE WHEN created_at > now() THEN 1 ELSE 0 END)::text                   AS future_issued,
      SUM(CASE WHEN total < 0 THEN 1 ELSE 0 END)::text                            AS negative_total,
      SUM(CASE WHEN due_date < created_at THEN 1 ELSE 0 END)::text                AS due_before_issued,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (due_date - created_at))/86400 <  5  THEN 1 ELSE 0 END)::text AS terms_lt_5,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (due_date - created_at))/86400 >= 5  AND
                    EXTRACT(EPOCH FROM (due_date - created_at))/86400 <  15 THEN 1 ELSE 0 END)::text AS terms_5_to_14,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (due_date - created_at))/86400 >= 15 AND
                    EXTRACT(EPOCH FROM (due_date - created_at))/86400 <  31 THEN 1 ELSE 0 END)::text AS terms_15_to_30,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (due_date - created_at))/86400 >= 31 AND
                    EXTRACT(EPOCH FROM (due_date - created_at))/86400 <  61 THEN 1 ELSE 0 END)::text AS terms_31_to_60,
      SUM(CASE WHEN EXTRACT(EPOCH FROM (due_date - created_at))/86400 >= 61 THEN 1 ELSE 0 END)::text AS terms_61_plus,
      AVG(EXTRACT(EPOCH FROM (due_date - created_at))/86400)::text                AS terms_avg
    FROM invoices
  `);
  const r = rows[0];
  console.log('--- invoices: terms distribution and data quality audit ---');
  console.log(`Total invoices:          ${r.total_invoices}`);
  console.log(`Future-dated created_at: ${r.future_issued}`);
  console.log(`Negative total:          ${r.negative_total}`);
  console.log(`Due-before-issued:       ${r.due_before_issued}  (should be 0 — data quality red flag)`);
  console.log(`Terms < 5 days:          ${r.terms_lt_5}`);
  console.log(`Terms 5-14 days:         ${r.terms_5_to_14}`);
  console.log(`Terms 15-30 days:        ${r.terms_15_to_30}`);
  console.log(`Terms 31-60 days:        ${r.terms_31_to_60}`);
  console.log(`Terms 61+ days:          ${r.terms_61_plus}`);
  console.log(`Average terms (days):    ${r.terms_avg ?? 'n/a'}`);
  console.log('');
}

async function main(): Promise<void> {
  await auditUnitCost();
  await auditDueDate();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
