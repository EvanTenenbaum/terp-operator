/**
 * CAP-030 partial order picking — cross-cutting integration tests (TER-1523)
 *
 * Six scenarios exercising the full pick lifecycle via runCommand() against
 * an in-memory Drizzle mock.  This mirrors the approach used in
 * commandBus.receivePO.test.ts and costRangeExceptions.test.ts.
 *
 * Why runCommand (not executeCommand) is used here:
 *   executeCommand wraps every call in db.transaction + journal idempotency,
 *   which those test files already cover thoroughly. runCommand lets us test
 *   the pure command handler sequences without duplicating journal coverage.
 *
 * Why postSalesOrder is NOT exercised in the happy path:
 *   postSalesOrder takes a pessimistic FOR UPDATE customer lock via raw
 *   tx.execute() SQL, creates invoices, ledger rows, and inventory movements,
 *   and walks a consignment vendor-bill branch — the same rationale documented
 *   in costRangeExceptions.test.ts.  The credit gate that lives in
 *   postSalesOrder is covered in scenario 6 via confirmSalesOrder, which has
 *   the same credit check and exercises the same guard logic without the
 *   complex table dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createInMemoryState,
  resetInMemoryState,
  makeMockedDb,
  type InMemoryState,
} from './__tests__/inMemoryDbMock';
import type { SessionUser } from '../../shared/types';
import type { Tx } from '../db';

// ---------------------------------------------------------------------------
// Shared in-memory state — must be vi.hoisted so the vi.mock factory can
// reference it before non-import statements run.
// The state object is created inline (not via createInMemoryState()) because
// vi.hoisted runs before any module imports are resolved.
// ---------------------------------------------------------------------------

const { s } = vi.hoisted(() => ({
  s: {
    purchaseOrders: [],
    purchaseOrderLines: [],
    vendors: [],
    documentSnapshots: [],
    commandJournal: [],
    advisoryLocks: [],
    _dynamic: {},
  } as unknown as import('./__tests__/inMemoryDbMock').InMemoryState,
}));

// Prevent writeBagManifest from actually touching the filesystem.
vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    readFile: vi.fn(async () => ''),
    access: vi.fn(async () => undefined),
  },
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
    once: vi.fn(),
  })),
}));

// enqueueCustomerRecompute uses pool.query() — stub it so confirmSalesOrder
// succeeds without a real database.
vi.mock('./creditEngine', () => ({
  enqueueCustomerRecompute: vi.fn(async () => undefined),
  enqueueAllCustomers: vi.fn(async () => undefined),
}));

// Mocked journal / media — not under test here.
vi.mock('./journal', () => ({
  appendJsonlJournal: vi.fn(async () => undefined),
  checkJournalWritable: vi.fn(async () => undefined),
}));

vi.mock('./mediaStorage', () => ({
  deleteMedia: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks are installed.
// ---------------------------------------------------------------------------

import { runCommand } from './commandBus';

// ---------------------------------------------------------------------------
// Test fixtures — static UUIDs for predictable assertions.
// ---------------------------------------------------------------------------

const CUSTOMER_ID = '10000000-1000-4000-8000-100000000001';
const ORDER_ID    = '20000000-2000-4000-8000-200000000001';
const LINE1_ID    = '30000000-3000-4000-8000-300000000001';
const LINE2_ID    = '30000000-3000-4000-8000-300000000002';
const LINE3_ID    = '30000000-3000-4000-8000-300000000003';
const BATCH_ID    = '40000000-4000-4000-8000-400000000001';
const USER_ID     = '50000000-5000-4000-8000-500000000001';

let cmdSeq = 0;
const nextCmd = () => `cmd-cap030-${++cmdSeq}`;

// ---------------------------------------------------------------------------
// Mock tx factory
// ---------------------------------------------------------------------------

/**
 * Build a Drizzle-shaped tx from the shared in-memory state.
 *
 * Extended with:
 *   - execute() → returns the customer row from _dynamic so that
 *     postSalesOrder's `SELECT ... FOR UPDATE` resolves correctly.
 *   - query()   → no-op for enqueueCustomerRecompute's pool.query() call.
 */
function makeTx(state: InMemoryState): Tx {
  const { tx: baseTx } = makeMockedDb(state);
  return {
    ...baseTx,
    execute: async (_sqlNode: unknown) => {
      return { rows: state._dynamic?.['customers'] ?? [] };
    },
    // enqueueCustomerRecompute calls client.query() when passed a tx object
    query: async () => ({ rows: [] }),
  } as unknown as Tx;
}

