import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryState,
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState
} from '../services/__tests__/inMemoryDbMock';

const PO_FINALIZED = '11111111-1111-4111-8111-111111111111';
const PO_DRAFT_ONLY = '22222222-2222-4222-8222-222222222222';
const PO_NO_SNAPSHOT = '33333333-3333-4333-8333-333333333333';
const SNAP_FINALIZED_ID = '44444444-4444-4444-8444-444444444444';
const SNAP_DRAFT_ID = '55555555-5555-4555-8555-555555555555';
const SNAP_WRONG_TYPE_ID = '66666666-6666-4666-8666-666666666666';

const fixtureExternalPayload = {
  poNo: 'PO-2026-001', vendorName: 'Acme Farms', vendorAlias: 'ACME',
  expectedDate: '2026-06-01T00:00:00.000Z', paymentTerms: 'net_14',
  prepaymentAmount: 0, externalNotes: null, finalizedAt: '2026-05-20T15:00:00.000Z',
  total: 1200,
  lines: [{ productName: 'Mendo Breath', category: 'Flower', qty: 1, uom: 'lb',
    unitCost: 1200, costRangeLow: null, costRangeHigh: null, externalNotes: null }]
};
const fixtureInternalPayload = {
  poNo: 'PO-2026-001', vendorId: 'vend', vendorName: 'Acme Farms', vendorAlias: 'ACME',
  status: 'finalized', expectedDate: '2026-06-01T00:00:00.000Z', orderedAt: null,
  finalizedAt: '2026-05-20T15:00:00.000Z', paymentTerms: 'net_14',
  prepaymentAmount: 0, total: 1200,
  buyerNotes: 'BUYER ONLY — do not share', internalNotes: 'INTERNAL — margin target 30%',
  externalNotes: null, refereeRelationshipId: null, refereeCreditAmount: null,
  lines: [{ id: 'l-1', purchaseOrderId: PO_FINALIZED, itemId: null,
    productName: 'Mendo Breath', category: 'Flower', tags: [],
    qty: 1, receivedQty: 0, uom: 'lb', unitCost: 1200, unitPrice: 1800,
    costRangeLow: null, costRangeHigh: null, sourceCode: null, shorthand: null,
    legacyMarker: null, ownershipStatus: 'C', notes: null, internalNotes: 'Internal target $1250',
    externalNotes: null, status: 'planned' }]
};

// vi.hoisted lifts state ABOVE vi.mock (which itself is hoisted above imports);
// otherwise the mock factory hits the TDZ for `state` when '../db' is loaded
// transitively by `import { appRouter } from './index'`.
const state: InMemoryState = vi.hoisted(() => ({
  purchaseOrders: [],
  purchaseOrderLines: [],
  vendors: [],
  documentSnapshots: [],
  commandJournal: [],
  advisoryLocks: []
}));

function seedRouterRows(s: InMemoryState) {
  s.documentSnapshots.push({
    id: SNAP_FINALIZED_ID, documentType: 'purchase_order', subjectId: PO_FINALIZED,
    version: 1, status: 'finalized', projectionVersion: 1,
    internalPayload: fixtureInternalPayload, externalPayload: fixtureExternalPayload,
    generatedByCommandId: 'cmd-1',
    createdAt: new Date('2026-05-20T15:00:00Z'), updatedAt: new Date('2026-05-20T15:00:00Z')
  });
  s.documentSnapshots.push({
    id: SNAP_DRAFT_ID, documentType: 'purchase_order', subjectId: PO_DRAFT_ONLY,
    version: 1, status: 'draft', projectionVersion: 1,
    internalPayload: fixtureInternalPayload, externalPayload: fixtureExternalPayload,
    generatedByCommandId: 'cmd-2',
    createdAt: new Date('2026-05-20T15:00:00Z'), updatedAt: new Date('2026-05-20T15:00:00Z')
  });
  s.documentSnapshots.push({
    id: SNAP_WRONG_TYPE_ID, documentType: 'sales_order', subjectId: PO_FINALIZED,
    version: 1, status: 'finalized', projectionVersion: 1,
    internalPayload: {}, externalPayload: {},
    generatedByCommandId: 'cmd-3',
    createdAt: new Date('2026-05-20T15:00:00Z'), updatedAt: new Date('2026-05-20T15:00:00Z')
  });
}

