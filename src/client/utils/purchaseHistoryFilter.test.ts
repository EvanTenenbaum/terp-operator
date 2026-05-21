/**
 * Tests for purchase history filter helpers (#61).
 *
 * The Customer Purchase History disclosure surfaces line-level prior sales
 * (alias, canonical product, vendor, sale price, qty, payment terms, payment
 * status). Operators filter the table with one free-text input that narrows
 * by alias, canonical product, vendor, payment terms, and payment status.
 */
import { describe, it, expect } from 'vitest';
import {
  filterPurchaseHistory,
  type PurchaseHistoryRow
} from './purchaseHistoryFilter';

const rows: PurchaseHistoryRow[] = [
  {
    id: 'l-1',
    orderId: 'o-1',
    orderNo: 'SO-1',
    itemAlias: 'Skywalker',
    itemName: 'Skywalker OG',
    vendor: 'Acme Farms',
    unitPrice: '1200',
    qty: '5',
    paymentTerms: 'Net 14',
    paymentStatus: 'paid',
    createdAt: '2026-04-01T00:00:00Z'
  },
  {
    id: 'l-2',
    orderId: 'o-1',
    orderNo: 'SO-1',
    itemAlias: null,
    itemName: 'Wedding Cake',
    vendor: 'Bravo Gardens',
    unitPrice: '900',
    qty: '2',
    paymentTerms: 'Net 14',
    paymentStatus: 'paid',
    createdAt: '2026-04-01T00:00:00Z'
  },
  {
    id: 'l-3',
    orderId: 'o-2',
    orderNo: 'SO-2',
    itemAlias: 'Purple Punch',
    itemName: 'PP-123',
    vendor: 'Charlie Co',
    unitPrice: '800',
    qty: '10',
    paymentTerms: 'COD',
    paymentStatus: 'open',
    createdAt: '2026-04-10T00:00:00Z'
  }
];

describe('filterPurchaseHistory', () => {
  it('returns all rows when query is empty', () => {
    expect(filterPurchaseHistory(rows, '')).toHaveLength(rows.length);
  });

  it('returns all rows when query is whitespace', () => {
    expect(filterPurchaseHistory(rows, '   ')).toHaveLength(rows.length);
  });

  it('filters by product alias (case-insensitive)', () => {
    const result = filterPurchaseHistory(rows, 'skywalker');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('l-1');
  });

  it('filters by canonical product name when alias is missing', () => {
    const result = filterPurchaseHistory(rows, 'wedding');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('l-2');
  });

  it('filters by vendor', () => {
    const result = filterPurchaseHistory(rows, 'bravo');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('l-2');
  });

  it('filters by payment terms', () => {
    const result = filterPurchaseHistory(rows, 'cod');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('l-3');
  });

  it('filters by payment status', () => {
    const result = filterPurchaseHistory(rows, 'paid');
    expect(result.map((r) => r.id).sort()).toEqual(['l-1', 'l-2']);
  });

  it('AND-combines whitespace-separated terms', () => {
    const result = filterPurchaseHistory(rows, 'net acme');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('l-1');
  });

  it('returns empty when no row matches', () => {
    expect(filterPurchaseHistory(rows, 'nonsense-xyz')).toEqual([]);
  });

  it('does not throw on null/undefined optional fields', () => {
    const sparse: PurchaseHistoryRow = {
      id: 'x',
      orderId: 'o',
      orderNo: 'SO-X',
      itemAlias: null,
      itemName: '',
      vendor: null,
      unitPrice: null,
      qty: null,
      paymentTerms: null,
      paymentStatus: null,
      createdAt: ''
    };
    expect(() => filterPurchaseHistory([sparse], 'anything')).not.toThrow();
    expect(filterPurchaseHistory([sparse], '')).toHaveLength(1);
  });
});
