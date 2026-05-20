import { describe, it, expect } from 'vitest';
import { isColdStartReady } from './coldStart';

const defaults = { minPostedInvoices: 3, minTenureDays: 60 };

describe('isColdStartReady', () => {
  it('returns false when no invoices and no tenure', () => {
    expect(isColdStartReady({ postedInvoiceCount: 0, tenureDays: 0, computedBase: 0, config: defaults })).toBe(false);
  });
  it('returns false when tenure met but no invoices', () => {
    expect(isColdStartReady({ postedInvoiceCount: 0, tenureDays: 60, computedBase: 0, config: defaults })).toBe(false);
  });
  it('returns false when invoices met but tenure not yet', () => {
    expect(isColdStartReady({ postedInvoiceCount: 5, tenureDays: 30, computedBase: 5000, config: defaults })).toBe(false);
  });
  it('returns false when invoices and tenure met but base is 0', () => {
    expect(isColdStartReady({ postedInvoiceCount: 5, tenureDays: 90, computedBase: 0, config: defaults })).toBe(false);
  });
  it('returns true when all three conditions met', () => {
    expect(isColdStartReady({ postedInvoiceCount: 3, tenureDays: 60, computedBase: 1, config: defaults })).toBe(true);
    expect(isColdStartReady({ postedInvoiceCount: 100, tenureDays: 1000, computedBase: 50000, config: defaults })).toBe(true);
  });
  it('honors config overrides', () => {
    const config = { minPostedInvoices: 5, minTenureDays: 90 };
    expect(isColdStartReady({ postedInvoiceCount: 4, tenureDays: 100, computedBase: 1000, config })).toBe(false);
    expect(isColdStartReady({ postedInvoiceCount: 5, tenureDays: 90, computedBase: 1000, config })).toBe(true);
  });
  it('throws on negative inputs', () => {
    expect(() => isColdStartReady({ postedInvoiceCount: -1, tenureDays: 0, computedBase: 0, config: defaults })).toThrow();
    expect(() => isColdStartReady({ postedInvoiceCount: 0, tenureDays: -1, computedBase: 0, config: defaults })).toThrow();
    expect(() => isColdStartReady({ postedInvoiceCount: 0, tenureDays: 0, computedBase: -1, config: defaults })).toThrow();
  });
});
