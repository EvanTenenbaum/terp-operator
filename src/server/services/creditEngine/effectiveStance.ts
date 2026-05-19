export interface ResolveStanceInput {
  customerStanceId: string | null;
  globalDefaultStanceId: string;
}

export function resolveEffectiveStanceId(input: ResolveStanceInput): string {
  if (!input.globalDefaultStanceId) {
    throw new Error('globalDefaultStanceId is required');
  }
  return input.customerStanceId ?? input.globalDefaultStanceId;
}
