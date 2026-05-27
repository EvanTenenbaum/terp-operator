import { describe, expect, it } from 'vitest';
import type { CustomerPricingRule } from '../shared/types';
import {
  asCustomerPricingRule,
  computeInventoryUnitPrice,
  formatInventoryUnitCost,
  inventoryUnitCostSortValue
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
        categories: { Flower: { rule: { basis: 'dollar', amount: 25 } } }
      } as CustomerPricingRule
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

describe('inventoryUnitCostSortValue', () => {
  it('returns midpoint when a well-formed price range exists', () => {
    expect(inventoryUnitCostSortValue({ unitCost: 0, priceRange: '30-50' })).toBe(40);
  });

  it('returns numeric unit cost when no range is present', () => {
    expect(inventoryUnitCostSortValue({ unitCost: 42, priceRange: null })).toBe(42);
  });

  it('falls back to unit cost when the range string is malformed', () => {
    expect(inventoryUnitCostSortValue({ unitCost: 25, priceRange: 'bogus' })).toBe(25);
  });

  it('returns 0 when neither cost nor range is available', () => {
    expect(inventoryUnitCostSortValue({ unitCost: null, priceRange: null })).toBe(0);
  });

  it('orders a range row between two fixed-cost rows when sorted ascending', () => {
    const rows = [
      { unitCost: 100, priceRange: null },
      { unitCost: 0, priceRange: '30-50' },
      { unitCost: 20, priceRange: null }
    ];
    const sorted = [...rows].sort((a, b) => inventoryUnitCostSortValue(a) - inventoryUnitCostSortValue(b));
    expect(sorted.map((r) => inventoryUnitCostSortValue(r))).toEqual([20, 40, 100]);
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
