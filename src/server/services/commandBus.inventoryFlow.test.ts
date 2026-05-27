import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from './__tests__/inMemoryDbMock';

const BATCH_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORDER_ID    = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_ID     = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_ID     = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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

function seedBatch(overrides: Record<string, unknown> = {}) {
  inMemoryState.batches.push({
    id: BATCH_ID, name: 'Mendo Breath',
    availableQty: '10.000', reservedQty: '0.000',
    ownershipStatus: 'OFC', vendorId: null,
    unitCost: '1000.00', status: 'posted',
    updatedAt: new Date(),
    ...overrides,
  });
}

beforeEach(() => { resetInMemoryState(inMemoryState); });
afterEach(() => { vi.clearAllMocks(); });

describe('adjustBatchQuantity', () => {
  it('increments availableQty exactly by deltaQty', async () => {
    seedBatch({ availableQty: '10.000' });
    const result = await executeCommand(
      { name: 'adjustBatchQuantity', payload: { batchId: BATCH_ID, deltaQty: 5, reason: 'recount' }, idempotencyKey: 'k1', reason: 'recount' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.batches[0].availableQty).toBe('15.000');
    expect(inMemoryState.commandJournal[0].status).toBe('ok');
  });

  it('decrements availableQty exactly by negative deltaQty', async () => {
    seedBatch({ availableQty: '10.000' });
    const result = await executeCommand(
      { name: 'adjustBatchQuantity', payload: { batchId: BATCH_ID, deltaQty: -3, reason: 'damage' }, idempotencyKey: 'k2', reason: 'damage' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.batches[0].availableQty).toBe('7.000');
  });

  it('blocks adjustment that would send qty below zero', async () => {
    seedBatch({ availableQty: '2.000' });
    const result = await executeCommand(
      { name: 'adjustBatchQuantity', payload: { batchId: BATCH_ID, deltaQty: -5, reason: 'write-off' }, idempotencyKey: 'k3', reason: 'write-off' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('Available quantity cannot go below zero');
  });

  it('requires a reason — rejects with the full traceable message', async () => {
    seedBatch();
    const result = await executeCommand(
      { name: 'adjustBatchQuantity', payload: { batchId: BATCH_ID, deltaQty: 1 }, idempotencyKey: 'k4', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('Adjustment reason is required so inventory corrections stay traceable');
  });
});

describe('setInventoryStatus', () => {
  it('changes batch status from posted to held', async () => {
    seedBatch({ status: 'posted' });
    const result = await executeCommand(
      { name: 'setInventoryStatus', payload: { batchId: BATCH_ID, status: 'held' }, idempotencyKey: 'k5', reason: 'QC hold' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.batches[0].status).toBe('held');
    expect(inMemoryState.commandJournal[0].status).toBe('ok');
  });

  it('is idempotent — returns ok with unchanged:true when status is already the target', async () => {
    seedBatch({ status: 'held' });
    const result = await executeCommand(
      { name: 'setInventoryStatus', payload: { batchId: BATCH_ID, status: 'held' }, idempotencyKey: 'k6', reason: 'QC hold' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect((result as any).delta?.unchanged).toBe(true);
  });

  it('rejects an invalid status string with the canonical message', async () => {
    seedBatch({ status: 'posted' });
    const result = await executeCommand(
      { name: 'setInventoryStatus', payload: { batchId: BATCH_ID, status: 'garbage' }, idempotencyKey: 'k7', reason: 'test' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('Inventory status must be posted, held, damaged, returned, or in_transit');
  });
});

describe('reserveInventoryForOrder', () => {
  function seedOrderWithLine(availableQty: string, reservedQty: string, lineQty: string) {
    seedBatch({ availableQty, reservedQty });
    inMemoryState.salesOrders.push({
      id: ORDER_ID, orderNo: 'SO-001', status: 'open',
      customerId: null, total: '0.00', updatedAt: new Date(),
    });
    inMemoryState.salesOrderLines.push({
      id: LINE_ID, orderId: ORDER_ID, batchId: BATCH_ID,
      itemName: 'Mendo Breath', qty: lineQty,
      status: 'open', updatedAt: new Date(),
    });
  }

  it('increments batch.reservedQty exactly by line.qty and marks line as reserved', async () => {
    seedOrderWithLine('10.000', '0.000', '3.000');
    const result = await executeCommand(
      { name: 'reserveInventoryForOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k8', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.batches[0].reservedQty).toBe('3.000');
    expect(inMemoryState.salesOrderLines[0].status).toBe('reserved');
    expect(inMemoryState.commandJournal[0].status).toBe('ok');
  });

  it('blocks reservation when (availableQty - reservedQty) < lineQty', async () => {
    // available=3, reserved=2 → net 1, but line wants 5
    seedOrderWithLine('3.000', '2.000', '5.000');
    const result = await executeCommand(
      { name: 'reserveInventoryForOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k9', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('short on available quantity');
  });

  it('skips already-reserved lines without double-incrementing reservedQty', async () => {
    seedOrderWithLine('10.000', '3.000', '3.000');
    inMemoryState.salesOrderLines[0].status = 'reserved';
    const result = await executeCommand(
      { name: 'reserveInventoryForOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k10', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    // reservedQty must NOT increase again — stays at the seeded 3.000
    expect(inMemoryState.batches[0].reservedQty).toBe('3.000');
  });
});