// ---------------------------------------------------------------------------
// State seed helpers
// ---------------------------------------------------------------------------

function seedRow(state: InMemoryState, tableName: string, row: Record<string, unknown>): void {
  if (!state._dynamic) state._dynamic = {};
  if (!state._dynamic[tableName]) state._dynamic[tableName] = [];
  state._dynamic[tableName].push(row);
}

function getRows(state: InMemoryState, tableName: string): Array<Record<string, unknown>> {
  return (state._dynamic?.[tableName] ?? []) as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeCustomer(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: CUSTOMER_ID,
    name: 'Test Customer',
    creditLimit: '100000.00',
    balance: '0.00',
    tags: [],
    pricingStrategy: 'standard',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: ORDER_ID,
    orderNo: 'SO-CAP030-001',
    status: 'draft',
    customerId: CUSTOMER_ID,
    total: '0.00',
    internalMargin: '0.00',
    pricingStrategy: 'standard',
    vendorApprovalPending: false,
    marginWaivedTotal: '0.00',
    lossRecognizedTotal: '0.00',
    archivedAt: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLine(
  id: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    orderId: ORDER_ID,
    batchId: BATCH_ID,
    itemName: 'Test Flower',
    displayName: 'Test Flower',
    qty: '10.000',
    unitPrice: '50.00',
    unitCost: '40.00',
    unitCostResolved: true,
    landedCostBasis: 'fixed',
    priceFloor: '40.00',
    belowFloorReason: null,
    belowFloorNote: null,
    vendorApprovalState: 'none',
    validationIssues: [],
    status: 'draft',
    pickReleasedAt: null,
    pickReleasedBy: null,
    packed: false,
    inventoryPosted: false,
    paymentFollowup: false,
    sourceRowKey: 'BATCH-TEST-001',
    unresolvedSourceText: null,
    legacyStatusMarker: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeBatch(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: BATCH_ID,
    name: 'Test Flower',
    itemId: '60000000-6000-4000-8000-600000000001',
    status: 'posted',
    unitCost: '40.00',
    unitPrice: '50.00',
    availableQty: '100.000',
    reservedQty: '30.000', // covers 3 × 10-unit lines
    priceRange: null,
    batchCode: 'BATCH-TEST-001',
    shorthand: null,
    sourceCode: null,
    notes: null,
    legacyMarker: null,
    vendorId: null,
    tags: [],
    validationIssues: [],
    arrivalConfirmed: true,
    ownershipStatus: 'OFC',
    updatedAt: new Date(),
    ...overrides,
  };
}

function seedBaseline(
  state: InMemoryState,
  lineIds: string[] = [LINE1_ID],
  overrides: {
    customer?: Partial<Record<string, unknown>>;
    order?: Partial<Record<string, unknown>>;
    batch?: Partial<Record<string, unknown>>;
    line?: Partial<Record<string, unknown>>;
  } = {},
): void {
  seedRow(state, 'customers', makeCustomer(overrides.customer));
  seedRow(state, 'sales_orders', makeOrder(overrides.order));
  seedRow(state, 'batches', makeBatch(overrides.batch));
  for (const id of lineIds) {
    seedRow(state, 'sales_order_lines', makeLine(id, overrides.line));
  }
}

// ---------------------------------------------------------------------------
// Shared user / io stubs
// ---------------------------------------------------------------------------

const salesUser: SessionUser = {
  id: USER_ID,
  name: 'Test Sales',
  email: 'sales@test.local',
  role: 'owner',
  workLoop: 'sales',
} as unknown as SessionUser;

beforeEach(() => {
  resetInMemoryState(s);
  vi.clearAllMocks();
  cmdSeq = 0;
});

afterEach(() => {
  resetInMemoryState(s);
});

// ---------------------------------------------------------------------------
// Scenario 1 — Happy path: release → weigh-and-pack → confirm
// ---------------------------------------------------------------------------

describe('Scenario 1: happy path — release, pack, confirm', () => {
  it('releases 3 lines, packs all 3, then confirms the order', async () => {
    seedBaseline(s, [LINE1_ID, LINE2_ID, LINE3_ID]);
    const tx = makeTx(s);

    // --- release line 1 ---
    const r1 = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    expect(r1.ok).toBe(true);

    // pick list + fulfillment line were created in state
    expect(getRows(s, 'pick_lists')).toHaveLength(1);
    expect(getRows(s, 'fulfillment_lines')).toHaveLength(1);
    const fl1Id = r1.affectedIds[2] as string; // [lineId, pickListId, flId, orderId]
    expect(fl1Id).toBeTruthy();

    // --- release line 2 (reuses existing pick list) ---
    const r2 = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE2_ID }, salesUser, nextCmd());
    expect(r2.ok).toBe(true);
    expect(getRows(s, 'pick_lists')).toHaveLength(1); // same pick list reused
    expect(getRows(s, 'fulfillment_lines')).toHaveLength(2);
    const fl2Id = r2.affectedIds[2] as string;

    // --- weigh-and-pack line 1 ---
    const wp1 = await runCommand(tx, 'recordWeighAndPack', { fulfillmentLineId: fl1Id, actualQty: 10, actualWeight: 5 }, salesUser, nextCmd());
    expect(wp1.ok).toBe(true);
    const fl1 = getRows(s, 'fulfillment_lines').find(row => row['id'] === fl1Id)!;
    expect(fl1['status']).toBe('packed');

    // --- weigh-and-pack line 2 ---
    const wp2 = await runCommand(tx, 'recordWeighAndPack', { fulfillmentLineId: fl2Id, actualQty: 10, actualWeight: 5 }, salesUser, nextCmd());
    expect(wp2.ok).toBe(true);

    // --- release line 3 ---
    const r3 = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE3_ID }, salesUser, nextCmd());
    expect(r3.ok).toBe(true);
    expect(getRows(s, 'fulfillment_lines')).toHaveLength(3);
    const fl3Id = r3.affectedIds[2] as string;

    // --- weigh-and-pack line 3 ---
    const wp3 = await runCommand(tx, 'recordWeighAndPack', { fulfillmentLineId: fl3Id, actualQty: 10, actualWeight: 5 }, salesUser, nextCmd());
    expect(wp3.ok).toBe(true);

    // --- confirm the order (customer has ample credit) ---
    const confirm = await runCommand(tx, 'confirmSalesOrder', { orderId: ORDER_ID }, salesUser, nextCmd());
    expect(confirm.ok).toBe(true);

    // Order status updated to 'confirmed'
    const order = getRows(s, 'sales_orders').find(o => o['id'] === ORDER_ID)!;
    expect(order['status']).toBe('confirmed');

    // pick_released_at is set on all 3 lines
    const lines = getRows(s, 'sales_order_lines');
    expect(lines.every(l => l['pickReleasedAt'] !== null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Qty bump alert: update qty on released line → alert appears
// ---------------------------------------------------------------------------

describe('Scenario 2: qty bump after release → warehouse_alerts populated', () => {
  it('updateSalesOrderLine on a released line creates a qty_changed alert', async () => {
    seedBaseline(s, [LINE1_ID]);
    const tx = makeTx(s);

    // Release the line
    const release = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    expect(release.ok).toBe(true);
    const flId = release.affectedIds[2] as string;

    // Bump the qty on the sales order line while released
    const update = await runCommand(tx, 'updateSalesOrderLine', {
      lineId: LINE1_ID,
      qty: 15, // was 10 — a bump up
    }, salesUser, nextCmd());
    expect(update.ok).toBe(true);

    // Fulfillment line must have a warehouse alert with kind='qty_changed'
    const fl = getRows(s, 'fulfillment_lines').find(row => row['id'] === flId)!;
    expect(fl).toBeDefined();
    const alerts = fl['warehouseAlerts'] as Array<Record<string, unknown>>;
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!['kind']).toBe('qty_changed');
    expect(alerts[0]!['from']).toBe(10);
    expect(alerts[0]!['to']).toBe(15);
    expect(alerts[0]!['actor']).toBe('sales');

    // status_extended must be 'recall_pending'
    expect(fl['statusExtended']).toBe('recall_pending');
  });

  it('updateSalesOrderLine with unchanged qty does NOT add an alert', async () => {
    seedBaseline(s, [LINE1_ID]);
    const tx = makeTx(s);

    const release = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    const flId = release.affectedIds[2] as string;

    // Same qty → no alert
    await runCommand(tx, 'updateSalesOrderLine', { lineId: LINE1_ID, qty: 10 }, salesUser, nextCmd());

    const fl = getRows(s, 'fulfillment_lines').find(row => row['id'] === flId)!;
    // warehouseAlerts may be undefined (mock does not apply DB defaults) or []
    const alerts = (fl['warehouseAlerts'] as Array<Record<string, unknown>> | undefined) ?? [];
    expect(alerts).toHaveLength(0);
  });

  it('updateSalesOrderLine on an un-released line does NOT add an alert', async () => {
    seedBaseline(s, [LINE1_ID]);
    const tx = makeTx(s);

    // Do NOT release — update qty directly
    const update = await runCommand(tx, 'updateSalesOrderLine', { lineId: LINE1_ID, qty: 15 }, salesUser, nextCmd());
    expect(update.ok).toBe(true);

    // No fulfillment lines at all
    expect(getRows(s, 'fulfillment_lines')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Qty drop + return + acknowledge → state clean
// ---------------------------------------------------------------------------

describe('Scenario 3: qty drop + returnPickedUnits + acknowledgeWarehouseAlert', () => {
  it('returns picked units and acknowledges alert, leaving the state clean', async () => {
    seedBaseline(s, [LINE1_ID]);
    const tx = makeTx(s);

    // Release, then weigh-and-pack
    const release = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    const flId = release.affectedIds[2] as string;
    await runCommand(tx, 'recordWeighAndPack', { fulfillmentLineId: flId, actualQty: 10, actualWeight: 5 }, salesUser, nextCmd());

    // Sales side drops the qty → alert fires
    await runCommand(tx, 'updateSalesOrderLine', { lineId: LINE1_ID, qty: 7 }, salesUser, nextCmd());

    const flAfterUpdate = getRows(s, 'fulfillment_lines').find(row => row['id'] === flId)!;
    expect((flAfterUpdate['warehouseAlerts'] as unknown[]).length).toBe(1);
    expect(flAfterUpdate['statusExtended']).toBe('recall_pending');

    // Warehouse returns the excess 3 units
    const retu = await runCommand(tx, 'returnPickedUnits', {
      fulfillmentLineId: flId,
      qty: 3,
      reason: 'qty drop return',
    }, salesUser, nextCmd());
    expect(retu.ok).toBe(true);

    // actualQty is now 7 (10 - 3)
    const flAfterReturn = getRows(s, 'fulfillment_lines').find(row => row['id'] === flId)!;
    expect(Number(flAfterReturn['actualQty'])).toBe(7);

    // Alert is still there — must be acknowledged explicitly
    expect((flAfterReturn['warehouseAlerts'] as unknown[]).length).toBe(1);

    // Acknowledge the alert
    const ack = await runCommand(tx, 'acknowledgeWarehouseAlert', {
      fulfillmentLineId: flId,
      alertIndex: 0,
    }, salesUser, nextCmd());
    expect(ack.ok).toBe(true);

    // Alert cleared + statusExtended null
    const flAfterAck = getRows(s, 'fulfillment_lines').find(row => row['id'] === flId)!;
    expect((flAfterAck['warehouseAlerts'] as unknown[]).length).toBe(0);
    expect(flAfterAck['statusExtended']).toBeNull();

    // Batch available/reserved qty adjusted by return
    const batch = getRows(s, 'batches').find(b => b['id'] === BATCH_ID)!;
    // reservedQty was 30, returnPickedUnits reduces reserved by min(available, qty):
    // nextAvailable = 100 + 3 = 103; nextReserved = max(0, 30 - 3) = 27
    expect(Number(batch['availableQty'])).toBe(103);
    expect(Number(batch['reservedQty'])).toBe(27);

    // An inventory_movements row of kind='pick_return' was written
    const movements = getRows(s, 'inventory_movements');
    const pickReturn = movements.find(m => m['kind'] === 'pick_return');
    expect(pickReturn).toBeDefined();
    expect(Number(pickReturn!['qtyDelta'])).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 — Cancel with picked: cancelSalesOrder blocked → cancelFulfillmentLine → cancel succeeds
// ---------------------------------------------------------------------------

describe('Scenario 4: cancel with picked lines — block then resolve', () => {
  it('blocks cancelSalesOrder when fulfillment lines have actual_qty > 0', async () => {
    seedBaseline(s, [LINE1_ID]);
    const tx = makeTx(s);

    const release = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    const flId = release.affectedIds[2] as string;
    await runCommand(tx, 'recordWeighAndPack', { fulfillmentLineId: flId, actualQty: 10, actualWeight: 5 }, salesUser, nextCmd());

    // Try to cancel → should be blocked
    await expect(
      runCommand(tx, 'cancelSalesOrder', { orderId: ORDER_ID }, salesUser, nextCmd()),
    ).rejects.toThrow(/Cannot cancel.*has already been picked|picked.*Return picked units/i);
  });

  it('cancelSalesOrder succeeds after cancelFulfillmentLine clears the picked units', async () => {
    seedBaseline(s, [LINE1_ID, LINE2_ID]);
    const tx = makeTx(s);

    // Release both lines and pack one
    const r1 = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    const fl1Id = r1.affectedIds[2] as string;
    const r2 = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE2_ID }, salesUser, nextCmd());
    const fl2Id = r2.affectedIds[2] as string;
    await runCommand(tx, 'recordWeighAndPack', { fulfillmentLineId: fl1Id, actualQty: 10, actualWeight: 5 }, salesUser, nextCmd());

    // cancelFulfillmentLine on the packed line (returns picked units automatically)
    const cfl1 = await runCommand(tx, 'cancelFulfillmentLine', { fulfillmentLineId: fl1Id }, salesUser, nextCmd());
    expect(cfl1.ok).toBe(true);
    const fl1After = getRows(s, 'fulfillment_lines').find(row => row['id'] === fl1Id)!;
    expect(fl1After['statusExtended']).toBe('cancelled');

    // cancelFulfillmentLine on the un-packed line
    const cfl2 = await runCommand(tx, 'cancelFulfillmentLine', { fulfillmentLineId: fl2Id }, salesUser, nextCmd());
    expect(cfl2.ok).toBe(true);

    // Now cancelSalesOrder should succeed
    const cancel = await runCommand(tx, 'cancelSalesOrder', { orderId: ORDER_ID }, salesUser, nextCmd());
    expect(cancel.ok).toBe(true);

    const order = getRows(s, 'sales_orders').find(o => o['id'] === ORDER_ID)!;
    expect(order['status']).toBe('cancelled');
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 — Recall round-trip: release → recall → no orphan fulfillment lines
// ---------------------------------------------------------------------------

describe('Scenario 5: recall round-trip — release then recall', () => {
  it('recallLineFromPicking clears pick_released_at and removes the fulfillment line', async () => {
    seedBaseline(s, [LINE1_ID]);
    const tx = makeTx(s);

    // Release → fulfillment line created
    const release = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    expect(release.ok).toBe(true);
    const flId = release.affectedIds[2] as string;
    const pickListId = release.affectedIds[1] as string;

    // Verify state
    expect(getRows(s, 'fulfillment_lines')).toHaveLength(1);
    expect(getRows(s, 'pick_lists')).toHaveLength(1);
    const lineAfterRelease = getRows(s, 'sales_order_lines').find(l => l['id'] === LINE1_ID)!;
    expect(lineAfterRelease['pickReleasedAt']).not.toBeNull();

    // Recall
    const recall = await runCommand(tx, 'recallLineFromPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    expect(recall.ok).toBe(true);

    // pick_released_at must be null
    const lineAfterRecall = getRows(s, 'sales_order_lines').find(l => l['id'] === LINE1_ID)!;
    expect(lineAfterRecall['pickReleasedAt']).toBeNull();

    // Fulfillment line deleted (no orphan)
    expect(getRows(s, 'fulfillment_lines')).toHaveLength(0);

    // Pick list deleted (was the only remaining FL)
    expect(getRows(s, 'pick_lists')).toHaveLength(0);

    // Recalled IDs are in affectedIds
    expect(recall.affectedIds).toContain(flId);
    expect(recall.affectedIds).toContain(pickListId);
  });

  it('recall is idempotent on a line that was never released', async () => {
    seedBaseline(s, [LINE1_ID]);
    const tx = makeTx(s);

    // Never released → recall should be a no-op
    const recall = await runCommand(tx, 'recallLineFromPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    expect(recall.ok).toBe(true);
    expect(recall.toast).toMatch(/not released/i);

    // Nothing was created or removed
    expect(getRows(s, 'fulfillment_lines')).toHaveLength(0);
    expect(getRows(s, 'pick_lists')).toHaveLength(0);
  });

  it('gracefully handles recall when fulfillment line has actual_qty > 0 (adds recall alert, sets recall_pending)', async () => {
    seedBaseline(s, [LINE1_ID]);
    const tx = makeTx(s);

    const release = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    const flId = release.affectedIds[2] as string;
    await runCommand(tx, 'recordWeighAndPack', { fulfillmentLineId: flId, actualQty: 10, actualWeight: 5 }, salesUser, nextCmd());

    // Recall succeeds (does not throw) — implementation adds a recall alert instead
    const recall = await runCommand(tx, 'recallLineFromPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    expect(recall.ok).toBe(true);

    // FL survives with statusExtended='recall_pending' and a recall alert
    const fl = getRows(s, 'fulfillment_lines').find(row => row['id'] === flId)!;
    expect(fl).toBeDefined();
    expect(fl['statusExtended']).toBe('recall_pending');
    const alerts = fl['warehouseAlerts'] as Array<Record<string, unknown>>;
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[alerts.length - 1]!['type']).toBe('recall');

    // Sales order line's pickReleasedAt is cleared
    const line = getRows(s, 'sales_order_lines').find(l => l['id'] === LINE1_ID)!;
    expect(line['pickReleasedAt']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Credit underwater: pick proceeds, confirmSalesOrder blocks
// ---------------------------------------------------------------------------

describe('Scenario 6: credit underwater — release/pick proceed, confirm blocks', () => {
  it('releaseLineForPicking succeeds even when customer is over credit limit', async () => {
    // Customer at credit limit already
    seedBaseline(s, [LINE1_ID], {
      customer: { balance: '99999.00', creditLimit: '100000.00' },
      // order total will be ~500 (10 * 50) — well over the 1.00 remaining
    });
    const tx = makeTx(s);

    // Release does NOT check credit — should succeed
    const release = await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    expect(release.ok).toBe(true);

    const flId = release.affectedIds[2] as string;

    // recordWeighAndPack also has no credit check — should succeed
    const pack = await runCommand(tx, 'recordWeighAndPack', {
      fulfillmentLineId: flId,
      actualQty: 10,
      actualWeight: 5,
    }, salesUser, nextCmd());
    expect(pack.ok).toBe(true);
  });

  it('confirmSalesOrder warns but does not block when customer exceeds credit limit', async () => {
    seedBaseline(s, [LINE1_ID], {
      customer: {
        balance: '99999.00',     // almost at limit
        creditLimit: '100000.00', // order total ~500 → over limit
      },
    });
    const tx = makeTx(s);

    // Release works fine
    await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());

    // Confirm should warn but not block (TER-1659: credit hold → advisory)
    const result = await runCommand(tx, 'confirmSalesOrder', { orderId: ORDER_ID }, salesUser, nextCmd());
    expect(result.ok).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some(w => /credit/i.test(w))).toBe(true);
  });

  it('confirmSalesOrder succeeds when customer has sufficient headroom', async () => {
    seedBaseline(s, [LINE1_ID], {
      customer: { balance: '0.00', creditLimit: '100000.00' },
    });
    const tx = makeTx(s);

    await runCommand(tx, 'releaseLineForPicking', { lineId: LINE1_ID }, salesUser, nextCmd());
    const confirm = await runCommand(tx, 'confirmSalesOrder', { orderId: ORDER_ID }, salesUser, nextCmd());
    expect(confirm.ok).toBe(true);

    const order = getRows(s, 'sales_orders').find(o => o['id'] === ORDER_ID)!;
    expect(order['status']).toBe('confirmed');
  });
});

// ---------------------------------------------------------------------------
// Bonus: releaseLinesForPicking bulk command
// ---------------------------------------------------------------------------

describe('releaseLinesForPicking — bulk release', () => {
  it('releases multiple lines in one call and aggregates affectedIds', async () => {
    seedBaseline(s, [LINE1_ID, LINE2_ID, LINE3_ID]);
    const tx = makeTx(s);

    const result = await runCommand(tx, 'releaseLinesForPicking', {
      lineIds: [LINE1_ID, LINE2_ID, LINE3_ID],
    }, salesUser, nextCmd());

    expect(result.ok).toBe(true);
    expect(result.toast).toMatch(/3 line\(s\) released/i);

    // One pick list, three fulfillment lines
    expect(getRows(s, 'pick_lists')).toHaveLength(1);
    expect(getRows(s, 'fulfillment_lines')).toHaveLength(3);

    // All three SOLs have pickReleasedAt set
    const lines = getRows(s, 'sales_order_lines');
    expect(lines.every(l => l['pickReleasedAt'] !== null)).toBe(true);
  });

  it('rejects empty lineIds', async () => {
    seedBaseline(s, [LINE1_ID]);
    const tx = makeTx(s);

    await expect(
      runCommand(tx, 'releaseLinesForPicking', { lineIds: [] }, salesUser, nextCmd()),
    ).rejects.toThrow(/lineIds must be a non-empty array/i);
  });
});
