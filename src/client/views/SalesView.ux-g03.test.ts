// @vitest-environment node
/**
 * UX-G03 — daily-surface reachability for setDeliveryWindow and
 * applyClientCredit in the Sales workspace.
 */
import { describe, it, expect } from 'vitest';
import {
  applyCreditDisabledReason,
  buildApplyCreditPayload,
  salesOrderCellCommand,
} from './SalesView.ux-g03';

const ORDER_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';

describe('salesOrderCellCommand (UX-G03 — setDeliveryWindow inline commit)', () => {
  it('returns the setDeliveryWindow command for a deliveryWindow edit', () => {
    const command = salesOrderCellCommand('deliveryWindow', ORDER_ID, 'Fri 2–4pm');
    expect(command).not.toBeNull();
    expect(command!.name).toBe('setDeliveryWindow');
    expect(command!.payload).toEqual({ orderId: ORDER_ID, deliveryWindow: 'Fri 2–4pm' });
  });

  it('ignores edits on other fields', () => {
    expect(salesOrderCellCommand('status', ORDER_ID, 'posted')).toBeNull();
    expect(salesOrderCellCommand(undefined, ORDER_ID, 'x')).toBeNull();
  });

  it('ignores empty values (schema requires a non-empty string)', () => {
    expect(salesOrderCellCommand('deliveryWindow', ORDER_ID, '')).toBeNull();
    expect(salesOrderCellCommand('deliveryWindow', ORDER_ID, '   ')).toBeNull();
    expect(salesOrderCellCommand('deliveryWindow', ORDER_ID, null)).toBeNull();
  });

  it('ignores rows without an order id', () => {
    expect(salesOrderCellCommand('deliveryWindow', '', 'Fri')).toBeNull();
    expect(salesOrderCellCommand('deliveryWindow', undefined, 'Fri')).toBeNull();
  });
});

describe('applyCreditDisabledReason (UX-G03 — manager-gated tray verb)', () => {
  it('requires manager or owner role', () => {
    expect(applyCreditDisabledReason('operator', CUSTOMER_ID, '50')).toMatch(/Manager role required/);
    expect(applyCreditDisabledReason('viewer', CUSTOMER_ID, '50')).toMatch(/Manager role required/);
    expect(applyCreditDisabledReason(undefined, CUSTOMER_ID, '50')).toMatch(/Manager role required/);
  });

  it('requires a selected customer', () => {
    expect(applyCreditDisabledReason('manager', '', '50')).toBe('Pick a customer first');
  });

  it('requires a non-zero numeric amount', () => {
    expect(applyCreditDisabledReason('manager', CUSTOMER_ID, '')).toMatch(/non-zero credit amount/);
    expect(applyCreditDisabledReason('manager', CUSTOMER_ID, '0')).toMatch(/non-zero credit amount/);
    expect(applyCreditDisabledReason('manager', CUSTOMER_ID, 'abc')).toMatch(/non-zero credit amount/);
  });

  it('returns null (enabled) for manager and owner with valid inputs', () => {
    expect(applyCreditDisabledReason('manager', CUSTOMER_ID, '50')).toBeNull();
    expect(applyCreditDisabledReason('owner', CUSTOMER_ID, '12.5')).toBeNull();
  });
});

describe('buildApplyCreditPayload (UX-G03)', () => {
  it('matches applyClientCreditPayloadSchema shape: customerId + numeric amount', () => {
    expect(buildApplyCreditPayload(CUSTOMER_ID, '50', '')).toEqual({
      customerId: CUSTOMER_ID,
      amount: 50,
    });
  });

  it('includes the reason only when non-empty', () => {
    expect(buildApplyCreditPayload(CUSTOMER_ID, '25', ' goodwill ')).toEqual({
      customerId: CUSTOMER_ID,
      amount: 25,
      reason: 'goodwill',
    });
    expect('reason' in buildApplyCreditPayload(CUSTOMER_ID, '25', '   ')).toBe(false);
  });
});
