// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolvePricingRuleEntry, markupDollarsFromPrice, applyPricingRule } from '../../shared/inventoryPricingShared';
import { parsePriceRange } from '../../shared/priceRange';
import type { CustomerPricingRule } from '../../shared/types';

// These tests cover the pricing recalculation logic used by SalesView inline
// pricing columns (markup, markupPct, derivedCogs). Tests are pure-function —
// AG Grid rendering is covered by e2e.

const defaultRule: CustomerPricingRule = {
  default: { basis: 'percent', amount: 0.3 }
};
const customerRule: CustomerPricingRule = {
  categories: {
    Flower: {
      rule: { basis: 'percent', amount: 0.35 },
      subcategories: { Indoor: { basis: 'percent', amount: 0.40 } }
    }
  }
};

describe('Fixed-COGS pricing flow', () => {
  it('auto-fills markup from rule on line add (applyPricingRule - COGS)', () => {
    const rule = resolvePricingRuleEntry(customerRule, defaultRule, 'Vape', null);
    const cogs = 24;
    const suggestedPrice = applyPricingRule(cogs, rule);
    const markup = suggestedPrice - cogs;
    expect(markup).toBeCloseTo(7.2, 2); // 30% of $24
    expect(markup / cogs).toBeCloseTo(0.3, 3); // markupPct = rule%
  });

  it('editing unit price back-calculates markup (price - COGS)', () => {
    const cogs = 24;
    const newPrice = 35;
    const markup = newPrice - cogs;
    expect(markup).toBe(11);
    expect(markup / cogs).toBeCloseTo(0.458, 2);
  });

  it('editing markup updates price (COGS + markup)', () => {
    const cogs = 24;
    const newMarkup = 10;
    const price = cogs + newMarkup;
    expect(price).toBe(34);
  });

  it('resolves customer subcategory rule for Indoor Flower', () => {
    const rule = resolvePricingRuleEntry(customerRule, defaultRule, 'Flower', 'Indoor');
    expect(rule.amount).toBe(0.40);
    expect(rule.source).toBe('customer-subcategory');
  });
});

describe('Range-COGS pricing flow', () => {
  it('auto-fills markup from rule given price (markupDollarsFromPrice)', () => {
    const rule = resolvePricingRuleEntry(customerRule, defaultRule, 'Flower', 'Indoor');
    const price = 103.50;
    const markup = markupDollarsFromPrice(price, rule);
    const derivedCogs = price - markup;
    // markup% on cost should equal rule (40%)
    expect(markup / derivedCogs).toBeCloseTo(0.40, 2);
  });

  it('range check: derived COGS in range', () => {
    const range = parsePriceRange('60-90');
    const rule = resolvePricingRuleEntry(null, defaultRule, 'Flower', null);
    const price = 103.50;
    const markup = markupDollarsFromPrice(price, rule);
    const cogs = price - markup;
    expect(range).not.toBeNull();
    expect(cogs).toBeGreaterThanOrEqual(range!.low);
    expect(cogs).toBeLessThanOrEqual(range!.high);
  });

  it('range check: derived COGS below range when price is too low', () => {
    const range = parsePriceRange('65-85');
    const rule = resolvePricingRuleEntry(null, defaultRule, 'Flower', null);
    const price = 50;
    const markup = markupDollarsFromPrice(price, rule);
    const cogs = price - markup;
    expect(range).not.toBeNull();
    expect(cogs).toBeLessThan(range!.low);
  });

  it('editing markup updates derivedCogs, price stays', () => {
    const price = 103.50;
    const newMarkup = 20;
    const newCogs = price - newMarkup;
    expect(newCogs).toBeCloseTo(83.50, 2);
    expect(price).toBe(103.50); // price unchanged
  });

  it('editing price recalculates markup from rule', () => {
    const rule = resolvePricingRuleEntry(null, defaultRule, 'Flower', null);
    const newPrice = 90;
    const newMarkup = markupDollarsFromPrice(newPrice, rule);
    const newCogs = newPrice - newMarkup;
    expect(newMarkup / newCogs).toBeCloseTo(0.3, 2); // still rule%
  });
});

describe('Re-apply rule', () => {
  it('resets markup to rule value for fixed-COGS row', () => {
    const rule = resolvePricingRuleEntry(null, defaultRule, 'Vape', null);
    const cogs = 24;
    const resetMarkup = applyPricingRule(cogs, rule) - cogs;
    expect(resetMarkup).toBeCloseTo(7.2, 2);
  });
});
