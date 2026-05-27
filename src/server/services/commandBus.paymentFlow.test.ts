import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from './__tests__/inMemoryDbMock';

const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID     = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const { inMemoryState } = vi.hoisted(() => ({
  inMemoryState: {
    purchaseOrders: [], purchaseOrderLines: [], vendors: [],
    documentSnapshots: [], commandJournal: [], advisoryLocks: [],
    salesOrders: [], salesOrderLines: [], batches: [], customers: [],
    payments: [], clientLedgerEntries: [], vendorBills: [],
  } as InMemoryState
}));

vi.mock('../db', () => {
  const mocked = makeMockedDb(inMemoryState);
  return { db: mocked.db, pool: { query: async () => ({ rows: [] }) } };
});

import { executeCommand } from './commandBus';
import type { SessionUser } from '../../shared/types';

const operatorUser: SessionUser = {
  id: USER_ID, name: 'Op', role: 'owner', email: 'owner@terpagro.local'
} as unknown as SessionUser;
const ioStub = { emit: () => {} } as any;

function seedCustomer(balance = '0.00', creditLimit = '10000.00') {
  inMemoryState.customers.push({
    id: CUSTOMER_ID, name: 'Test Co', balance, creditLimit,
    tags: [], updatedAt: new Date(),
  });
}

beforeEach(() => { resetInMemoryState(inMemoryState); });
afterEach(() => { vi.clearAllMocks(); });

describe('logPayment', () => {
  it('inserts a payment record with status posted and finalizes journal', async () => {
    seedCustomer();
    const result = await executeCommand(
      { name: 'logPayment', payload: { customerId: CUSTOMER_ID, amount: 500, method: 'cash' }, idempotencyKey: 'k1', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.payments.length).toBe(1);
    expect(inMemoryState.payments[0].status).toBe('posted');
    expect(inMemoryState.payments[0].amount).toBe('500.00');
    expect(inMemoryState.payments[0].customerId).toBe(CUSTOMER_ID);
    expect(inMemoryState.commandJournal[0].status).toBe('ok');
  });

  it('rejects zero-amount payment', async () => {
    seedCustomer();
    const result = await executeCommand(
      { name: 'logPayment', payload: { customerId: CUSTOMER_ID, amount: 0 }, idempotencyKey: 'k2', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('Payment amount cannot be zero');
  });

  it('negative amount (buyer credit) decrements customer balance exactly and inserts a down_payment ledger entry', async () => {
    seedCustomer('200.00');
    const result = await executeCommand(
      { name: 'logPayment', payload: { customerId: CUSTOMER_ID, amount: -50, method: 'adjustment' }, idempotencyKey: 'k3', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.customers[0].balance).toBe('150.00');
    const creditEntry = inMemoryState.clientLedgerEntries.find(
      (e) => e.kind === 'down_payment'
    );
    expect(creditEntry).toBeTruthy();
    expect(creditEntry!.balanceAfter).toBe('150.00');
  });

  it('returns ok:false when customer is not found', async () => {
    const result = await executeCommand(
      { name: 'logPayment', payload: { customerId: CUSTOMER_ID, amount: 100 }, idempotencyKey: 'k4', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('Customer not found');
  });
});

describe('applyClientCredit', () => {
  it('decrements customer balance by the credit amount exactly', async () => {
    seedCustomer('200.00');
    const result = await executeCommand(
      { name: 'applyClientCredit', payload: { customerId: CUSTOMER_ID, amount: 50, reason: 'goodwill' }, idempotencyKey: 'k5', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.customers[0].balance).toBe('150.00');
    expect(inMemoryState.commandJournal[0].status).toBe('ok');
  });

  it('inserts a client ledger entry with kind credit and correct balanceAfter', async () => {
    seedCustomer('200.00');
    await executeCommand(
      { name: 'applyClientCredit', payload: { customerId: CUSTOMER_ID, amount: 50, reason: 'courtesy' }, idempotencyKey: 'k6', reason: '' } as any,
      operatorUser, ioStub
    );
    const entry = inMemoryState.clientLedgerEntries.find((e) => e.kind === 'credit');
    expect(entry).toBeTruthy();
    expect(entry!.customerId).toBe(CUSTOMER_ID);
    expect(entry!.balanceAfter).toBe('150.00');
  });

  it('balance math is decimal-precise (avoids IEEE 754 drift)', async () => {
    seedCustomer('200.00');
    await executeCommand(
      { name: 'applyClientCredit', payload: { customerId: CUSTOMER_ID, amount: 50.01, reason: 'test' }, idempotencyKey: 'k7', reason: '' } as any,
      operatorUser, ioStub
    );
    // 200.00 - 50.01 = 149.99 exactly (Decimal arithmetic, not floating-point)
    expect(inMemoryState.customers[0].balance).toBe('149.99');
  });

  it('returns ok:false when customer is not found', async () => {
    const result = await executeCommand(
      { name: 'applyClientCredit', payload: { customerId: CUSTOMER_ID, amount: 50, reason: 'x' }, idempotencyKey: 'k8', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('Customer not found');
  });
});
