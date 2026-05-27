import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from './__tests__/inMemoryDbMock';

const PO_ID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENDOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_ID  = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_ID  = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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

function seedDraftPO() {
  inMemoryState.vendors.push({ id: VENDOR_ID, name: 'Summit Genetics', alias: 'SG' });
  inMemoryState.purchaseOrders.push({
    id: PO_ID, poNo: 'PO-TEST-001', vendorId: VENDOR_ID, status: 'draft',
    paymentTerms: 'cod', prepaymentAmount: '0.00', total: '1200.00',
    expectedDate: null, orderedAt: null, finalizedAt: null,
    buyerNotes: null, internalNotes: null, externalNotes: null,
    refereeRelationshipId: null, refereeCreditAmount: null,
  });
  inMemoryState.purchaseOrderLines.push({
    id: LINE_ID, purchaseOrderId: PO_ID,
    productName: 'Mendo Breath', category: 'Flower', subcategory: null,
    tags: [], qty: '1.000', receivedQty: '0.000', uom: 'lb',
    unitCost: '1200.00', unitPrice: '1800.00',
    costRangeLow: null, costRangeHigh: null, sourceCode: null,
    shorthand: null, legacyMarker: null, ownershipStatus: 'UNKNOWN',
    notes: null, internalNotes: null, externalNotes: null, status: 'planned',
    itemId: null,
  });
}

beforeEach(() => { resetInMemoryState(inMemoryState); });
afterEach(() => { vi.clearAllMocks(); });

describe('finalizePurchaseOrder', () => {
  it('transitions a draft PO to finalized status', async () => {
    seedDraftPO();
    const result = await executeCommand(
      { name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.purchaseOrders[0].status).toBe('finalized');
    expect(inMemoryState.purchaseOrders[0].finalizedAt).toBeTruthy();
  });

  it('rejects finalization of a non-draft PO', async () => {
    seedDraftPO();
    inMemoryState.purchaseOrders[0].status = 'approved';
    const result = await executeCommand(
      { name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k2', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('Only draft purchase orders can be finalized');
  });

  it('rejects finalization when there are no lines', async () => {
    seedDraftPO();
    inMemoryState.purchaseOrderLines.length = 0;
    const result = await executeCommand(
      { name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k3', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(false);
    expect(result.toast).toContain('Add at least one product line before finalizing');
  });

  it('allows unfinalize back to draft', async () => {
    seedDraftPO();
    inMemoryState.purchaseOrders[0].status = 'finalized';
    inMemoryState.purchaseOrders[0].finalizedAt = new Date();
    const result = await executeCommand(
      { name: 'unfinalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k4', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.purchaseOrders[0].status).toBe('draft');
    expect(inMemoryState.purchaseOrders[0].finalizedAt).toBeNull();
  });

  it('unfinalize is idempotent on already-draft PO', async () => {
    seedDraftPO();
    const result = await executeCommand(
      { name: 'unfinalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k5', reason: '' } as any,
      operatorUser, ioStub
    );
    expect(result.ok).toBe(true);
    expect(inMemoryState.purchaseOrders[0].status).toBe('draft');
  });
});
