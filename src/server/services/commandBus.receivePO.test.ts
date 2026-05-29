import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryState,
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from './__tests__/inMemoryDbMock';

const PO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENDOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPERATOR_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

// vi.hoisted is required so the mock factory (which runs at module init,
// before non-import statements) can access the shared state.
const { inMemoryState } = vi.hoisted(() => ({
  inMemoryState: {
    purchaseOrders: [],
    purchaseOrderLines: [],
    vendors: [],
    documentSnapshots: [],
    commandJournal: [],
    advisoryLocks: [],
    salesOrders: [],
    salesOrderLines: [],
    batches: [],
    customers: [],
    payments: [],
    clientLedgerEntries: [],
    vendorBills: [],
  } as InMemoryState
}));

vi.mock('../db', () => {
  const mocked = makeMockedDb(inMemoryState);
  return { db: mocked.db, pool: { query: async () => ({ rows: [] }) } };
});

import { executeCommand } from './commandBus';
import type { SessionUser } from '../../shared/types';

const operatorUser: SessionUser = {
  id: OPERATOR_USER_ID, name: 'Op', role: 'owner', email: 'owner@terpagro.local'
} as unknown as SessionUser;
const ioStub = { emit: () => {}, to: () => ({ emit: () => {} }) } as any;

function seedApprovedPurchaseOrder(s: InMemoryState, paymentTerms: string, lineOwnershipStatus = 'UNKNOWN') {
  s.vendors.push({ id: VENDOR_ID, name: 'Summit Genetics', alias: 'SG' });
  s.purchaseOrders.push({
    id: PO_ID,
    poNo: 'PO-TEST-001',
    vendorId: VENDOR_ID,
    status: 'approved',
    paymentTerms,
    prepaymentAmount: '0.00',
    total: '1200.00',
    expectedDate: null,
    orderedAt: null,
    finalizedAt: null,
    buyerNotes: null,
    internalNotes: null,
    externalNotes: null,
    refereeRelationshipId: null,
    refereeCreditAmount: null
  });
  s.purchaseOrderLines.push({
    id: LINE_ID,
    purchaseOrderId: PO_ID,
    itemId: undefined,
    productName: 'Mendo Breath',
    category: 'Flower',
    subcategory: undefined,
    tags: [],
    qty: '1.000',
    receivedQty: '0.000',
    uom: 'lb',
    unitCost: '1200.00',
    unitPrice: '1800.00',
    costRangeLow: undefined,
    costRangeHigh: undefined,
    sourceCode: undefined,
    shorthand: undefined,
    legacyMarker: undefined,
    ownershipStatus: lineOwnershipStatus,
    notes: undefined,
    internalNotes: undefined,
    externalNotes: undefined,
    status: 'planned'
  });
}

beforeEach(() => {
  resetInMemoryState(inMemoryState);
  if (!inMemoryState._dynamic) inMemoryState._dynamic = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('receivePurchaseOrder — ownershipStatus inference from paymentTerms (GH #171)', () => {
  async function runReceiveAndGetBatch(paymentTerms: string, lineOwnershipStatus = 'UNKNOWN') {
    seedApprovedPurchaseOrder(inMemoryState, paymentTerms, lineOwnershipStatus);
    const result = await executeCommand({
      name: 'receivePurchaseOrder',
      payload: { purchaseOrderId: PO_ID },
      idempotencyKey: `k-${paymentTerms}-${lineOwnershipStatus}`,
      reason: 'test'
    } as any, operatorUser, ioStub);
    expect(result.ok).toBe(true);
    const batches = inMemoryState.batches ?? [];
    expect(batches.length).toBeGreaterThan(0);
    return batches[batches.length - 1];
  }

  it('paymentTerms "cod" → ownershipStatus "OFC" (operator-pays term)', async () => {
    const batch = await runReceiveAndGetBatch('cod');
    expect(batch.ownershipStatus).toBe('OFC');
  });

  it('paymentTerms "prepay" → ownershipStatus "OFC" (operator-pays term)', async () => {
    const batch = await runReceiveAndGetBatch('prepay');
    expect(batch.ownershipStatus).toBe('OFC');
  });

  it('paymentTerms "net_30" → ownershipStatus "OFC" (net_* prefix)', async () => {
    const batch = await runReceiveAndGetBatch('net_30');
    expect(batch.ownershipStatus).toBe('OFC');
  });

  it('paymentTerms "net_14" → ownershipStatus "OFC" (net_* prefix)', async () => {
    const batch = await runReceiveAndGetBatch('net_14');
    expect(batch.ownershipStatus).toBe('OFC');
  });

  it('paymentTerms "consignment" → ownershipStatus "C" (vendor retains ownership)', async () => {
    const batch = await runReceiveAndGetBatch('consignment');
    expect(batch.ownershipStatus).toBe('C');
  });

  it('paymentTerms "vendor_terms" → ownershipStatus stays "UNKNOWN" (not inferred)', async () => {
    const batch = await runReceiveAndGetBatch('vendor_terms');
    expect(batch.ownershipStatus).toBe('UNKNOWN');
  });

  it('line with explicit non-UNKNOWN ownershipStatus is preserved (not overwritten by paymentTerms)', async () => {
    // Line already has 'C' ownership; even with 'cod' payment terms, it should stay 'C'
    const batch = await runReceiveAndGetBatch('cod', 'C');
    expect(batch.ownershipStatus).toBe('C');
  });
});
