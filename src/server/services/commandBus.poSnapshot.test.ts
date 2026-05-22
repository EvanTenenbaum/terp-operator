import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryState,
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from './__tests__/inMemoryDbMock';

const PO_ID = '11111111-1111-4111-8111-111111111111';
const VENDOR_ID = '22222222-2222-4222-8222-222222222222';
const LINE_ID = '33333333-3333-4333-8333-333333333333';
const OPERATOR_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// `vi.hoisted` is required so the mock factory below (which runs at module
// init, before non-import statements execute) can reach the shared state.
// We inline the shape of InMemoryState here (mirrors createInMemoryState())
// because vi.hoisted runs before imports resolve.
const { inMemoryState } = vi.hoisted(() => ({
  inMemoryState: {
    purchaseOrders: [],
    purchaseOrderLines: [],
    vendors: [],
    documentSnapshots: [],
    commandJournal: [],
    advisoryLocks: []
  } as InMemoryState
}));

export { inMemoryState };

function seedDraftPurchaseOrder(s: InMemoryState) {
  s.vendors.push({ id: VENDOR_ID, name: 'Acme Farms', alias: 'ACME' });
  s.purchaseOrders.push({
    id: PO_ID, poNo: 'PO-2026-001', vendorId: VENDOR_ID, status: 'draft',
    paymentTerms: 'net_14', prepaymentAmount: '0.00', total: '1200.00',
    expectedDate: null, orderedAt: null, finalizedAt: null,
    buyerNotes: null, internalNotes: null, externalNotes: null,
    refereeRelationshipId: null, refereeCreditAmount: null
  });
  s.purchaseOrderLines.push({
    id: LINE_ID, purchaseOrderId: PO_ID, itemId: null,
    productName: 'Mendo Breath', category: 'Flower', tags: [],
    qty: '1.000', receivedQty: '0.000', uom: 'lb',
    unitCost: '1200.00', unitPrice: '1800.00',
    costRangeLow: null, costRangeHigh: null,
    sourceCode: null, shorthand: null, legacyMarker: null,
    ownershipStatus: 'C', notes: null, internalNotes: null,
    externalNotes: null, status: 'planned'
  });
}

vi.mock('../db', () => {
  const mocked = makeMockedDb(inMemoryState);
  return { db: mocked.db, pool: { query: async () => ({ rows: [] }) } };
});

import { executeCommand } from './commandBus';
import type { SessionUser } from '../../shared/types';

const operatorUser: SessionUser = {
  id: OPERATOR_USER_ID, name: 'Op', role: 'owner', email: 'owner@terpagro.local'
} as unknown as SessionUser;
const ioStub = { emit: () => {} } as any;

