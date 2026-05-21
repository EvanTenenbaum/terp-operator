import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryState,
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from '../__tests__/inMemoryDbMock';

const state: InMemoryState = createInMemoryState();

const PO_ID = '11111111-1111-4111-8111-111111111111';
const VENDOR_ID = '22222222-2222-4222-8222-222222222222';
const LINE_ID = '33333333-3333-4333-8333-333333333333';
const MISSING_PO_ID = '99999999-9999-4999-8999-999999999999';

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
    productName: 'Mendo Breath', category: 'Flower', tags: ['indoor'],
    qty: '1.000', receivedQty: '0.000', uom: 'lb',
    unitCost: '1200.00', unitPrice: '1800.00',
    costRangeLow: null, costRangeHigh: null,
    sourceCode: null, shorthand: null, legacyMarker: null,
    ownershipStatus: 'C', notes: null, internalNotes: null,
    externalNotes: null, status: 'planned'
  });
}

let tx: any;

vi.mock('../../db', () => ({
  db: { transaction: async (fn: any) => fn(tx) }
}));

import {
  createFinalizedSnapshotForPurchaseOrder,
  voidActiveSnapshotForPurchaseOrder,
  saveOrUpdateDraftSnapshotForPurchaseOrder,
  abandonDraftSnapshotForPurchaseOrder
} from './snapshotService';
import { PROJECTION_VERSION, EXTERNAL_FIELDS } from './poProjection';

beforeEach(() => {
  resetInMemoryState(state);
  const mocked = makeMockedDb(state);
  tx = mocked.tx;
  seedDraftPurchaseOrder(state);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('snapshotService — createFinalizedSnapshotForPurchaseOrder', () => {
  it('takes the advisory lock keyed by (document_type, subject_id) before any read', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    expect(state.advisoryLocks).toContain(`purchase_order:${PO_ID}`);
  });

  it('creates v1 finalized snapshot when no prior snapshot exists', async () => {
    const result = await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    expect(result.version).toBe(1);
    expect(result.consumedDraftId).toBeNull();
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('finalized');
  });

  it('consumes the active draft IN PLACE (UPDATE same id) when one exists', async () => {
    const draft = await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-draft');
    const result = await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-final');
    expect(result.snapshotId).toBe(draft.snapshotId);
    expect(result.consumedDraftId).toBe(draft.snapshotId);
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(draft.snapshotId);
    expect(rows[0].status).toBe('finalized');
    expect(rows[0].version).toBe(1);
  });

  it('REJECTS finalize when an active finalized row already exists (no superseded path in Tranche 1)', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    await expect(
      createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2')
    ).rejects.toThrow(/already finalized/i);
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows.some((r) => r.status === 'superseded')).toBe(false);
  });

  it('writes generated_by_command_id and projection_version on new insert', async () => {
    const result = await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const row = state.documentSnapshots.find((r) => r.id === result.snapshotId)!;
    expect(row.generatedByCommandId).toBe('cmd-1');
    expect(row.projectionVersion).toBe(PROJECTION_VERSION);
  });

  it('persists projected external_payload with only allowlisted keys', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID && r.status === 'finalized')!;
    expect(Object.keys(row.externalPayload as object).sort()).toEqual([...EXTERNAL_FIELDS].sort());
    expect(((row.externalPayload as any).lines)[0]).not.toHaveProperty('unitPrice');
    expect(((row.externalPayload as any).lines)[0]).not.toHaveProperty('internalNotes');
  });

  it('throws if PO does not exist', async () => {
    await expect(
      createFinalizedSnapshotForPurchaseOrder(tx as any, MISSING_PO_ID, 'cmd-1')
    ).rejects.toThrow(/not found/i);
  });
});

describe('snapshotService — voidActiveSnapshotForPurchaseOrder', () => {
  it('voids an active finalized snapshot', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const result = await voidActiveSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2');
    expect(result.voidedId).not.toBeNull();
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('void');
  });

  it('voids an active draft snapshot', async () => {
    await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-draft');
    const result = await voidActiveSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2');
    expect(result.voidedId).not.toBeNull();
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('void');
  });

  it('no-op when no active snapshot exists', async () => {
    const result = await voidActiveSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    expect(result.voidedId).toBeNull();
  });

  it('takes the advisory lock', async () => {
    await voidActiveSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    expect(state.advisoryLocks).toContain(`purchase_order:${PO_ID}`);
  });
});

describe('snapshotService — saveOrUpdateDraftSnapshotForPurchaseOrder', () => {
  it('inserts a new draft when no active snapshot exists', async () => {
    const result = await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    expect(result.created).toBe(true);
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('draft');
    expect(row.version).toBe(1);
  });

  it('updates internal+external payload when an active draft exists (same id)', async () => {
    const first = await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const second = await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2');
    expect(second.created).toBe(false);
    expect(second.snapshotId).toBe(first.snapshotId);
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].generatedByCommandId).toBe('cmd-2');
  });

  it('REJECTS save-draft when an active finalized row exists (defensive guard)', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    await expect(
      saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2')
    ).rejects.toThrow(/finalized/i);
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID);
    expect(rows.some((r) => r.status === 'superseded')).toBe(false);
  });
});

describe('snapshotService — abandonDraftSnapshotForPurchaseOrder', () => {
  it('voids the active draft', async () => {
    await saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const result = await abandonDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2');
    expect(result.voidedId).not.toBeNull();
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('void');
  });

  it('does NOT touch an active finalized snapshot', async () => {
    await createFinalizedSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-1');
    const result = await abandonDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-2');
    expect(result.voidedId).toBeNull();
    const row = state.documentSnapshots.find((r) => r.subjectId === PO_ID)!;
    expect(row.status).toBe('finalized');
  });
});

describe('snapshotService — concurrent finalize/save-draft serialization', () => {
  it('two concurrent saveDraft calls do not create two draft rows for the same subject', async () => {
    const results = await Promise.all([
      saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-a'),
      saveOrUpdateDraftSnapshotForPurchaseOrder(tx as any, PO_ID, 'cmd-b')
    ]);
    const rows = state.documentSnapshots.filter((r) => r.subjectId === PO_ID && r.status === 'draft');
    expect(rows).toHaveLength(1);
    const created = results.filter((r) => r.created).length;
    expect(created).toBe(1);
  });
});
