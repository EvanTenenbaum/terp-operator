/**
 * UX-H04 / BE-009 — Execution Decision 5 (2026-06-12): partial PO receiving.
 *
 * Covers the receivePurchaseOrder `lineQuantities` extension end-to-end on the
 * shared in-memory DB mock (no live database):
 *   - partial drafts a batch for the requested qty and marks line lineage
 *   - over-asks (incl. net of pending drafts) are rejected, never capped
 *   - postPurchaseReceipt accumulates receivedQty, keeps the PO open as
 *     'partially_received', bills only the received qty, and preserves the
 *     ordered PO total until receiving completes
 *   - completing the remainder flips line + PO to 'received' with the legacy
 *     receivedAt stamp and received-value total recompute
 *   - the legacy full-receive path (payload without lineQuantities) is
 *     byte-for-byte unchanged
 *   - idempotency-key replay does not draft duplicates
 *   - reversal of an unposted partial restores prior receive progress
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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

function seedApprovedPurchaseOrder(s: InMemoryState) {
  s.vendors.push({ id: VENDOR_ID, name: 'Summit Genetics', alias: 'SG', termsDays: 14 });
  s.purchaseOrders.push({
    id: PO_ID,
    poNo: 'PO-TEST-001',
    vendorId: VENDOR_ID,
    status: 'approved',
    paymentTerms: 'cod',
    prepaymentAmount: '0.00',
    total: '12000.00',
    expectedDate: null,
    orderedAt: null,
    receivedAt: null,
    finalizedAt: null,
    internalNotes: null,
    buyerNotes: null,
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
    qty: '10.000',
    receivedQty: '0.000',
    uom: 'lb',
    unitCost: '1200.00',
    unitPrice: '1800.00',
    costRangeLow: undefined,
    costRangeHigh: undefined,
    sourceCode: undefined,
    shorthand: undefined,
    legacyMarker: undefined,
    ownershipStatus: 'UNKNOWN',
    notes: undefined,
    internalNotes: undefined,
    externalNotes: undefined,
    status: 'planned'
  });
}

async function run(name: string, payload: Record<string, unknown>, key: string) {
  return executeCommand({ name, payload, idempotencyKey: key, reason: 'test' } as any, operatorUser, ioStub);
}

function poRow() {
  return inMemoryState.purchaseOrders.find((o) => o.id === PO_ID) as Record<string, unknown>;
}
function lineRow() {
  return inMemoryState.purchaseOrderLines.find((l) => l.id === LINE_ID) as Record<string, unknown>;
}
function lineBatches() {
  return (inMemoryState.batches ?? []).filter((b) => b.purchaseOrderLineId === LINE_ID);
}

async function partialReceive(qty: number, key: string) {
  return run('receivePurchaseOrder', { purchaseOrderId: PO_ID, lineQuantities: { [LINE_ID]: qty } }, key);
}

async function postDraftBatches(key: string) {
  const draftIds = lineBatches()
    .filter((b) => b.status === 'draft')
    .map((b) => String(b.id));
  return run('postPurchaseReceipt', { batchIds: draftIds }, key);
}

beforeEach(() => {
  resetInMemoryState(inMemoryState);
  if (!inMemoryState._dynamic) inMemoryState._dynamic = {};
  seedApprovedPurchaseOrder(inMemoryState);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('receivePurchaseOrder — partial receiving via lineQuantities (UX-H04 / BE-009)', () => {
  it('drafts a batch for the requested qty, marks the line partially_received, and leaves PO status unchanged', async () => {
    const result = await partialReceive(4, 'k-partial-1');
    expect(result.ok).toBe(true);
    const drafted = lineBatches();
    expect(drafted.length).toBe(1);
    expect(Number(drafted[0].intakeQty)).toBe(4);
    expect(drafted[0].status).toBe('draft');
    expect(lineRow().status).toBe('partially_received');
    // Receiving only drafts intake — receive progress and PO status change at post time.
    expect(lineRow().receivedQty).toBe('0.000');
    expect(poRow().status).toBe('approved');
  });

  it('rejects a receive qty above the line outstanding and drafts nothing', async () => {
    const result = await partialReceive(11, 'k-over-1');
    expect(result.ok).toBe(false);
    expect(String(result.toast)).toMatch(/exceeds outstanding/);
    expect(lineBatches().length).toBe(0);
    expect(lineRow().status).toBe('planned');
  });

  it('counts pending (unposted) drafts against outstanding — no double-drafting the same qty', async () => {
    await partialReceive(4, 'k-pending-1');
    const result = await partialReceive(7, 'k-pending-2'); // outstanding = 10 - 0 - 4 = 6
    expect(result.ok).toBe(false);
    expect(String(result.toast)).toMatch(/exceeds outstanding/);
    expect(String(result.toast)).toMatch(/already drafted/);
    expect(lineBatches().length).toBe(1);
  });

  it('posting a partial receipt accumulates receivedQty, keeps line + PO partially_received, bills only the received qty, and preserves the ordered PO total', async () => {
    await partialReceive(4, 'k-post-1');
    const post = await postDraftBatches('k-post-2');
    expect(post.ok).toBe(true);
    expect(lineRow().receivedQty).toBe('4.000');
    expect(lineRow().status).toBe('partially_received');
    expect(poRow().status).toBe('partially_received');
    expect(poRow().receivedAt ?? null).toBeNull();
    // Money conservatism: vendor bill covers ONLY the posted qty…
    const bills = inMemoryState.vendorBills.filter((b) => b.purchaseOrderId === PO_ID);
    expect(bills.length).toBe(1);
    expect(bills[0].amount).toBe('4800.00'); // 4 × 1200.00
    // …and the PO keeps the ordered total until receiving completes.
    expect(poRow().total).toBe('12000.00');
  });

  it('receiving + posting the remainder completes the line and PO (receivedAt + received-value total recompute)', async () => {
    await partialReceive(4, 'k-done-1');
    await postDraftBatches('k-done-2');
    await partialReceive(6, 'k-done-3');
    const post2 = await postDraftBatches('k-done-4');
    expect(post2.ok).toBe(true);
    expect(lineRow().receivedQty).toBe('10.000');
    expect(lineRow().status).toBe('received');
    expect(poRow().status).toBe('received');
    expect(poRow().receivedAt).toBeInstanceOf(Date);
    expect(poRow().total).toBe('12000.00'); // 10 × 1200.00 cumulative
    // Each partial post generated its own proportional bill.
    const bills = inMemoryState.vendorBills.filter((b) => b.purchaseOrderId === PO_ID);
    expect(bills.map((b) => b.amount).sort()).toEqual(['4800.00', '7200.00']);
  });

  it('backward compatible: payload without lineQuantities keeps the legacy full receive → received flow', async () => {
    const receive = await run('receivePurchaseOrder', { purchaseOrderId: PO_ID }, 'k-full-1');
    expect(receive.ok).toBe(true);
    const drafted = lineBatches();
    expect(drafted.length).toBe(1);
    expect(Number(drafted[0].intakeQty)).toBe(10);
    expect(lineRow().status).toBe('planned'); // no lineage marker on the full path
    const post = await postDraftBatches('k-full-2');
    expect(post.ok).toBe(true);
    expect(lineRow().receivedQty).toBe('10.000');
    expect(lineRow().status).toBe('received');
    expect(poRow().status).toBe('received');
    expect(poRow().receivedAt).toBeInstanceOf(Date);
  });

  it('idempotency: replaying the same key returns the cached result without drafting a second batch', async () => {
    const first = await partialReceive(4, 'k-idem');
    expect(first.ok).toBe(true);
    const replay = await partialReceive(4, 'k-idem');
    expect(replay.ok).toBe(true);
    expect(replay.commandId).toBe(first.commandId);
    expect(lineBatches().length).toBe(1);
  });

  it('reversing an unposted partial receive restores prior line receive progress instead of zeroing it', async () => {
    await partialReceive(4, 'k-rev-1');
    await postDraftBatches('k-rev-2');
    expect(lineRow().receivedQty).toBe('4.000');
    const second = await partialReceive(3, 'k-rev-3');
    expect(second.ok).toBe(true);
    const reversal = await run('reverseCommandById', { commandId: second.commandId }, 'k-rev-4');
    expect(reversal.ok).toBe(true);
    const drafted = lineBatches().filter((b) => b.status === 'draft');
    expect(drafted.length).toBe(0);
    const reversed = lineBatches().filter((b) => b.status === 'reversed');
    expect(reversed.length).toBe(1);
    // The posted 4.000 from the first receipt survives the reversal.
    expect(lineRow().receivedQty).toBe('4.000');
    expect(lineRow().status).toBe('partially_received');
    expect(poRow().status).toBe('partially_received');
  });
});