beforeEach(() => {
  resetInMemoryState(inMemoryState);
  seedDraftPurchaseOrder(inMemoryState);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('finalizePurchaseOrder side effect — snapshot creation', () => {
  it('writes a document_snapshots row with status=finalized for the PO', async () => {
    const result = await executeCommand({
      name: 'finalizePurchaseOrder',
      payload: { purchaseOrderId: PO_ID },
      idempotencyKey: 'k1', reason: 'test'
    } as any, operatorUser, ioStub);
    expect(result.ok).toBe(true);
    const rows = inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('finalized');
    expect(rows[0].version).toBe(1);
  });

  it('refinalize after unfinalize creates v2 and v1 remains void (NOT superseded)', async () => {
    await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    await executeCommand({ name: 'unfinalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k2', reason: 'test' } as any, operatorUser, ioStub);
    await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k3', reason: 'test' } as any, operatorUser, ioStub);
    const rows = inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID).sort((a, b) => (a.version as number) - (b.version as number));
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('void');
    expect(rows[1].status).toBe('finalized');
    expect(rows[1].version).toBe(2);
    expect(rows.some((r) => r.status === 'superseded')).toBe(false);
  });

  it('finalize after saveDraft consumes the draft IN PLACE (same row id, version=1, status flips to finalized)', async () => {
    const saveResult = await executeCommand({
      name: 'saveDraftPurchaseOrderReceipt',
      payload: { purchaseOrderId: PO_ID },
      idempotencyKey: 'd1', reason: 'test'
    } as any, operatorUser, ioStub);
    expect(saveResult.ok).toBe(true);
    const draftId = inMemoryState.documentSnapshots.find((r) => r.subjectId === PO_ID && r.status === 'draft')!.id;
    const finalizeResult = await executeCommand({
      name: 'finalizePurchaseOrder',
      payload: { purchaseOrderId: PO_ID },
      idempotencyKey: 'k1', reason: 'test'
    } as any, operatorUser, ioStub);
    expect(finalizeResult.ok).toBe(true);
    const rows = inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(draftId);
    expect(rows[0].status).toBe('finalized');
    expect(rows[0].version).toBe(1);
  });

  it('finalizePurchaseOrder is rolled back when projection throws — no orphan snapshot row', async () => {
    const projection = await import('./documentSnapshots/poProjection');
    const spy = vi.spyOn(projection, 'projectExternal').mockImplementationOnce(() => {
      throw new Error('projection failure');
    });
    try {
      const beforeStatus = inMemoryState.purchaseOrders.find((r) => r.id === PO_ID)!.status;
      const result = await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
      expect(result.ok).toBe(false);
      expect(inMemoryState.purchaseOrders.find((r) => r.id === PO_ID)!.status).toBe(beforeStatus);
      expect(inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID)).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('unfinalizePurchaseOrder side effect — snapshot void', () => {
  it('voids the active finalized snapshot when unfinalizing', async () => {
    await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    await executeCommand({ name: 'unfinalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k2', reason: 'test' } as any, operatorUser, ioStub);
    const row = inMemoryState.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('void');
  });
  it('no-op when there is no active snapshot (legacy POs)', async () => {
    const result = await executeCommand({ name: 'unfinalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k2', reason: 'test' } as any, operatorUser, ioStub);
    expect(result.ok).toBe(true);
    expect(inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID)).toHaveLength(0);
  });
});

describe('saveDraftPurchaseOrderReceipt + abandonDraftPurchaseOrderReceipt commands', () => {
  it('saveDraft on a draft PO creates a draft snapshot at v1', async () => {
    const r = await executeCommand({ name: 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd1', reason: 'test' } as any, operatorUser, ioStub);
    expect(r.ok).toBe(true);
    const rows = inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('draft');
    expect(rows[0].version).toBe(1);
  });
  it('saveDraft is idempotent: a second call updates rather than creates', async () => {
    await executeCommand({ name: 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd1', reason: 'test' } as any, operatorUser, ioStub);
    await executeCommand({ name: 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd2', reason: 'test' } as any, operatorUser, ioStub);
    const rows = inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('draft');
  });
  it('saveDraft rejects a finalized PO (server-side guard)', async () => {
    await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    const r = await executeCommand({ name: 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd1', reason: 'test' } as any, operatorUser, ioStub);
    expect(r.ok).toBe(false);
    expect(r.toast).toMatch(/can only be saved for draft purchase orders/i);
  });
  it('abandonDraft transitions draft to void', async () => {
    await executeCommand({ name: 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd1', reason: 'test' } as any, operatorUser, ioStub);
    const r = await executeCommand({ name: 'abandonDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd2', reason: 'test' } as any, operatorUser, ioStub);
    expect(r.ok).toBe(true);
    const row = inMemoryState.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('void');
  });
  it('abandonDraft is a no-op when no draft exists', async () => {
    const r = await executeCommand({ name: 'abandonDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'd2', reason: 'test' } as any, operatorUser, ioStub);
    expect(r.ok).toBe(true);
    expect(inMemoryState.documentSnapshots.filter((r) => r.subjectId === PO_ID)).toHaveLength(0);
  });
});

describe('command-history leak guard', () => {
  const VIEWER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const viewerUser: SessionUser = {
    id: VIEWER_USER_ID, name: 'Viewer', role: 'viewer', email: 'viewer@test'
  } as unknown as SessionUser;

  async function fetchRelatedCommandsAsViewer(entityId: string) {
    const { appRouter } = await import('../routers');
    const caller = appRouter.createCaller({ user: viewerUser } as any);
    return caller.queries.relatedCommands({ entityId });
  }

  async function fetchReversalPreviewAsViewer(commandId: string) {
    const { appRouter } = await import('../routers');
    const caller = appRouter.createCaller({ user: viewerUser } as any);
    return caller.queries.reversalPreview({ commandId });
  }

  it.each([
    ['finalizePurchaseOrder'],
    ['unfinalizePurchaseOrder'],
    ['saveDraftPurchaseOrderReceipt'],
    ['abandonDraftPurchaseOrderReceipt']
  ] as const)('receipt command %s — affectedIds contains the PO id only', async (name) => {
    if (name === 'unfinalizePurchaseOrder' || name === 'abandonDraftPurchaseOrderReceipt') {
      await executeCommand({ name: name === 'unfinalizePurchaseOrder' ? 'finalizePurchaseOrder' : 'saveDraftPurchaseOrderReceipt', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'seed', reason: 'test' } as any, operatorUser, ioStub);
    }
    const result = await executeCommand({ name, payload: { purchaseOrderId: PO_ID }, idempotencyKey: `k-${name}`, reason: 'test' } as any, operatorUser, ioStub);
    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([PO_ID]);
    const snapshotIds = new Set(inMemoryState.documentSnapshots.map((r) => r.id));
    for (const id of result.affectedIds) expect(snapshotIds.has(id)).toBe(false);
  });

  it('queries.relatedCommands viewer response does NOT include internalPayload, externalPayload, or any snapshot UUID', async () => {
    await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    const related = await fetchRelatedCommandsAsViewer(PO_ID);
    const serialized = JSON.stringify(related);
    expect(serialized).not.toMatch(/internalPayload/);
    expect(serialized).not.toMatch(/externalPayload/);
    expect(serialized).not.toMatch(/documentSnapshots/);
    expect(serialized).not.toMatch(/INTERNAL — DO NOT SEND/);
    for (const snap of inMemoryState.documentSnapshots) {
      expect(serialized).not.toContain(String(snap.id));
    }
  });

  it('command_journal row — beforeSnapshot/afterSnapshot do not have a documentSnapshots key', async () => {
    const finalize = await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    const journalRow = inMemoryState.commandJournal.find((r) => r.id === finalize.commandId);
    expect(journalRow).toBeTruthy();
    const beforeSnap = (journalRow!.beforeSnapshot ?? {}) as Record<string, unknown>;
    const afterSnap = (journalRow!.afterSnapshot ?? {}) as Record<string, unknown>;
    expect(Object.keys(beforeSnap)).not.toContain('documentSnapshots');
    expect(Object.keys(afterSnap)).not.toContain('documentSnapshots');
  });

  it('queries.reversalPreview for a finalize command does NOT expose internalPayload or externalPayload to viewer', async () => {
    const finalize = await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    const preview = await fetchReversalPreviewAsViewer(finalize.commandId);
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toMatch(/internalPayload/);
    expect(serialized).not.toMatch(/externalPayload/);
    expect(serialized).not.toMatch(/documentSnapshots/);
    expect(serialized).not.toMatch(/INTERNAL — DO NOT SEND/);
  });

  it('reverseCommandById (operator-only) returns safe output for receipt commands', async () => {
    const finalize = await executeCommand({ name: 'finalizePurchaseOrder', payload: { purchaseOrderId: PO_ID }, idempotencyKey: 'k1', reason: 'test' } as any, operatorUser, ioStub);
    const reversal = await executeCommand({
      name: 'reverseCommandById',
      payload: { commandId: finalize.commandId },
      idempotencyKey: 'k-rev', reason: 'test'
    } as any, operatorUser, ioStub);
    const serialized = JSON.stringify(reversal);
    expect(serialized).not.toMatch(/internalPayload/);
    expect(serialized).not.toMatch(/externalPayload/);
    expect(serialized).not.toMatch(/INTERNAL — DO NOT SEND/);
  });
});
