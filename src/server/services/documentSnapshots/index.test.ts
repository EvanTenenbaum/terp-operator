import { describe, it, expect } from 'vitest';
import { getProjectionFor, hasProjectionFor } from './index';

describe('projection registry', () => {
  it('exposes a projection for purchase_order', () => {
    expect(hasProjectionFor('purchase_order')).toBe(true);
    const p = getProjectionFor('purchase_order');
    expect(typeof p.projectExternal).toBe('function');
    expect(typeof p.renderPlainTextExternal).toBe('function');
    expect(typeof p.renderPlainTextInternal).toBe('function');
    expect(Array.isArray(p.EXTERNAL_FIELDS)).toBe(true);
    expect(typeof p.PROJECTION_VERSION).toBe('number');
  });
  it('returns false for not-yet-registered document types', () => {
    expect(hasProjectionFor('sales_order')).toBe(false);
    expect(hasProjectionFor('customer_payment')).toBe(false);
    expect(hasProjectionFor('vendor_payout')).toBe(false);
  });
  it('throws a clear error when no projection is registered', () => {
    expect(() => getProjectionFor('sales_order' as any)).toThrow(/sales_order/);
  });
});
