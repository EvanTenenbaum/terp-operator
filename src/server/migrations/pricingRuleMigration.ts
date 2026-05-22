#!/usr/bin/env tsx
/**
 * CAP-030 data migration: JSONB pricing rules → pricing_rule_entries table.
 *
 * Run with: pnpm exec tsx src/server/migrations/pricingRuleMigration.ts
 *
 * SAFE TO RUN MULTIPLE TIMES — idempotent via migration_source column.
 *
 * This script:
 * 1. Migrates global defaults from systemSettings.pricing.defaults
 * 2. Migrates all customer pricing rules from customers.pricing_rule
 * 3. Runs a parity check: old resolver == new resolver for each migrated customer
 * 4. Nulls out legacy columns (soft-deprecation)
 * 5. Flips pricing.useChainResolver = true
 *
 * Category ordering rule: alphabetical (ASCII ascending) — deterministic.
 *
 * CRITICAL: Only add a customer catch-all when rule.default is explicitly set.
 * Without rule.default, the customer chain falls through to global clauses.
 * Adding a customer catch-all would shadow global category rules — WRONG.
 */

import { pool } from '../db';
import { resolvePricingRuleEntry } from '../../shared/inventoryPricingShared';
import { resolvePricingRuleClause } from '../../shared/pricingRuleResolver';
import type { CustomerPricingRule, PricingRuleClause } from '../../shared/types';
import type { FilterGroupInput } from '../../shared/filterSchemas';

// ============================================================================
// Clause builders (mirror parity test helpers exactly)
// ============================================================================

function buildCustomerClauses(
  rule: CustomerPricingRule,
  customerId: string
): PricingRuleClause[] {
  const clauses: PricingRuleClause[] = [];
  let priority = 1;

  // Categories in alphabetical order
  for (const [cat, entry] of Object.entries(rule.categories ?? {}).sort(
    ([a], [b]) => a.localeCompare(b)
  )) {
    clauses.push({
      id: `migrated-${customerId}-${priority}`,
      scope: 'customer',
      customerId,
      priority: priority++,
      name: `${cat} rule`,
      conditions: {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'equals', value: cat }],
      } as FilterGroupInput,
      actionBasis: entry.basis,
      actionAmount: entry.amount,
      active: true,
    });
  }

  // ONLY add catch-all when rule.default is explicitly set
  if (rule.default) {
    clauses.push({
      id: `migrated-${customerId}-${priority}`,
      scope: 'customer',
      customerId,
      priority,
      name: null,
      conditions: null,
      actionBasis: rule.default.basis,
      actionAmount: rule.default.amount,
      active: true,
    });
  }

  return clauses;
}

function buildGlobalClauses(rule: CustomerPricingRule): PricingRuleClause[] {
  const clauses: PricingRuleClause[] = [];
  let priority = 1;

  for (const [cat, entry] of Object.entries(rule.categories ?? {}).sort(
    ([a], [b]) => a.localeCompare(b)
  )) {
    clauses.push({
      id: `global-${priority}`,
      scope: 'global',
      customerId: null,
      priority: priority++,
      name: `${cat} global rule`,
      conditions: {
        logic: 'AND',
        conditions: [{ field: 'category', operator: 'equals', value: cat }],
      } as FilterGroupInput,
      actionBasis: entry.basis,
      actionAmount: entry.amount,
      active: true,
    });
  }

  // Global catch-all is always required
  const defaultEntry = rule.default ?? { basis: 'percent' as const, amount: 0.30 };
  clauses.push({
    id: `global-default`,
    scope: 'global',
    customerId: null,
    priority,
    name: null,
    conditions: null,
    actionBasis: defaultEntry.basis,
    actionAmount: defaultEntry.amount,
    active: true,
  });

  return clauses;
}

// ============================================================================
// Main migration
// ============================================================================

