import { describe, expect, it } from 'vitest';
import {
  customerPricingRuleSchema,
  pricingRuleEntrySchema,
  setCustomerPricingRulePayloadSchema,
  setDefaultPricingRulePayloadSchema,
  setLineLandedCostPayloadSchema
} from '../shared/schemas';

describe('pricingRuleEntrySchema', () => {
  it('accepts a valid percent entry as decimal markup', () => {
    expect(pricingRuleEntrySchema.parse({ basis: 'percent', amount: 0.3 })).toEqual({ basis: 'percent', amount: 0.3 });
  });

  it('coerces numeric strings', () => {
    expect(pricingRuleEntrySchema.parse({ basis: 'dollar', amount: '12.50' })).toEqual({ basis: 'dollar', amount: 12.5 });
  });

  it('rejects negative amount', () => {
    expect(() => pricingRuleEntrySchema.parse({ basis: 'percent', amount: -0.1 })).toThrow();
  });

  it('rejects unknown basis', () => {
    expect(() => pricingRuleEntrySchema.parse({ basis: 'multiplier', amount: 1 })).toThrow();
  });

  it('rejects percent amount of 30 (operator typed "30%" instead of 0.30)', () => {
    // amount is a decimal multiplier; 30 would be a 3000% markup.
    expect(() => pricingRuleEntrySchema.parse({ basis: 'percent', amount: 30 })).toThrow();
  });

  it('accepts percent amount of 0.30 (= 30% markup)', () => {
    expect(pricingRuleEntrySchema.parse({ basis: 'percent', amount: 0.3 }).amount).toBe(0.3);
  });

  it('accepts percent at the maximum of 2.00 (= 200% markup)', () => {
    expect(pricingRuleEntrySchema.parse({ basis: 'percent', amount: 2 }).amount).toBe(2);
  });

  it('accepts a large dollar amount', () => {
    expect(pricingRuleEntrySchema.parse({ basis: 'dollar', amount: 5000 }).amount).toBe(5000);
  });

  it('rejects dollar amount above 100000', () => {
    expect(() => pricingRuleEntrySchema.parse({ basis: 'dollar', amount: 100001 })).toThrow();
  });

  it('rejects malformed amount string', () => {
    expect(() => pricingRuleEntrySchema.parse({ basis: 'percent', amount: 'not-a-number' })).toThrow();
  });
});

describe('customerPricingRuleSchema', () => {
  it('accepts default + categories', () => {
    const parsed = customerPricingRuleSchema.parse({
      default: { basis: 'percent', amount: 0.3 },
      categories: { Flower: { basis: 'dollar', amount: 100 } }
    });
    expect(parsed.default?.amount).toBe(0.3);
    expect(parsed.categories?.Flower?.amount).toBe(100);
  });

  it('accepts empty rule (clears the rule)', () => {
    expect(customerPricingRuleSchema.parse({})).toEqual({});
  });

  it('rejects malformed nested default entry (NaN amount)', () => {
    expect(() =>
      customerPricingRuleSchema.parse({
        default: { basis: 'percent', amount: 'not-a-number' }
      })
    ).toThrow();
  });

  it('rejects malformed nested category entry', () => {
    expect(() =>
      customerPricingRuleSchema.parse({
        categories: { Flower: { basis: 'multiplier', amount: 1 } }
      })
    ).toThrow();
  });
});

describe('setLineLandedCostPayloadSchema', () => {
  it('defaults basis to manual when absent', () => {
    const parsed = setLineLandedCostPayloadSchema.parse({
      lineId: '11111111-1111-1111-1111-111111111111',
      landedCost: 50
    });
    expect(parsed.basis).toBe('manual');
  });

  it('rejects negative landed cost', () => {
    expect(() =>
      setLineLandedCostPayloadSchema.parse({
        lineId: '11111111-1111-1111-1111-111111111111',
        landedCost: -1
      })
    ).toThrow();
  });

  it('rejects non-uuid lineId', () => {
    expect(() =>
      setLineLandedCostPayloadSchema.parse({ lineId: 'not-a-uuid', landedCost: 50 })
    ).toThrow();
  });

  it('accepts the "override" basis', () => {
    const parsed = setLineLandedCostPayloadSchema.parse({
      lineId: '11111111-1111-1111-1111-111111111111',
      landedCost: 50,
      basis: 'override'
    });
    expect(parsed.basis).toBe('override');
  });
});

describe('setCustomerPricingRulePayloadSchema', () => {
  it('requires customerId uuid', () => {
    expect(() =>
      setCustomerPricingRulePayloadSchema.parse({ customerId: 'x', pricingRule: {} })
    ).toThrow();
  });

  it('accepts valid payload', () => {
    expect(
      setCustomerPricingRulePayloadSchema.parse({
        customerId: '11111111-1111-1111-1111-111111111111',
        pricingRule: { default: { basis: 'percent', amount: 0.25 } }
      }).pricingRule.default?.amount
    ).toBe(0.25);
  });
});

describe('setDefaultPricingRulePayloadSchema', () => {
  it('accepts an empty rule', () => {
    expect(setDefaultPricingRulePayloadSchema.parse({ pricingRule: {} }).pricingRule).toEqual({});
  });
});
