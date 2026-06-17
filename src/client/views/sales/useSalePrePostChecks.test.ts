/**
 * useSalePrePostChecks unit tests — AC-10 from sales-view-refactor.md.
 *
 * Covers:
 *   (a) empty customer returns { checks: [], issuesByLineId: new Map() }
 *   (b) missing order returns { checks: [], issuesByLineId: new Map() }
 *   (c) provided order + customer returns checks array
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { useSalePrePostChecks, type UseSalePrePostChecksArgs } from './useSalePrePostChecks';
import type { SalePrePostLine } from '../../components/SalePrePostStrip';

import { renderHook } from '@testing-library/react';

function makeLine(overrides: Partial<SalePrePostLine> = {}): SalePrePostLine {
  return {
    id: 'line-1',
    unitPrice: 100,
    unitCost: 50,
    qty: 1,
    batchCode: 'BATCH-001',
    batchCategory: 'Flower',
    batchSubcategory: 'Indica',
    ...overrides,
  } as unknown as SalePrePostLine;
}

describe('useSalePrePostChecks', () => {
  it('returns empty checks and empty map when order is null', () => {
    const args: UseSalePrePostChecksArgs = {
      selectedOrder: null,
      customer: { balance: 0, creditLimit: 0 },
      lines: [makeLine()],
    };
    const { result } = renderHook(() => useSalePrePostChecks(args));
    expect(result.current.checks).toEqual([]);
    expect(result.current.issuesByLineId).toBeInstanceOf(Map);
    expect(result.current.issuesByLineId.size).toBe(0);
  });

  it('returns empty checks and empty map when customer is null', () => {
    const args: UseSalePrePostChecksArgs = {
      selectedOrder: { total: 500 },
      customer: null,
      lines: [makeLine()],
    };
    const { result } = renderHook(() => useSalePrePostChecks(args));
    expect(result.current.checks).toEqual([]);
    expect(result.current.issuesByLineId).toBeInstanceOf(Map);
    expect(result.current.issuesByLineId.size).toBe(0);
  });

  it('returns empty checks and empty map when lines is empty', () => {
    const args: UseSalePrePostChecksArgs = {
      selectedOrder: { total: 500 },
      customer: { balance: 0, creditLimit: 1000 },
      lines: [],
    };
    const { result } = renderHook(() => useSalePrePostChecks(args));
    expect(result.current.checks).toEqual([]);
    expect(result.current.issuesByLineId).toBeInstanceOf(Map);
    expect(result.current.issuesByLineId.size).toBe(0);
  });

  it('returns checks array when order and customer are provided', () => {
    const args: UseSalePrePostChecksArgs = {
      selectedOrder: { total: 500 },
      customer: { balance: 0, creditLimit: 1000 },
      lines: [makeLine(), makeLine({ id: 'line-2' })],
    };
    const { result } = renderHook(() => useSalePrePostChecks(args));
    expect(Array.isArray(result.current.checks)).toBe(true);
    expect(result.current.issuesByLineId).toBeInstanceOf(Map);
  });
});
