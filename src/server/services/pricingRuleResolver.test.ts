import { describe, it, expect } from 'vitest';
import { resolvePricingRuleClause, buildContextRow } from './pricingRuleResolver';
import type { PricingRuleClause, PricingRuleContext } from '../../shared/types';

function makeClause(overrides: Partial<PricingRuleClause> & Pick<PricingRuleClause, 'conditions'>): PricingRuleClause {
  return {
    id: 'test-id',
    scope: 'customer',
    customerId: 'cust-1',
    priority: 1,
    name: null,
    actionBasis: 'percent',
    actionAmount: 0.30,
    active: true,
    ...overrides,
  };
}

const ctx: PricingRuleContext = {
  category: 'Flower',
  subcategory: 'indoor',
  tags: ['premium'],
  batchPostedPrice: 1200,
  unitCost: 780,
};

describe('resolvePricingRuleClause', () => {
  it('matches customer clause by category', () => {
    const clause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'category', operator: 'equals', value: 'Flower' }] }
    });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('customer-clause');
    expect(result.basis).toBe('percent');
    expect(result.amount).toBe(0.30);
    expect(result.clauseId).toBe('test-id');
  });

  it('matches customer clause by subcategory', () => {
    const clause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'subcategory', operator: 'equals', value: 'indoor' }] }
    });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('customer-clause');
  });

  it('matches customer clause by tag', () => {
    const clause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'tags', operator: 'array_contains', value: ['premium'] }] }
    });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('customer-clause');
  });

  it('matches customer clause by price range (unitPrice = batchPostedPrice)', () => {
    const clause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'unitPrice', operator: 'between', value: [1000, 1500] }] }
    });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('customer-clause');
  });

  it('skips non-matching customer clause and falls through to global', () => {
    const customerClause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'category', operator: 'equals', value: 'Extract' }] }
    });
    const globalClause = makeClause({
      scope: 'global',
      customerId: null,
      conditions: null,
      actionAmount: 0.20,
      actionBasis: 'percent',
    });
    const result = resolvePricingRuleClause([customerClause], [globalClause], ctx);
    expect(result.source).toBe('global-clause');
    expect(result.amount).toBe(0.20);
  });

  it('returns hardcoded fallback when nothing matches', () => {
    const result = resolvePricingRuleClause([], [], ctx);
    expect(result.source).toBe('fallback');
    expect(result.basis).toBe('percent');
    expect(result.amount).toBe(0.30);
  });

  it('catch-all clause (conditions=null) always matches', () => {
    const clause = makeClause({ conditions: null, actionAmount: 0.25 });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('customer-clause');
    expect(result.amount).toBe(0.25);
  });

  it('skips inactive clauses', () => {
    const inactive = makeClause({ conditions: null, actionAmount: 0.99, active: false });
    const result = resolvePricingRuleClause([inactive], [], ctx);
    expect(result.source).toBe('fallback');
  });

  it('null subcategory does NOT match subcategory equals condition', () => {
    const clause = makeClause({
      conditions: { logic: 'AND', conditions: [{ field: 'subcategory', operator: 'equals', value: 'indoor' }] }
    });
    const noSubcatCtx: PricingRuleContext = { category: 'Flower', subcategory: null, tags: [] };
    const result = resolvePricingRuleClause([clause], [], noSubcatCtx);
    expect(result.source).toBe('fallback');
  });

  it('evaluates clauses in priority order — lower priority wins', () => {
    const prio1 = makeClause({ priority: 1, conditions: null, actionAmount: 0.10 });
    const prio2 = makeClause({ priority: 2, conditions: null, actionAmount: 0.20 });
    // Input is out of order — should still pick priority 1
    const result = resolvePricingRuleClause([prio2, prio1], [], ctx);
    expect(result.amount).toBe(0.10);
  });

  it('AND clause requires ALL conditions to match', () => {
    const clause = makeClause({
      conditions: {
        logic: 'AND',
        conditions: [
          { field: 'category', operator: 'equals', value: 'Flower' },
          { field: 'subcategory', operator: 'equals', value: 'outdoor' }, // ctx has 'indoor', not 'outdoor'
        ]
      }
    });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.source).toBe('fallback'); // AND fails
  });

  it('clauseId and clauseName are included in result', () => {
    const clause = makeClause({ id: 'my-clause-id', name: 'Flower premium rule', conditions: null });
    const result = resolvePricingRuleClause([clause], [], ctx);
    expect(result.clauseId).toBe('my-clause-id');
    expect(result.clauseName).toBe('Flower premium rule');
  });
});

describe('buildContextRow', () => {
  it('maps batchPostedPrice to unitPrice key', () => {
    const row = buildContextRow({ batchPostedPrice: 1200, unitCost: 780, category: 'Flower' });
    expect(row.unitPrice).toBe(1200);
    expect(row.unitCost).toBe(780);
    expect(row.category).toBe('Flower');
  });

  it('handles null/missing fields gracefully', () => {
    const row = buildContextRow({});
    expect(row.category).toBeNull();
    expect(row.subcategory).toBeNull();
    expect(row.tags).toEqual([]);
    expect(row.unitPrice).toBeNull();
    expect(row.unitCost).toBeNull();
  });
});
