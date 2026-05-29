import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from './__tests__/inMemoryDbMock';

const ORDER_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUSTOMER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BATCH_ID    = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LINE_ID     = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FL_ID       = 'ffffffff-ffff-4fff-8fff-ffffffffffff'; // fulfillmentLine ID
const USER_ID     = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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
const ioStub = { emit: () => {}, to: () => ({ emit: () => {} }) } as any;

/**
 * Seed a minimal valid sales order ready to be confirmed.
 * pricingStrategy 'margin' → standard profile (minMargin 20%).
 * unitPrice=1500, unitCost=1000 → 33% margin, safely above 20% guardrail.
 */
function seedConfirmableOrder(overrides: {
  balance?: string;
  creditLimit?: string;
  orderStatus?: string;
  lineQty?: string;
} = {}) {
  const balance     = overrides.balance     ?? '0.00';
  const creditLimit = overrides.creditLimit ?? '50000.00';
  const orderStatus = overrides.orderStatus ?? 'open';
  const lineQty     = overrides.lineQty     ?? '2.000';

  inMemoryState.customers.push({
    id: CUSTOMER_ID, name: 'Test Co',
    balance, creditLimit, tags: [], updatedAt: new Date(),
  });
  inMemoryState.batches.push({
    id: BATCH_ID, name: 'Mendo Breath',
    availableQty: '20.000', reservedQty: '0.000',
    ownershipStatus: 'OFC', vendorId: null,
    unitCost: '1000.00', status: 'posted', updatedAt: new Date(),
  });
  inMemoryState.salesOrders.push({
    id: ORDER_ID, orderNo: 'SO-001',
    status: orderStatus, customerId: CUSTOMER_ID,
    total: '0.00', pricingStrategy: 'margin',
    inventoryPosted: false, updatedAt: new Date(),
  });
  inMemoryState.salesOrderLines.push({
    id: LINE_ID, orderId: ORDER_ID,
    itemName: 'Mendo Breath', qty: lineQty,
    unitPrice: '1500.00', unitCost: '1000.00',
    unitCostResolved: true, batchId: BATCH_ID,
    sourceRowKey: null, status: 'open',
    exceptionStatus: null, belowFloorReason: null,
    vendorApprovalState: 'none', priceFloor: null,
    validationIssues: [], updatedAt: new Date(),
  });
}

beforeEach(() => { resetInMemoryState(inMemoryState); });
afterEach(() => { vi.clearAllMocks(); });

// ---------------------------------------------------------------------------
// confirmSalesOrder
// ---------------------------------------------------------------------------

describe('confirmSalesOrder', () => {
  it('sets order status to confirmed and writes an ok journal entry', async () => {
    seedConfirmableOrder();
    const result = await executeCommand(
      { name: 'confirmSalesOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k1', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.salesOrders[0].status).toBe('confirmed');
    // commandJournal entry must be finalized as 'ok'
    expect(inMemoryState.commandJournal.length).toBe(1);
    expect(inMemoryState.commandJournal[0].status).toBe('ok');
    expect(inMemoryState.commandJournal[0].commandName).toBe('confirmSalesOrder');
  });

  it('blocks confirmation when customer would exceed credit limit', async () => {
    // balance 4800 + order total (2×1500=3000) = 7800 > creditLimit 5000
    seedConfirmableOrder({ balance: '4800.00', creditLimit: '5000.00' });
    const result = await executeCommand(
      { name: 'confirmSalesOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k2', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('credit limit');
  });

  it('blocks confirmation when there are no lines', async () => {
    seedConfirmableOrder();
    inMemoryState.salesOrderLines.length = 0;
    const result = await executeCommand(
      { name: 'confirmSalesOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k3', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('at least one line');
  });

  it('blocks confirmation when a line has unresolved COGS', async () => {
    seedConfirmableOrder();
    inMemoryState.salesOrderLines[0].unitCostResolved = false;
    const result = await executeCommand(
      { name: 'confirmSalesOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k4', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('unresolved landed COGS');
  });
});

// ---------------------------------------------------------------------------
// postSalesOrder
// ---------------------------------------------------------------------------

describe('postSalesOrder', () => {
  it('sets order status to posted, decrements batch qty by exactly line qty, and increments customer balance by exact order total', async () => {
    seedConfirmableOrder({ orderStatus: 'confirmed' });
    inMemoryState.salesOrders[0].total = '3000.00'; // 2 × 1500

    const result = await executeCommand(
      { name: 'postSalesOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k5', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.salesOrders[0].status).toBe('posted');
    // batch.availableQty 20 − line.qty 2 = 18 exactly
    expect(inMemoryState.batches[0].availableQty).toBe('18.000');
    // customer balance 0 + order total 3000 = 3000.00 exactly (TER-1566 Decimal path)
    expect(inMemoryState.customers[0].balance).toBe('3000.00');
    // journal entry finalized
    expect(inMemoryState.commandJournal[0].status).toBe('ok');
  });

  it('blocks posting an already-posted order', async () => {
    seedConfirmableOrder({ orderStatus: 'posted' });
    const result = await executeCommand(
      { name: 'postSalesOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k7', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('already posted');
  });

  it('blocks posting an order that is not confirmed', async () => {
    seedConfirmableOrder({ orderStatus: 'draft' });
    const result = await executeCommand(
      { name: 'postSalesOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k8', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('confirmed before posting');
  });

  it('blocks posting when batch has insufficient available qty', async () => {
    seedConfirmableOrder({ orderStatus: 'confirmed', lineQty: '100.000' });
    // batch only has 20.000 available
    const result = await executeCommand(
      { name: 'postSalesOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k9', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('enough available quantity');
  });
});

// ---------------------------------------------------------------------------
// cancelSalesOrder
// ---------------------------------------------------------------------------

describe('cancelSalesOrder', () => {
  it('sets order to cancelled and releases batch reservation when no lines are released for picking', async () => {
    seedConfirmableOrder({ orderStatus: 'confirmed' });
    inMemoryState.batches[0].reservedQty = '2.000';
    inMemoryState.salesOrderLines[0].batchId = BATCH_ID;
    inMemoryState.salesOrderLines[0].pickReleasedAt = null; // not released

    const result = await executeCommand(
      { name: 'cancelSalesOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k10', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.salesOrders[0].status).toBe('cancelled');
    // reservedQty released: 2 - 2 = 0
    expect(Number(inMemoryState.batches[0].reservedQty)).toBe(0);
    expect(inMemoryState.commandJournal[0].status).toBe('ok');
  });

  it('blocks cancel when a pick-released line has already been picked (actualQty > 0)', async () => {
    seedConfirmableOrder({ orderStatus: 'confirmed' });
    // Mark line as pick-released
    inMemoryState.salesOrderLines[0].pickReleasedAt = new Date();
    // Seed a fulfillment line with actualQty > 0 (already picked)
    if (!inMemoryState._dynamic) inMemoryState._dynamic = {};
    if (!inMemoryState._dynamic['fulfillment_lines']) inMemoryState._dynamic['fulfillment_lines'] = [];
    inMemoryState._dynamic['fulfillment_lines'].push({
      id: FL_ID, orderLineId: LINE_ID,
      actualQty: '1.000', statusExtended: 'in_progress',
      warehouseAlerts: [],
    });

    const result = await executeCommand(
      { name: 'cancelSalesOrder', payload: { orderId: ORDER_ID }, idempotencyKey: 'k11', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toMatch(/picked.*Return picked units|Return picked units|has already been picked/i);
  });
});
