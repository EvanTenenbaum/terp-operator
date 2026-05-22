import { describe, it, expect } from 'vitest';
import { resolvePricingRuleEntry } from '../shared/inventoryPricingShared';
import { resolvePricingRuleClause } from '../server/services/pricingRuleResolver';
import type { CustomerPricingRule, PricingRuleClause } from '../shared/types';
import type { FilterGroupInput } from '../shared/filterSchemas';

/**
 * Converts a legacy CustomerPricingRule to the new clause format,
 * exactly as the migration script does.
 *
 * This mirrors pricingRuleMigration.ts > buildClausesFromLegacy():
 * - Categories sorted alphabetically (ASCII, ascending)
 * - Catch-all (conditions: null) added as last clause ONLY when customer has
 *   an explicit default — otherwise fall through to global clauses, which
 *   matches the old resolver's "no customer default → fall to settings" path.
 *
 * Key invariant (derived from old resolver analysis):
 *   resolvePricingRuleEntry traversal:
 *     customer-category → customer-default → settings-category → settings-default → fallback
 *   resolvePricingRuleClause traversal:
 *     customer clauses (asc priority) → global clauses (asc priority) → fallback
 *
 *   To preserve parity, we must NOT add a customer catch-all when rule.default
 *   is absent. Doing so would shadow global category clauses (e.g., the global
 *   Flower clause at 0.28 would be unreachable for an empty customer rule).
 */
