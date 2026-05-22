import { evaluateFilterGroup } from '../../client/utils/filterEvaluator';
import type { PricingRuleApplication, PricingRuleClause, PricingRuleContext } from '../../shared/types';

/**
 * Maps PricingRuleContext to the row shape expected by evaluateFilterGroup.
 *
 * Key mapping: batchPostedPrice → 'unitPrice'
 * This matches the FILTER_FIELDS key used in condition definitions.
 * The field is called 'batchPostedPrice' in PricingRuleContext to avoid confusion
 * with the output price of the rule itself.
 */
export function buildContextRow(ctx: PricingRuleContext): Record<string, unknown> {
  return {
    category: ctx.category ?? null,
    subcategory: ctx.subcategory ?? null,
    tags: ctx.tags ?? [],
    unitPrice: ctx.batchPostedPrice ?? null,  // renamed externally, maps back to filter field name
    unitCost: ctx.unitCost ?? null,
  };
}

/**
 * Resolves the effective pricing rule for an inventory line.
 *
 * Evaluation pipeline (must be called AFTER COGS is resolved):
 *   allocate → COGS resolve → build PricingRuleContext → resolvePricingRuleClause → guardrail clamp
 *
 * Evaluation order:
 *   1. Active customer clauses, ascending by priority
 *   2. Active global clauses, ascending by priority
 *   3. Hardcoded fallback: 30% percent markup
 *
 * Clauses with conditions = null always match (catch-all).
 * Null field values (e.g., subcategory = null) evaluate to false for equality conditions.
 */
export function resolvePricingRuleClause(
  customerClauses: PricingRuleClause[],
  globalClauses: PricingRuleClause[],
  context: PricingRuleContext
): PricingRuleApplication {
  const row = buildContextRow(context);

  const isActive = (c: PricingRuleClause) => c.active;
  const byPriority = (a: PricingRuleClause, b: PricingRuleClause) => a.priority - b.priority;

  for (const clause of [...customerClauses].filter(isActive).sort(byPriority)) {
    if (clause.conditions === null || evaluateFilterGroup(row, clause.conditions)) {
      return {
        basis: clause.actionBasis,
        amount: clause.actionAmount,
        source: 'customer-clause',
        clauseId: clause.id,
        clauseName: clause.name,
      };
    }
  }

  for (const clause of [...globalClauses].filter(isActive).sort(byPriority)) {
    if (clause.conditions === null || evaluateFilterGroup(row, clause.conditions)) {
      return {
        basis: clause.actionBasis,
        amount: clause.actionAmount,
        source: 'global-clause',
        clauseId: clause.id,
        clauseName: clause.name,
      };
    }
  }

  return { basis: 'percent', amount: 0.30, source: 'fallback' };
}
