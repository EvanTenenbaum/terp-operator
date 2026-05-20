import { describe, it, expect } from 'vitest';
import { resolveEffectiveStanceId } from './effectiveStance';

describe('resolveEffectiveStanceId', () => {
  it('returns the customer override when set', () => {
    expect(resolveEffectiveStanceId({
      customerStanceId: 'cust-stance-uuid',
      globalDefaultStanceId: 'global-uuid'
    })).toBe('cust-stance-uuid');
  });
  it('returns the global default when customer override is null', () => {
    expect(resolveEffectiveStanceId({
      customerStanceId: null,
      globalDefaultStanceId: 'global-uuid'
    })).toBe('global-uuid');
  });
  it('throws if global default is missing', () => {
    expect(() => resolveEffectiveStanceId({
      customerStanceId: null,
      globalDefaultStanceId: null as unknown as string
    })).toThrow('globalDefaultStanceId is required');
  });
});
