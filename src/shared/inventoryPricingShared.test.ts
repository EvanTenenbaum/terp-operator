import { describe, it, expect } from 'vitest';
import { resolvePricingRuleEntry, markupDollarsFromPrice } from './inventoryPricingShared';
import type { CustomerPricingRule } from './types';

describe('resolvePricingRuleEntry — subcategory resolution', () => {
  const rule: CustomerPricingRule = {
    default: { basis: 'percent', amount: 0.3 },
    categories: {
      Flower: {
        rule: { basis: 'percent', amount: 0.35 },
        subcategories: { Indoor: { basis: 'percent', amount: 0.40 } }
      }
    }
  };

  it('resolves customer subcategory first', () => {
    const result = resolvePricingRuleEntry(rule, null, 'Flower', 'Indoor');
    expect(result.amount).toBe(0.40);
    expect(result.source).toBe('customer-subcategory');
    expect(result.category).toBe('Flower');
    expect(result.subcategory).toBe('Indoor');
  });

  it('falls through to category rule when subcategory not found', () => {
    const result = resolvePricingRuleEntry(rule, null, 'Flower', 'Greenhouse');
    expect(result.amount).toBe(0.35);
    expect(result.source).toBe('customer-category');
  });

  it('falls through to default when no category rule', () => {
    const result = resolvePricingRuleEntry(rule, null, 'Vape', null);
    expect(result.amount).toBe(0.3);
    expect(result.source).toBe('customer-default');
  });

  it('resolves settings subcategory when no customer match', () => {
    const settings: CustomerPricingRule = {
      categories: { Flower: { subcategories: { Indoor: { basis: 'percent', amount: 0.38 } } } }
    };
    const result = resolvePricingRuleEntry(null, settings, 'Flower', 'Indoor');
    expect(result.amount).toBe(0.38);
    expect(result.source).toBe('settings-subcategory');
    expect(result.category).toBe('Flower');
    expect(result.subcategory).toBe('Indoor');
  });

  it('returns fallback when nothing matches', () => {
    const result = resolvePricingRuleEntry(null, null, null, null);
    expect(result.source).toBe('fallback');
    expect(result.amount).toBe(0.3);
  });
});

describe('markupDollarsFromPrice', () => {
  it('converts percent rule to markup dollars given price (markup-on-cost consistent)', () => {
    // rule 30%, price $100 → markup = 100 × (0.30/1.30) ≈ 23.08, COGS ≈ 76.92, markup% on COGS = 30%
    const markup = markupDollarsFromPrice(100, { basis: 'percent', amount: 0.3, source: 'fallback' });
    expect(markup).toBeCloseTo(23.077, 2);
  });

  it('returns flat dollar amount for dollar-basis rule', () => {
    const markup = markupDollarsFromPrice(100, { basis: 'dollar', amount: 8, source: 'fallback' });
    expect(markup).toBe(8);
  });

  it('returns 0 for invalid price', () => {
    const markup = markupDollarsFromPrice(NaN, { basis: 'percent', amount: 0.3, source: 'fallback' });
    expect(markup).toBe(0);
  });

  it('returns 0 for zero price', () => {
    const markup = markupDollarsFromPrice(0, { basis: 'percent', amount: 0.3, source: 'fallback' });
    expect(markup).toBe(0);
  });

  it('returns 0 for negative price', () => {
    const markup = markupDollarsFromPrice(-10, { basis: 'percent', amount: 0.3, source: 'fallback' });
    expect(markup).toBe(0);
  });
});
