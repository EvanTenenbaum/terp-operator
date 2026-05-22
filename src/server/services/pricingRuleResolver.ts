// Re-exported from shared so both server-side code and client-side components can use it.
// The resolver has no server-only dependencies and was moved to shared/ in TER-1558.
export { buildContextRow, resolvePricingRuleClause } from '../../shared/pricingRuleResolver';
