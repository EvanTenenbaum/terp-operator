export type PricingProfileName = 'standard' | 'premium' | 'clearance';

export interface PricingProfile {
  name: PricingProfileName;
  minMarginPct: number;
  maxDiscountPct: number;
}

export interface PriceEvaluationInput {
  unitCost: number;
  basisUnitPrice: number;
  candidateUnitPrice: number;
  profile: PricingProfile;
}

export interface PriceEvaluation {
  unitPrice: number;
  minimumUnitPrice: number;
  marginPct: number;
  adjusted: boolean;
  guardrails: string[];
}

const profiles: Record<PricingProfileName, PricingProfile> = {
  standard: { name: 'standard', minMarginPct: 0.2, maxDiscountPct: 0.15 },
  premium: { name: 'premium', minMarginPct: 0.28, maxDiscountPct: 0.08 },
  clearance: { name: 'clearance', minMarginPct: 0.08, maxDiscountPct: 0.25 }
};

export function resolvePricingProfile(strategy: string, customerTags: string[] = []): PricingProfile {
  if (strategy === 'premium') return profiles.premium;
  if (strategy === 'clearance') return profiles.clearance;
  if (customerTags.includes('premium')) return profiles.premium;
  if (customerTags.includes('value')) return profiles.clearance;
  return profiles.standard;
}

export function evaluatePrice(input: PriceEvaluationInput): PriceEvaluation {
  const vendorFloor = input.unitCost;
  const marginFloor = input.unitCost * (1 + input.profile.minMarginPct);
  const discountFloor = input.basisUnitPrice * (1 - input.profile.maxDiscountPct);
  const minimumUnitPrice = Math.max(vendorFloor, marginFloor, discountFloor);
  const unitPrice = Math.max(input.candidateUnitPrice, minimumUnitPrice);
  const marginPct = unitPrice <= 0 ? 0 : (unitPrice - input.unitCost) / unitPrice;
  const guardrails: string[] = [];
  if (input.candidateUnitPrice < vendorFloor) guardrails.push('vendor_floor');
  if (input.candidateUnitPrice < marginFloor) guardrails.push('min_margin');
  if (input.candidateUnitPrice < discountFloor) guardrails.push('max_discount');
  return {
    unitPrice,
    minimumUnitPrice,
    marginPct,
    adjusted: unitPrice !== input.candidateUnitPrice,
    guardrails
  };
}
