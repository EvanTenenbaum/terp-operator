// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { GridRow } from '../../shared/types';
import { filterSalesOrdersByCustomer } from './SalesView.columns';

// TER-1617 F-23: Sales Orders pane customer scope
// Tests the pure filter helper that backs the customer-scope feature in SalesView.

const makeOrder = (id: string, customerId: string): GridRow =>
  ({ id, customerId, orderNo: `ORD-${id}`, status: 'draft' }) as unknown as GridRow;

const CUSTOMER_A = 'aaaa-aaaa-aaaa';
const CUSTOMER_B = 'bbbb-bbbb-bbbb';

const allOrders: GridRow[] = [
  makeOrder('1', CUSTOMER_A),
  makeOrder('2', CUSTOMER_A),
  makeOrder('3', CUSTOMER_B),
  makeOrder('4', CUSTOMER_B),
  makeOrder('5', CUSTOMER_B),
];

describe('filterSalesOrdersByCustomer (TER-1617 F-23)', () => {
  it('returns all rows unchanged when activeCustomerId is null', () => {
    const result = filterSalesOrdersByCustomer(allOrders, null);
    expect(result).toHaveLength(5);
    expect(result).toBe(allOrders); // same reference — no copy when unfiltered
  });

  it('returns all rows when activeCustomerId is an empty string', () => {
    const result = filterSalesOrdersByCustomer(allOrders, '');
    expect(result).toHaveLength(5);
  });

  it('scopes rows to the matching customer', () => {
    const result = filterSalesOrdersByCustomer(allOrders, CUSTOMER_A);
    expect(result).toHaveLength(2);
    expect(result.every((r) => String(r.customerId) === CUSTOMER_A)).toBe(true);
  });

  it('scopes rows to a different customer', () => {
    const result = filterSalesOrdersByCustomer(allOrders, CUSTOMER_B);
    expect(result).toHaveLength(3);
    expect(result.every((r) => String(r.customerId) === CUSTOMER_B)).toBe(true);
  });

  it('returns empty array when no orders match the active customer', () => {
    const result = filterSalesOrdersByCustomer(allOrders, 'no-match');
    expect(result).toHaveLength(0);
  });

  it('handles rows with no customerId gracefully (treated as empty string)', () => {
    const rowsWithMissing: GridRow[] = [
      makeOrder('6', ''),
      { id: '7', orderNo: 'ORD-7', status: 'draft' } as unknown as GridRow, // no customerId field
    ];
    const result = filterSalesOrdersByCustomer(rowsWithMissing, CUSTOMER_A);
    expect(result).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const before = allOrders.slice();
    filterSalesOrdersByCustomer(allOrders, CUSTOMER_A);
    expect(allOrders).toEqual(before);
  });

  // Chip dismissal is modelled by passing null as the activeCustomerId — the
  // caller (SalesView) sets activeCustomerId to null when customerFilterDismissed
  // is true so the chip × clears the filter without deselecting the customer.
  it('shows all orders when the caller passes null (chip dismissed)', () => {
    const result = filterSalesOrdersByCustomer(allOrders, null);
    expect(result).toHaveLength(5);
  });
});
