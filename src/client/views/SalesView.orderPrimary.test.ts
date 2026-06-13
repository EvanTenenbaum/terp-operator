// @vitest-environment node
/**
 * UX-T03 — SalesView order-level primary now resolves through the same §10
 * decision-table engine (resolveStatusActions) as the line-level
 * StatusActionBar. These pure-function tests pin the status→primary mapping
 * formerly hard-coded in the deleted salesPrimaryLabel/isOrderTerminal
 * helpers, so the migration is behavior-identical.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveStatusActions } from '../components/templates';
import type { GridRow } from '../../shared/types';
import { buildSalesOrderPrimaryTable, newSalePrimary } from './SalesView.orderPrimary';

function deps() {
  return { reserve: vi.fn(), priceConfirm: vi.fn() };
}

function resolveFor(status: string, hasLines = true, d = deps()) {
  const table = buildSalesOrderPrimaryTable({ hasLines, ...d });
  const row = { id: 'o1', status } as unknown as GridRow;
  return { resolved: resolveStatusActions([row], table), row, d };
}

describe('SalesView order-level primary decision table (UX-T03)', () => {
  it('confirmed order → Reserve primary runs reserve()', () => {
    const { resolved, row, d } = resolveFor('confirmed');
    expect(resolved.primary?.label).toBe('Reserve');
    expect(resolved.primary?.disabled).toBeFalsy();
    void resolved.primary?.run([row]);
    expect(d.reserve).toHaveBeenCalledTimes(1);
    expect(d.priceConfirm).not.toHaveBeenCalled();
  });

  it('draft order with lines → Price + Confirm primary runs priceConfirm()', () => {
    const { resolved, row, d } = resolveFor('draft', true);
    expect(resolved.primary?.label).toBe('Price + Confirm');
    expect(resolved.primary?.disabled).toBeFalsy();
    void resolved.primary?.run([row]);
    expect(d.priceConfirm).toHaveBeenCalledTimes(1);
    expect(d.reserve).not.toHaveBeenCalled();
  });

  it('draft order without lines → "Add first line" label, same priceConfirm path', () => {
    const { resolved, row, d } = resolveFor('draft', false);
    expect(resolved.primary?.label).toBe('Add first line');
    void resolved.primary?.run([row]);
    expect(d.priceConfirm).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['posted', 'Posted'],
    ['cancelled', 'Cancelled'],
    ['fulfilled', 'Price + Confirm']
  ])('terminal status %s → disabled primary labeled %s, runs nothing', (status, label) => {
    const { resolved, row, d } = resolveFor(status);
    expect(resolved.primary?.label).toBe(label);
    expect(resolved.primary?.disabled).toBe(true);
    expect(resolved.primary?.disabledReason).toMatch(/terminal/);
    void resolved.primary?.run([row]);
    expect(d.reserve).not.toHaveBeenCalled();
    expect(d.priceConfirm).not.toHaveBeenCalled();
  });

  it('unknown status → catch-all rule lands on the Price + Confirm path (legacy default)', () => {
    const { resolved, row, d } = resolveFor('some_future_status');
    expect(resolved.primary?.label).toBe('Price + Confirm');
    expect(resolved.reason).toBeNull();
    void resolved.primary?.run([row]);
    expect(d.priceConfirm).toHaveBeenCalledTimes(1);
  });

  it('no order selected → New Sale primary, disabled until a customer is chosen', () => {
    const createOrder = vi.fn();
    const withoutCustomer = newSalePrimary('', createOrder);
    expect(withoutCustomer.label).toBe('New Sale');
    expect(withoutCustomer.disabled).toBe(true);

    const withCustomer = newSalePrimary('cust-1', createOrder);
    expect(withCustomer.disabled).toBe(false);
    void withCustomer.run([]);
    expect(createOrder).toHaveBeenCalledTimes(1);
  });
});
