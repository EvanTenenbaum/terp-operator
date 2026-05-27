import { describe, expect, it } from 'vitest';
import {
  applyPricingRule,
  asCustomerPricingRule,
  pricingRuleEntryFromUnknown,
  resolvePricingRuleEntry
} from './pricing';

describe('resolvePricingRuleEntry', () => {
  it('picks customer-category when customer has matching category override', () => {
    const result = resolvePricingRuleEntry(
      { categories: { Flower: { rule: { basis: 'percent', amount: 0.4 } } }, default: { basis: 'percent', amount: 0.25 } },
      { default: { basis: 'percent', amount: 0.3 } },
      'Flower'
    );
    expect(result).toEqual({ basis: 'percent', amount: 0.4, source: 'customer-category', category: 'Flower' });
  });

  it('falls back to customer-default when customer has no matching category', () => {
    const result = resolvePricingRuleEntry(
      { categories: { Extract: { rule: { basis: 'dollar', amount: 50 } } }, default: { basis: 'percent', amount: 0.25 } },
      { default: { basis: 'percent', amount: 0.3 } },
      'Flower'
    );
    expect(result).toEqual({ basis: 'percent', amount: 0.25, source: 'customer-default' });
  });

  it('uses settings-category when customer has no rule and settings has matching category', () => {
    const result = resolvePricingRuleEntry(
      null,
      { categories: { Flower: { rule: { basis: 'dollar', amount: 75 } } }, default: { basis: 'percent', amount: 0.3 } },
      'Flower'
    );
    expect(result).toEqual({ basis: 'dollar', amount: 75, source: 'settings-category', category: 'Flower' });
  });

  it('falls back to settings-default when no customer rule and no settings category match', () => {
    const result = resolvePricingRuleEntry(
      null,
      { default: { basis: 'percent', amount: 0.35 } },
      'Vape'
    );
    expect(result).toEqual({ basis: 'percent', amount: 0.35, source: 'settings-default' });
  });

  it('uses 30% fallback when nothing is set', () => {
    const result = resolvePricingRuleEntry(null, null, undefined);
    expect(result).toEqual({ basis: 'percent', amount: 0.3, source: 'fallback' });
  });

  it('treats undefined category as no category match', () => {
    const result = resolvePricingRuleEntry(
      { categories: { Flower: { rule: { basis: 'percent', amount: 0.4 } } } },
      { default: { basis: 'percent', amount: 0.3 } },
      undefined
    );
    expect(result.source).toBe('settings-default');
  });
});

describe('applyPricingRule', () => {
  it('applies percent markup to landed cost', () => {
    expect(applyPricingRule(100, { basis: 'percent', amount: 0.3, source: 'fallback' })).toBe(130);
  });

  it('applies dollar markup to landed cost', () => {
    expect(applyPricingRule(100, { basis: 'dollar', amount: 25, source: 'fallback' })).toBe(125);
  });

  it('returns 0 for invalid landed cost', () => {
    expect(applyPricingRule(NaN, { basis: 'percent', amount: 0.3, source: 'fallback' })).toBe(0);
    expect(applyPricingRule(-1, { basis: 'percent', amount: 0.3, source: 'fallback' })).toBe(0);
  });

  it('preserves 0 landed cost with zero markup', () => {
    expect(applyPricingRule(0, { basis: 'percent', amount: 0.3, source: 'fallback' })).toBe(0);
  });
});

describe('asCustomerPricingRule', () => {
  it('returns rule for an object with default', () => {
    const rule = asCustomerPricingRule({ default: { basis: 'percent', amount: 0.3 } });
    expect(rule?.default?.basis).toBe('percent');
  });

  it('returns rule for an object with categories', () => {
    const rule = asCustomerPricingRule({ categories: { Flower: { rule: { basis: 'percent', amount: 0.4 } } } });
    expect(rule?.categories?.Flower?.rule?.amount).toBe(0.4);
  });

  it('returns null for empty objects', () => {
    expect(asCustomerPricingRule({})).toBeNull();
  });

  it('returns null for non-objects', () => {
    expect(asCustomerPricingRule(null)).toBeNull();
    expect(asCustomerPricingRule('rule')).toBeNull();
    expect(asCustomerPricingRule(0)).toBeNull();
  });
});

describe('pricingRuleEntryFromUnknown', () => {
  it('accepts valid percent entry', () => {
    expect(pricingRuleEntryFromUnknown({ basis: 'percent', amount: 0.3 })).toEqual({ basis: 'percent', amount: 0.3 });
  });

  it('accepts valid dollar entry', () => {
    expect(pricingRuleEntryFromUnknown({ basis: 'dollar', amount: 25 })).toEqual({ basis: 'dollar', amount: 25 });
  });

  it('rejects invalid basis', () => {
    expect(pricingRuleEntryFromUnknown({ basis: 'multiplier', amount: 1.5 })).toBeNull();
  });

  it('rejects negative amount', () => {
    expect(pricingRuleEntryFromUnknown({ basis: 'percent', amount: -0.1 })).toBeNull();
  });

  it('rejects NaN amount', () => {
    expect(pricingRuleEntryFromUnknown({ basis: 'percent', amount: 'huh' })).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(pricingRuleEntryFromUnknown(null)).toBeNull();
    expect(pricingRuleEntryFromUnknown(42)).toBeNull();
  });
});
