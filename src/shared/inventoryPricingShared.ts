import type { CustomerPricingRule, CategoryPricingEntry, PricingRuleApplication, PricingRuleEntry } from './types';

/** Resolve the pricing rule entry for a given category+subcategory pair.
 *  Resolution order (7 levels):
 *  1. customer subcategory
 *  2. customer category rule
 *  3. customer default
 *  4. settings subcategory
 *  5. settings category rule
 *  6. settings default
 *  7. fallback 30%
 */
export function resolvePricingRuleEntry(
  customerRule: CustomerPricingRule | null | undefined,
  defaultsRule: CustomerPricingRule | null | undefined,
  category: string | null | undefined,
  subcategory: string | null | undefined = null
): PricingRuleApplication {
  const cat = category ?? undefined;
  const sub = subcategory ?? undefined;

  // Helper: reads a CategoryPricingEntry from a categories map,
  // transparently upgrading the old flat PricingRuleEntry shape
  // ({ basis, amount } stored directly) to the new nested shape.
  function getEntry(
    categories: Record<string, unknown> | undefined,
    key: string
  ): CategoryPricingEntry | null {
    if (!categories || !key || !(key in categories)) return null;
    const raw = categories[key];
    if (!raw || typeof raw !== 'object') return null;
    // Old flat shape: { basis, amount } — wrap transparently
    if ('basis' in raw && 'amount' in raw) return { rule: raw as PricingRuleEntry };
    return raw as CategoryPricingEntry;
  }

  if (cat) {
    // 1. customer subcategory
    if (sub) {
      const entry = getEntry(
        customerRule?.categories as Record<string, unknown> | undefined,
        cat
      );
      const subRule = entry?.subcategories?.[sub];
      if (subRule) {
        return { ...subRule, source: 'customer-subcategory', category: cat, subcategory: sub };
      }
    }
    // 2. customer category rule
    const custCatEntry = getEntry(
      customerRule?.categories as Record<string, unknown> | undefined,
      cat
    );
    if (custCatEntry?.rule) {
      return { ...custCatEntry.rule, source: 'customer-category', category: cat };
    }
  }

  // 3. customer default
  if (customerRule?.default) {
    return { ...customerRule.default, source: 'customer-default' };
  }

  if (cat) {
    // 4. settings subcategory
    if (sub) {
      const entry = getEntry(
        defaultsRule?.categories as Record<string, unknown> | undefined,
        cat
      );
      const subRule = entry?.subcategories?.[sub];
      if (subRule) {
        return { ...subRule, source: 'settings-subcategory', category: cat, subcategory: sub };
      }
    }
    // 5. settings category rule
    const settingsCatEntry = getEntry(
      defaultsRule?.categories as Record<string, unknown> | undefined,
      cat
    );
    if (settingsCatEntry?.rule) {
      return { ...settingsCatEntry.rule, source: 'settings-category', category: cat };
    }
  }

  // 6. settings default
  if (defaultsRule?.default) {
    return { ...defaultsRule.default, source: 'settings-default' };
  }

  // 7. fallback
  return { basis: 'percent', amount: 0.3, source: 'fallback' };
}

/** Apply a pricing rule to a landed COGS to get the suggested sale price.
 *  For fixed-COGS batches where COGS is the primary input.
 */
export function applyPricingRule(
  landedCost: number,
  rule: PricingRuleApplication | PricingRuleEntry
): number {
  if (!Number.isFinite(landedCost) || landedCost < 0) return 0;
  if (rule.basis === 'dollar') return landedCost + rule.amount;
  return landedCost * (1 + rule.amount);
}

/** For range-COGS batches where unit price is the primary input:
 *  returns the markup dollars that keep markup-on-cost consistent with the rule.
 *
 *  Formula: markup$ = price × (rule% / (1 + rule%))
 *
 *  This ensures: derivedCOGS = price - markup$
 *               markupPct = markup$ / COGS = rule%  ← consistent with fixed-COGS rows
 *
 *  For dollar-basis rules, markup$ = rule.amount (flat).
 */
export function markupDollarsFromPrice(
  price: number,
  rule: PricingRuleApplication | PricingRuleEntry
): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (rule.basis === 'dollar') return rule.amount;
  return price * (rule.amount / (1 + rule.amount));
}
