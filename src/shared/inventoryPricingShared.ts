import type { CustomerPricingRule, PricingRuleApplication, PricingRuleEntry } from './types';

export function resolvePricingRuleEntry(
  customerRule: CustomerPricingRule | null | undefined,
  defaultsRule: CustomerPricingRule | null | undefined,
  category: string | null | undefined
): PricingRuleApplication {
  if (customerRule?.categories && category && customerRule.categories[category]) {
    const entry = customerRule.categories[category];
    return { basis: entry.basis, amount: entry.amount, source: 'customer-category', category };
  }
  if (customerRule?.default) {
    return { basis: customerRule.default.basis, amount: customerRule.default.amount, source: 'customer-default' };
  }
  if (defaultsRule?.categories && category && defaultsRule.categories[category]) {
    const entry = defaultsRule.categories[category];
    return { basis: entry.basis, amount: entry.amount, source: 'settings-category', category };
  }
  if (defaultsRule?.default) {
    return { basis: defaultsRule.default.basis, amount: defaultsRule.default.amount, source: 'settings-default' };
  }
  return { basis: 'percent', amount: 0.3, source: 'fallback' };
}

export function applyPricingRule(landedCost: number, rule: PricingRuleApplication | PricingRuleEntry): number {
  if (!Number.isFinite(landedCost) || landedCost < 0) return 0;
  if (rule.basis === 'dollar') return landedCost + rule.amount;
  return landedCost * (1 + rule.amount);
}