async function run() {
  const client = await pool.connect();
  console.log('Starting pricing rule migration (CAP-030)...');

  try {
    await client.query('BEGIN');

    // --- 1. Migrate global defaults ---
    const settingsRow = await client.query(
      `SELECT value FROM system_settings WHERE key = 'pricing.defaults' LIMIT 1`
    );
    const defaultsRule: CustomerPricingRule =
      (settingsRow.rows[0]?.value as CustomerPricingRule | null) ?? {};

    const globalAlreadyMigrated = await client.query(
      `SELECT id FROM pricing_rule_entries
       WHERE scope = 'global' AND migration_source = 'legacy_jsonb_v1' AND deleted_at IS NULL
       LIMIT 1`
    );

    if (globalAlreadyMigrated.rows.length > 0) {
      console.log('Global defaults already migrated — skipping.');
    } else {
      // Category entries
      let gpriority = 1;
      for (const [cat, entry] of Object.entries(defaultsRule.categories ?? {}).sort(
        ([a], [b]) => a.localeCompare(b)
      )) {
        const conditions: FilterGroupInput = {
          logic: 'AND',
          conditions: [{ field: 'category', operator: 'equals', value: cat }],
        };
        await client.query(
          `INSERT INTO pricing_rule_entries
           (scope, customer_id, priority, name, conditions, action_basis, action_amount, active, migration_source)
           VALUES ('global', NULL, $1, $2, $3, $4, $5, true, 'legacy_jsonb_v1')`,
          [gpriority++, `${cat} global rule`, JSON.stringify(conditions), entry.basis, String(entry.amount)]
        );
      }
      // Global catch-all (always required)
      const globalDefault = defaultsRule.default ?? { basis: 'percent', amount: 0.30 };
      await client.query(
        `INSERT INTO pricing_rule_entries
         (scope, customer_id, priority, name, conditions, action_basis, action_amount, active, migration_source)
         VALUES ('global', NULL, $1, NULL, NULL, $2, $3, true, 'legacy_jsonb_v1')`,
        [gpriority, globalDefault.basis, String(globalDefault.amount)]
      );
      console.log(`Migrated global defaults: ${gpriority} clause(s).`);
    }

    // Build global clauses for parity check (from in-memory defaultsRule, not DB rows)
    // Note: globalRows from DB is available but globalClauses (in-memory) is used for parity.
    const _globalRows = await client.query(
      `SELECT * FROM pricing_rule_entries
       WHERE scope = 'global' AND deleted_at IS NULL
       ORDER BY priority`
    );
    const globalClauses = buildGlobalClauses(defaultsRule);

    // --- 2. Migrate customer rules ---
    const customers = await client.query(
      `SELECT id, name, pricing_rule FROM customers
       WHERE pricing_rule IS NOT NULL AND pricing_rule != '{}'::jsonb`
    );

    let migrated = 0;
    let skipped = 0;
    let parityFailures = 0;

    for (const customer of customers.rows as Array<{
      id: string;
      name: string;
      pricing_rule: CustomerPricingRule;
    }>) {
      const alreadyMigrated = await client.query(
        `SELECT id FROM pricing_rule_entries
         WHERE scope = 'customer' AND customer_id = $1
         AND migration_source = 'legacy_jsonb_v1' AND deleted_at IS NULL
         LIMIT 1`,
        [customer.id]
      );

      if (alreadyMigrated.rows.length > 0) {
        skipped++;
        continue;
      }

      const rule = customer.pricing_rule ?? {};
      let cpriority = 1;

      // Category clauses
      for (const [cat, entry] of Object.entries(rule.categories ?? {}).sort(
        ([a], [b]) => a.localeCompare(b)
      )) {
        const conditions: FilterGroupInput = {
          logic: 'AND',
          conditions: [{ field: 'category', operator: 'equals', value: cat }],
        };
        await client.query(
          `INSERT INTO pricing_rule_entries
           (scope, customer_id, priority, name, conditions, action_basis, action_amount, active, migration_source)
           VALUES ('customer', $1, $2, $3, $4, $5, $6, true, 'legacy_jsonb_v1')`,
          [customer.id, cpriority++, `${cat} rule`, JSON.stringify(conditions), entry.basis, String(entry.amount)]
        );
      }

      // Customer catch-all ONLY when rule.default is explicitly set
      if (rule.default) {
        await client.query(
          `INSERT INTO pricing_rule_entries
           (scope, customer_id, priority, name, conditions, action_basis, action_amount, active, migration_source)
           VALUES ('customer', $1, $2, NULL, NULL, $3, $4, true, 'legacy_jsonb_v1')`,
          [customer.id, cpriority, rule.default.basis, String(rule.default.amount)]
        );
      }

      // --- Parity check ---
      const customerClauses = buildCustomerClauses(rule, customer.id);

      const testCategories = [
        ...Object.keys(rule.categories ?? {}),
        'Flower', 'Extract', '__unknown__', ''
      ];
      const uniqueCategories = [...new Set(testCategories)];

      for (const cat of uniqueCategories) {
        const oldResult = resolvePricingRuleEntry(rule, defaultsRule, cat);
        const newResult = resolvePricingRuleClause(customerClauses, globalClauses, {
          category: cat,
        });

        if (oldResult.amount !== newResult.amount || oldResult.basis !== newResult.basis) {
          console.error(
            `PARITY MISMATCH customer=${customer.id} (${customer.name}) category="${cat}": ` +
            `old=${oldResult.basis}/${oldResult.amount} new=${newResult.basis}/${newResult.amount}`
          );
          parityFailures++;
        }
      }

      migrated++;
    }

    if (parityFailures > 0) {
      await client.query('ROLLBACK');
      console.error(
        `\nMigration ABORTED: ${parityFailures} parity failure(s). ` +
        'Fix buildCustomerClauses() and rerun.'
      );
      process.exit(1);
    }

    // --- 3. Preserve legacy columns (rollback safety) ---
    // We intentionally do NOT null out customers.pricing_rule or
    // systemSettings.pricing.defaults here. The spec's "feature flag rollback
    // must immediately restore old path" requirement is incompatible with a
    // destructive migration: if we nulled the legacy data, flipping
    // pricing.useChainResolver=false would fall back to a (now-empty) old
    // path and silently return the 30% hardcoded fallback to every customer.
    //
    // The legacy columns are kept as a parallel read-only audit trail.
    // A separate retirement migration (issued only after a successful soak
    // period under pricing.useChainResolver=true) is responsible for nulling
    // them; that migration is NOT this script.
    console.log(
      'Legacy customer.pricing_rule and systemSettings.pricing.defaults preserved (rollback safety).'
    );

    // --- 4. Flip feature flag ---
    await client.query(
      `INSERT INTO system_settings (key, value)
       VALUES ('pricing.useChainResolver', 'true'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now()`
    );

    await client.query('COMMIT');

    console.log(
      `\nMigration complete: ${migrated} customers migrated, ${skipped} skipped, 0 parity failures.`
    );
    console.log('pricing.useChainResolver → true');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