vi.mock('../db', () => {
  const mocked = makeMockedDb(state);
  // `pool` is imported by ../auth (transitively pulled in via appRouter)
  // for connect-pg-simple's PgSession store. The store object is constructed
  // at module load time but only used by the express session middleware,
  // which never runs in this unit test (we call procedures via
  // appRouter.createCaller). A bare stub satisfies the constructor.
  return { db: mocked.db, pool: {} };
});

beforeEach(() => {
  resetInMemoryState(state);
  seedRouterRows(state);
});

import { appRouter } from './index';
import type { SessionUser } from '../../shared/types';

const operatorUser = { id: 'op-id', role: 'operator', email: 'op@test', name: 'Op' } as unknown as SessionUser;
const managerUser  = { id: 'mg-id', role: 'manager',  email: 'mg@test', name: 'Mg' } as unknown as SessionUser;
const ownerUser    = { id: 'ow-id', role: 'owner',    email: 'ow@test', name: 'Ow' } as unknown as SessionUser;
const viewerUser   = { id: 'vw-id', role: 'viewer',   email: 'vw@test', name: 'Vw' } as unknown as SessionUser;

function callerFor(user: SessionUser) {
  return appRouter.createCaller({ user } as any);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('documentSnapshots router — getExternalBySubjectId (minimized output)', () => {
  it('returns ONLY { version, projectionVersion, externalPayload } for finalized snapshot', async () => {
    const result = await callerFor(operatorUser).documentSnapshots.getExternalBySubjectId({
      documentType: 'purchase_order', subjectId: PO_FINALIZED
    });
    expect(Object.keys(result).sort()).toEqual(['externalPayload', 'projectionVersion', 'version']);
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('subjectId');
    expect(result).not.toHaveProperty('generatedByCommandId');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('internalPayload');
  });

  it('throws NOT_FOUND when no active snapshot exists', async () => {
    await expect(callerFor(operatorUser).documentSnapshots.getExternalBySubjectId({
      documentType: 'purchase_order', subjectId: PO_NO_SNAPSHOT
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('viewer receives NOT_FOUND when subject only has a draft snapshot', async () => {
    await expect(callerFor(viewerUser).documentSnapshots.getExternalBySubjectId({
      documentType: 'purchase_order', subjectId: PO_DRAFT_ONLY
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects non-PO documentType with NOT_IMPLEMENTED', async () => {
    await expect(callerFor(operatorUser).documentSnapshots.getExternalBySubjectId({
      documentType: 'sales_order', subjectId: PO_FINALIZED
    })).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});

describe('documentSnapshots router — getInternalBySubjectId (operator+ only)', () => {
  it('returns the full row for owner / manager / operator', async () => {
    for (const user of [ownerUser, managerUser, operatorUser]) {
      const result = await callerFor(user).documentSnapshots.getInternalBySubjectId({
        documentType: 'purchase_order', subjectId: PO_FINALIZED
      });
      expect(result).toHaveProperty('internalPayload');
      expect(result).toHaveProperty('externalPayload');
    }
  });

  it('returns FORBIDDEN for viewer', async () => {
    await expect(callerFor(viewerUser).documentSnapshots.getInternalBySubjectId({
      documentType: 'purchase_order', subjectId: PO_FINALIZED
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('documentSnapshots router — listVersions (operator+ only)', () => {
  it('returns rows ordered by version desc', async () => {
    const rows = await callerFor(operatorUser).documentSnapshots.listVersions({
      documentType: 'purchase_order', subjectId: PO_FINALIZED
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].version).toBeGreaterThanOrEqual(rows[rows.length - 1].version);
  });

  it('is FORBIDDEN for viewer', async () => {
    await expect(callerFor(viewerUser).documentSnapshots.listVersions({
      documentType: 'purchase_order', subjectId: PO_FINALIZED
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('documentSnapshots router — getReceiptText (minimized output)', () => {
  it('mode=external (no includeDrafts) returns ONLY { text, version, projectionVersion } and contains no INTERNAL/unitPrice/internalNotes', async () => {
    const result = await callerFor(operatorUser).documentSnapshots.getReceiptText({
      documentType: 'purchase_order', subjectId: PO_FINALIZED, mode: 'external'
    });
    expect(Object.keys(result).sort()).toEqual(['projectionVersion', 'text', 'version']);
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('status');
    expect(result.text).not.toMatch(/INTERNAL/);
    expect(result.text).not.toMatch(/internalNotes/);
    expect(result.text).not.toMatch(/unitPrice/);
    expect(result.text).toMatch(/Vendor unit price/);
  });

  it('mode=external WITHOUT includeDrafts returns NOT_FOUND for a draft-only subject (viewer + operator)', async () => {
    for (const user of [viewerUser, operatorUser]) {
      await expect(callerFor(user).documentSnapshots.getReceiptText({
        documentType: 'purchase_order', subjectId: PO_DRAFT_ONLY, mode: 'external'
      })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('mode=external WITH includeDrafts=true returns the draft preview for operator', async () => {
    const result = await callerFor(operatorUser).documentSnapshots.getReceiptText({
      documentType: 'purchase_order', subjectId: PO_DRAFT_ONLY, mode: 'external', includeDrafts: true
    });
    expect(result.text).toMatch(/Vendor unit price/);
    expect(result.text).not.toMatch(/INTERNAL/);
    expect(result.text).not.toMatch(/unitPrice/);
  });

  it('mode=external WITH includeDrafts=true is FORBIDDEN for viewer', async () => {
    await expect(callerFor(viewerUser).documentSnapshots.getReceiptText({
      documentType: 'purchase_order', subjectId: PO_DRAFT_ONLY, mode: 'external', includeDrafts: true
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('mode=internal is FORBIDDEN for viewer (with or without includeDrafts)', async () => {
    for (const include of [undefined, true]) {
      await expect(callerFor(viewerUser).documentSnapshots.getReceiptText({
        documentType: 'purchase_order', subjectId: PO_FINALIZED, mode: 'internal', includeDrafts: include
      })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('mode=internal includes "INTERNAL — DO NOT SEND" watermark for operator', async () => {
    const result = await callerFor(operatorUser).documentSnapshots.getReceiptText({
      documentType: 'purchase_order', subjectId: PO_FINALIZED, mode: 'internal'
    });
    expect(result.text).toMatch(/^INTERNAL — DO NOT SEND/);
  });
});

describe('documentSnapshots router — getById (operator+ only, documentType-bound)', () => {
  it('requires documentType = "purchase_order" literal in Tranche 1', async () => {
    await expect(callerFor(operatorUser).documentSnapshots.getById({
      id: SNAP_FINALIZED_ID, documentType: 'sales_order' as any
    })).rejects.toBeDefined();
  });

  it('returns full row for operator when documentType matches', async () => {
    const result = await callerFor(operatorUser).documentSnapshots.getById({
      id: SNAP_FINALIZED_ID, documentType: 'purchase_order'
    });
    expect(result).toHaveProperty('internalPayload');
    expect(result.documentType).toBe('purchase_order');
  });

  it('returns NOT_FOUND when the row id belongs to a non-PO documentType (defence in depth)', async () => {
    await expect(callerFor(operatorUser).documentSnapshots.getById({
      id: SNAP_WRONG_TYPE_ID, documentType: 'purchase_order'
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('is FORBIDDEN for viewer in Tranche 1', async () => {
    await expect(callerFor(viewerUser).documentSnapshots.getById({
      id: SNAP_FINALIZED_ID, documentType: 'purchase_order'
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
