import { describe, expect, it } from 'vitest';
import {
  asCustomerPricingRule,
  computeInventoryUnitPrice,
  formatInventoryUnitCost
} from '../shared/inventoryPricing';

describe('computeInventoryUnitPrice', () => {
  it('uses fallback 30% markup when no rules are set', () => {
    const result = computeInventoryUnitPrice({
      unitCost: 100,
      priceRange: null,
      category: null,
      customerRule: null,
      defaultsRule: null
    });
    expect(result.unitPrice).toBe(130);
    expect(result.rule.source).toBe('fallback');
    expect(result.basisCost).toBe(100);
  });

  it('uses settings-default when defaults rule is provided', () => {
    const result = computeInventoryUnitPrice({
      unitCost: 100,
      priceRange: null,
      category: 'Flower',
      customerRule: null,
      defaultsRule: { default: { basis: 'percent', amount: 0.4 } }
    });
    expect(result.unitPrice).toBeCloseTo(140);
    expect(result.rule.source).toBe('settings-default');
  });

  it('uses settings-category when category matches defaults rule', () => {
    const result = computeInventoryUnitPrice({
      unitCost: 50,
      priceRange: null,
      category: 'Flower',
      customerRule: null,
      defaultsRule: {
        default: { basis: 'percent', amount: 0.3 },
        categories: { Flower: { basis: 'dollar', amount: 25 } }
      }
    });
    expect(result.unitPrice).toBe(75);
    expect(result.rule.source).toBe('settings-category');
  });

  it('falls back to price range midpoint when unit cost is missing', () => {
    const result = computeInventoryUnitPrice({
      unitCost: 0,
      priceRange: '40-60',
      category: null,
      customerRule: null,
      defaultsRule: null
    });
    expect(result.basisCost).toBe(50);
    expect(result.unitPrice).toBeCloseTo(65);
  });

  it('returns 0 when neither cost nor range is available', () => {
    const result = computeInventoryUnitPrice({
      unitCost: null,
      priceRange: null,
      category: null,
      customerRule: null,
      defaultsRule: null
    });
    expect(result.unitPrice).toBe(0);
  });

  it('handles string unit cost values', () => {
    const result = computeInventoryUnitPrice({
      unitCost: '200',
      priceRange: null,
      category: null,
      customerRule: null,
      defaultsRule: null
    });
    expect(result.unitPrice).toBe(260);
  });
});

describe('formatInventoryUnitCost', () => {
  it('formats a price range when present', () => {
    expect(formatInventoryUnitCost({ unitCost: 0, priceRange: '30-50' })).toBe('$30–$50');
  });

  it('falls back to unit cost when range is malformed', () => {
    expect(formatInventoryUnitCost({ unitCost: 42, priceRange: 'bogus' })).toBe('$42');
  });

  it('falls back to unit cost when range is absent', () => {
    expect(formatInventoryUnitCost({ unitCost: 100, priceRange: null })).toBe('$100');
  });

  it('formats decimal cost', () => {
    expect(formatInventoryUnitCost({ unitCost: 12.345, priceRange: null })).toBe('$12.35');
  });
});

describe('asCustomerPricingRule', () => {
  it('returns rule object with default', () => {
    const rule = asCustomerPricingRule({ default: { basis: 'percent', amount: 0.3 } });
    expect(rule?.default?.basis).toBe('percent');
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