function legacyToCustomerClauses(
  rule: CustomerPricingRule,
  _globalDefault: { basis: 'percent' | 'dollar'; amount: number }
): PricingRuleClause[] {
  const clauses: PricingRuleClause[] = [];
  let priority = 1;

  // Category entries in alphabetical order
  for (const [cat, entry] of Object.entries(rule.categories ?? {}).sort(
    ([a], [b]) => a.localeCompare(b)
  )) {
    clauses.push({
      id: `c-${priority}`,
      scope: 'customer',
      customerId: 'test-cust',
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

  // Catch-all ONLY when the customer rule has an explicit default.
  // Without a default, the old resolver falls through to settings/global;
  // we replicate that by omitting the customer catch-all and letting the
  // global clauses match instead.
  if (rule.default) {
    clauses.push({
      id: `c-${priority}`,
      scope: 'customer',
      customerId: 'test-cust',
      priority: priority,
      name: null,
      conditions: null,
      actionBasis: rule.default.basis,
      actionAmount: rule.default.amount,
      active: true,
    });
  }

  return clauses;
}

function legacyToGlobalClauses(
  rule: CustomerPricingRule
): PricingRuleClause[] {
  const clauses: PricingRuleClause[] = [];
  let priority = 1;

  for (const [cat, entry] of Object.entries(rule.categories ?? {}).sort(
    ([a], [b]) => a.localeCompare(b)
  )) {
    clauses.push({
      id: `g-${priority}`,
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

  // Global catch-all
  const defaultEntry = rule.default ?? { basis: 'percent' as const, amount: 0.30 };
  clauses.push({
    id: `g-default`,
    scope: 'global',
    customerId: null,
    priority: priority,
    name: null,
    conditions: null,
    actionBasis: defaultEntry.basis,
    actionAmount: defaultEntry.amount,
    active: true,
  });

  return clauses;
}

// System-wide global defaults (represents systemSettings pricing.defaults)
const GLOBAL_DEFAULTS: CustomerPricingRule = {
  default: { basis: 'percent', amount: 0.30 },
  categories: {
    Flower: { basis: 'percent', amount: 0.28 },
  },
};

const globalClauses = legacyToGlobalClauses(GLOBAL_DEFAULTS);
const globalDefaultEntry = GLOBAL_DEFAULTS.default!;

// All legacy rule shapes to test
const FIXTURES: Array<{ label: string; rule: CustomerPricingRule }> = [
  { label: 'empty rule {}', rule: {} },
  {
    label: 'default only',
    rule: { default: { basis: 'percent', amount: 0.25 } },
  },
  {
    label: 'categories only — Flower',
    rule: { categories: { Flower: { basis: 'percent', amount: 0.35 } } },
  },
  {
    label: 'categories only — Flower + Extract',
    rule: {
      categories: {
        Flower: { basis: 'percent', amount: 0.35 },
        Extract: { basis: 'dollar', amount: 10 },
      },
    },
  },
  {
    label: 'categories + default',
    rule: {
      categories: { Flower: { basis: 'percent', amount: 0.35 } },
      default: { basis: 'percent', amount: 0.22 },
    },
  },
  {
    label: 'dollar default',
    rule: { default: { basis: 'dollar', amount: 50 } },
  },
  {
    label: 'all 5 standard categories + default',
    rule: {
      categories: {
        Flower: { basis: 'percent', amount: 0.35 },
        Extract: { basis: 'percent', amount: 0.30 },
        Infused: { basis: 'percent', amount: 0.32 },
        'Pre-roll': { basis: 'percent', amount: 0.22 },
        Vape: { basis: 'percent', amount: 0.28 },
      },
      default: { basis: 'percent', amount: 0.25 },
    },
  },
  {
    label: 'high margin 50%',
    rule: { default: { basis: 'percent', amount: 0.50 } },
  },
  {
    label: 'very low margin 5%',
    rule: { default: { basis: 'percent', amount: 0.05 } },
  },
  {
    label: 'dollar markup per category',
    rule: {
      categories: { Flower: { basis: 'dollar', amount: 200 } },
      default: { basis: 'percent', amount: 0.30 },
    },
  },
  {
    label: 'mismatched basis: categories $ default %',
    rule: {
      categories: { Extract: { basis: 'dollar', amount: 15 } },
      default: { basis: 'percent', amount: 0.28 },
    },
  },
  // Additional shapes — spec requires ≥20 fixture shapes to be sure the
  // legacy → clause migration is faithful for every realistic stored rule.
  {
    label: 'fractional percent (0.123)',
    rule: { default: { basis: 'percent', amount: 0.123 } },
  },
  {
    label: 'zero default percent',
    rule: { default: { basis: 'percent', amount: 0 } },
  },
  {
    label: 'zero dollar default',
    rule: { default: { basis: 'dollar', amount: 0 } },
  },
  {
    label: 'Flower zero, default 30%',
    rule: {
      categories: { Flower: { basis: 'percent', amount: 0 } },
      default: { basis: 'percent', amount: 0.3 },
    },
  },
  {
    label: 'Extract only — no default',
    rule: { categories: { Extract: { basis: 'percent', amount: 0.4 } } },
  },
  {
    label: 'Vape + Pre-roll, no default',
    rule: {
      categories: {
        Vape: { basis: 'percent', amount: 0.31 },
        'Pre-roll': { basis: 'percent', amount: 0.22 },
      },
    },
  },
  {
    label: 'unicode category name',
    rule: {
      categories: { 'Café': { basis: 'percent', amount: 0.25 } },
      default: { basis: 'percent', amount: 0.3 },
    },
  },
  {
    label: 'large dollar markup',
    rule: { default: { basis: 'dollar', amount: 1000 } },
  },
  {
    label: 'high-precision numeric (4 decimals)',
    rule: { default: { basis: 'percent', amount: 0.2533 } },
  },
  {
    label: 'mixed bases, one category $, multiple % categories',
    rule: {
      categories: {
        Flower: { basis: 'percent', amount: 0.28 },
        Extract: { basis: 'dollar', amount: 12 },
        Infused: { basis: 'percent', amount: 0.31 },
      },
      default: { basis: 'percent', amount: 0.3 },
    },
  },
];

// Context categories to test per fixture
const TEST_CATEGORIES = [
  'Flower',
  'Extract',
  'Infused',
  'Pre-roll',
  'Vape',
  '__unknown_category__',
  '',
  null as unknown as string,
];

describe('Migration parity: resolvePricingRuleEntry == resolvePricingRuleClause', () => {
  for (const fixture of FIXTURES) {
    const customerClauses = legacyToCustomerClauses(fixture.rule, globalDefaultEntry);

    for (const category of TEST_CATEGORIES) {
      it(`"${fixture.label}" / category=${JSON.stringify(category)}`, () => {
        // Old resolver
        const oldResult = resolvePricingRuleEntry(
          fixture.rule,
          GLOBAL_DEFAULTS,
          category
        );

        // New resolver
        const newResult = resolvePricingRuleClause(
          customerClauses,
          globalClauses,
          { category }
        );

        expect(newResult.amount).toBe(oldResult.amount);
        expect(newResult.basis).toBe(oldResult.basis);
      });
    }
  }
});
