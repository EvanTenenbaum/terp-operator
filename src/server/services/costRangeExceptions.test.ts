// Issue #64 follow-up tests.
//
// Sale-time cost-range exception flow at the commandBus dispatcher
// level (runCommand): range-priced batch lines start unresolved,
// setLineLandedCost in/out of range, below-floor vendor approval gate,
// and resolveVendorApproval clearing the gate.
//
// Why we do not exercise confirmSalesOrder/postSalesOrder end-to-end here:
//
//   postSalesOrder takes pessimistic row locks via raw `SELECT ... FOR UPDATE`
//   on customers and batches, creates invoice + ledger + inventory movement
//   rows, and walks a consignment vendor-bill branch. Building a faithful
//   table-aware mock for all of that crosses the threshold the request set
//   ("if full integration harness is too heavy, explain exactly why"). The
//   exception math itself (computeOrderExceptionTotals) and the per-line
//   gate (canConfirmOrPost / findExceptionBlockedLine via canConfirmOrPost)
//   are already covered as pure unit tests in
//   src/shared/saleLineCostExceptions.test.ts. The tests below cover the
//   dispatcher-level wiring that those helpers feed into.
//
// vendorBills non-mutation is asserted indirectly here: every test below
// runs against a mock tx that records every insert/update/delete by table
// reference, and the relevant flow tests assert vendorBills was never
// touched.

import { describe, it, expect, vi } from 'vitest';
import { runCommand } from './commandBus';
import { batches, customers, salesOrders, salesOrderLines, vendorBills } from '../schema';
import type { SessionUser } from '../../shared/types';

const OPERATOR: SessionUser = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Op',
  email: 'op@example.com',
  role: 'operator',
  workLoop: 'sales'
};
const MANAGER: SessionUser = {
  id: '00000000-0000-0000-0000-000000000002',
  name: 'Mg',
  email: 'mg@example.com',
  role: 'manager',
  workLoop: 'sales'
};

interface TxLog {
  inserts: Array<{ table: unknown; values: any }>;
  updates: Array<{ table: unknown; values: any }>;
  deletes: Array<{ table: unknown }>;
  executes: Array<unknown>;
}

interface TableState {
  rows: any[];
  returningRows?: any[]; // rows to return from insert .returning()
}

/**
 * Build a small Drizzle-shaped mock transaction whose select/insert/update
 * resolve per-table. Selects return whatever rows the caller pre-loaded for
 * that table; inserts and updates are recorded by table reference. The mock
 * is intentionally naive (it ignores .where filters) — every test that
 * relies on filtering must pre-load only the rows the handler under test
 * would see after the filter.
 */
function makeMockTx(state: Map<unknown, TableState>) {
  const log: TxLog = { inserts: [], updates: [], deletes: [], executes: [] };

  const selectBuilder = (table: unknown) => {
    const rows = () => state.get(table)?.rows ?? [];
    const promiseLike = {
      then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject),
      limit: (_n: number) => Promise.resolve(rows()),
      orderBy: () => ({
        limit: (_n: number) => Promise.resolve(rows()),
        then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject)
      })
    };
    return {
      where: (..._args: any[]) => promiseLike,
      orderBy: () => promiseLike,
      // Direct `.from(t)` without where:
      limit: (_n: number) => Promise.resolve(rows()),
      then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject)
    };
  };

  const tx: any = {
    select: () => ({
      from: (table: unknown) => selectBuilder(table)
    }),
    insert: (table: unknown) => ({
      values: (values: any) => {
        log.inserts.push({ table, values });
        const tableState = state.get(table);
        const returningRows = tableState?.returningRows ?? [{ id: `mock-${log.inserts.length}`, ...values }];
        return {
          returning: () => Promise.resolve(returningRows),
          onConflictDoUpdate: () => Promise.resolve()
        };
      }
    }),
    update: (table: unknown) => ({
      set: (values: any) => {
        log.updates.push({ table, values });
        // Apply the update to the in-memory rows so subsequent selects in
        // the same handler (e.g. recalcOrder / refreshOrderExceptionRollup)
        // observe the change. Naive: we apply to every row in the table
        // because the mock does not filter by .where. That is fine for
        // single-row-per-table tests.
        const tableState = state.get(table);
        if (tableState?.rows) {
          tableState.rows = tableState.rows.map((row) => ({ ...row, ...values }));
        }
        return {
          where: (..._args: any[]) => Promise.resolve(),
          returning: () => Promise.resolve([])
        };
      }
    }),
    delete: (table: unknown) => ({
      where: (..._args: any[]) => {
        log.deletes.push({ table });
        return Promise.resolve();
      }
    }),
    execute: (sql: any) => {
      log.executes.push(sql);
      return Promise.resolve({ rows: [] });
    },
    // TER-1659: confirmSalesOrder now calls enqueueCustomerRecompute, which
    // unwraps session.client from Drizzle ORM tx objects and uses pgClient.query.
    // The mock must provide a query stub that accepts raw SQL.
    session: {
      client: {
        query: (_sql: string, _params?: any[]) => Promise.resolve({ rowCount: 1, rows: [] })
      }
    }
  };

  return { tx, log };
}

const ITEM_ID = '00000000-0000-0000-0000-0000000000aa';



// -----------------------------------------------------------------------------
// Sale-time cost-range exception flow at the runCommand dispatcher level.
// -----------------------------------------------------------------------------

const ORDER_ID = '00000000-0000-0000-0000-0000000000b1';
const LINE_ID = '00000000-0000-0000-0000-0000000000c1';
const BATCH_ID = '00000000-0000-0000-0000-0000000000d1';

function rangeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH_ID,
    name: 'Range Batch',
    status: 'posted',
    itemId: ITEM_ID,
    unitCost: '0.00',
    unitPrice: '70.00',
    availableQty: '50.000',
    reservedQty: '0.000',
    priceRange: '60-72',
    ownershipStatus: 'OFC',
    tags: [],
    validationIssues: [],
    arrivalConfirmed: true,
    batchCode: 'BATCH-RNG-001',
    vendorId: null,
    ...overrides
  };
}

function draftOrder() {
  return {
    id: ORDER_ID,
    orderNo: 'SO-DEMO-001',
    status: 'draft',
    customerId: '00000000-0000-0000-0000-0000000000e1',
    total: '0.00',
    internalMargin: '0.00',
    pricingStrategy: 'standard',
    vendorApprovalPending: false,
    marginWaivedTotal: '0.00',
    lossRecognizedTotal: '0.00'
  };
}

function rangeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: LINE_ID,
    orderId: ORDER_ID,
    batchId: BATCH_ID,
    itemName: 'Range Batch',
    qty: '2.000',
    unitPrice: '70.00',
    unitCost: '66.00', // midpoint placeholder
    unitCostResolved: false,
    landedCostBasis: null,
    landedCostReason: null,
    // Issue #64 reviewer fix: range batch lines have no landed cost until
    // setLineLandedCost resolves it. The floor stays null until then.
    priceFloor: null,
    belowFloorReason: null,
    belowFloorNote: null,
    vendorApprovalState: 'none',
    validationIssues: ['Pick landed COGS in $60-$72.'],
    status: 'needs_fix',
    sourceRowKey: 'BATCH-RNG-001',
    unresolvedSourceText: null,
    ...overrides
  };
}

describe('Issue #64: range-priced sales line starts unresolved', () => {
  it('addSalesOrderLine creates a needs_fix line with unitCostResolved=false and a midpoint placeholder when the batch has a price range', async () => {
    const order = draftOrder();
    const batch = rangeBatch();
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [order] }],
      [batches, { rows: [batch] }],
      [salesOrderLines, { rows: [] }] // recalcOrder sums no lines after insert (mock-naive)
    ]);
    const { tx, log } = makeMockTx(state);

    await runCommand(tx, 'addSalesOrderLine', {
      orderId: ORDER_ID,
      batchId: BATCH_ID,
      qty: 2,
      unitPrice: 70
    }, OPERATOR, 'cmd-add-range-line');

    const lineInsert = log.inserts.find((entry) => entry.table === salesOrderLines);
    expect(lineInsert).toBeDefined();
    expect(lineInsert!.values.unitCostResolved).toBe(false);
    expect(lineInsert!.values.landedCostBasis).toBeNull();
    // midpoint of 60..72 = 66.00
    expect(lineInsert!.values.unitCost).toBe('66.00');
    // Issue #64 reviewer fix: range batches do not have a resolved landed cost
    // at add time, so priceFloor stays null until setLineLandedCost runs.
    // The batch list-price (unitPrice) is too noisy a vendor floor.
    expect(lineInsert!.values.priceFloor).toBeNull();
    expect(lineInsert!.values.status).toBe('needs_fix');
    expect(
      (lineInsert!.values.validationIssues as string[]).some((issue) =>
        issue.includes('Pick landed COGS')
      )
    ).toBe(true);
  });

  it('addSalesOrderLine creates a resolved fixed-cost line when the batch has no priceRange and captures priceFloor from landed cost', async () => {
    const order = draftOrder();
    const fixedBatch = rangeBatch({
      priceRange: null,
      unitCost: '12.00',
      unitPrice: '20.00'
    });
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [order] }],
      [batches, { rows: [fixedBatch] }],
      [salesOrderLines, { rows: [] }]
    ]);
    const { tx, log } = makeMockTx(state);

    await runCommand(tx, 'addSalesOrderLine', {
      orderId: ORDER_ID,
      batchId: BATCH_ID,
      qty: 3,
      unitPrice: 20
    }, OPERATOR, 'cmd-add-fixed-line');

    const lineInsert = log.inserts.find((entry) => entry.table === salesOrderLines);
    expect(lineInsert).toBeDefined();
    expect(lineInsert!.values.unitCostResolved).toBe(true);
    expect(lineInsert!.values.landedCostBasis).toBe('fixed');
    expect(lineInsert!.values.unitCost).toBe('12.00');
    // Issue #64 reviewer fix: priceFloor reflects landed cost (12), not list
    // price (20). Cheaper than landed cost requires a reason.
    expect(lineInsert!.values.priceFloor).toBe('12.00');
  });
});

describe('Issue #64: updateSalesOrderLine batch swap rebuilds COGS setup', () => {
  const NEW_BATCH_ID = '00000000-0000-0000-0000-0000000000d9';

  function fixedLine(overrides: Record<string, unknown> = {}) {
    return {
      id: LINE_ID,
      orderId: ORDER_ID,
      batchId: BATCH_ID,
      itemName: 'Fixed Batch',
      qty: '1.000',
      unitPrice: '20.00',
      unitCost: '12.00',
      unitCostResolved: true,
      landedCostBasis: 'fixed',
      landedCostReason: null,
      priceFloor: '12.00',
      belowFloorReason: null,
      belowFloorNote: null,
      vendorApprovalState: 'none',
      validationIssues: [],
      status: 'draft',
      sourceRowKey: 'BATCH-FIXED-001',
      unresolvedSourceText: null,
      ...overrides
    };
  }

  it('fixed → range: sets unitCostResolved=false, landedCostBasis=null, priceFloor=null, appends Pick landed COGS issue', async () => {
    const line = fixedLine();
    const newRangeBatch = rangeBatch({ id: NEW_BATCH_ID });
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [draftOrder()] }],
      [salesOrderLines, { rows: [line] }],
      [batches, { rows: [newRangeBatch] }]
    ]);
    const { tx, log } = makeMockTx(state);

    await runCommand(tx, 'updateSalesOrderLine', {
      lineId: LINE_ID,
      batchId: NEW_BATCH_ID
    }, OPERATOR, 'cmd-swap-fixed-to-range');

    const lineUpdate = log.updates.find((entry) => entry.table === salesOrderLines);
    expect(lineUpdate).toBeDefined();
    expect(lineUpdate!.values.batchId).toBe(NEW_BATCH_ID);
    expect(lineUpdate!.values.unitCostResolved).toBe(false);
    expect(lineUpdate!.values.landedCostBasis).toBeNull();
    expect(lineUpdate!.values.priceFloor).toBeNull();
    expect(lineUpdate!.values.unitCost).toBe('66.00'); // midpoint of 60..72
    expect(
      (lineUpdate!.values.validationIssues as string[]).some((issue) =>
        issue.startsWith('Pick landed COGS')
      )
    ).toBe(true);
  });

  it('range → fixed: sets unitCostResolved=true, landedCostBasis=fixed, priceFloor=landed cost, drops Pick landed COGS issue', async () => {
    const line = rangeLine({
      unitCostResolved: false,
      validationIssues: ['Pick landed COGS in $60-$72.']
    });
    const newFixedBatch = rangeBatch({
      id: NEW_BATCH_ID,
      priceRange: null,
      unitCost: '15.00',
      unitPrice: '25.00'
    });
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [draftOrder()] }],
      [salesOrderLines, { rows: [line] }],
      [batches, { rows: [newFixedBatch] }]
    ]);
    const { tx, log } = makeMockTx(state);

    await runCommand(tx, 'updateSalesOrderLine', {
      lineId: LINE_ID,
      batchId: NEW_BATCH_ID
    }, OPERATOR, 'cmd-swap-range-to-fixed');

    const lineUpdate = log.updates.find((entry) => entry.table === salesOrderLines);
    expect(lineUpdate).toBeDefined();
    expect(lineUpdate!.values.batchId).toBe(NEW_BATCH_ID);
    expect(lineUpdate!.values.unitCostResolved).toBe(true);
    expect(lineUpdate!.values.landedCostBasis).toBe('fixed');
    expect(lineUpdate!.values.unitCost).toBe('15.00');
    expect(lineUpdate!.values.priceFloor).toBe('15.00');
    expect(
      (lineUpdate!.values.validationIssues as string[]).some((issue) =>
        issue.startsWith('Pick landed COGS')
      )
    ).toBe(false);
  });
});

describe('Issue #64: editable-order guard', () => {
  for (const blockedStatus of ['posted', 'cancelled', 'archived']) {
    it(`setLineLandedCost rejects on a ${blockedStatus} parent order`, async () => {
      const order = { ...draftOrder(), status: blockedStatus };
      const batch = rangeBatch();
      const line = rangeLine();
      const state = new Map<unknown, TableState>([
        [salesOrders, { rows: [order] }],
        [batches, { rows: [batch] }],
        [salesOrderLines, { rows: [line] }]
      ]);
      const { tx, log } = makeMockTx(state);
      await expect(runCommand(tx, 'setLineLandedCost', {
        lineId: LINE_ID,
        landedCost: 65,
        basis: 'manual'
      }, OPERATOR, `cmd-set-cogs-${blockedStatus}`)).rejects.toThrow(/posted|cancelled|archived|not editable/i);
      expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
    });

    it(`setLineBelowFloorReason rejects on a ${blockedStatus} parent order`, async () => {
      const order = { ...draftOrder(), status: blockedStatus };
      const line = rangeLine({
        unitPrice: '60.00',
        unitCost: '66.00',
        unitCostResolved: true,
        validationIssues: [],
        status: 'draft'
      });
      const state = new Map<unknown, TableState>([
        [salesOrders, { rows: [order] }],
        [salesOrderLines, { rows: [line] }]
      ]);
      const { tx, log } = makeMockTx(state);
      await expect(runCommand(tx, 'setLineBelowFloorReason', {
        lineId: LINE_ID,
        reason: 'waive_margin'
      }, OPERATOR, `cmd-below-floor-${blockedStatus}`)).rejects.toThrow(/posted|cancelled|archived|not editable/i);
      expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
    });

    it(`resolveVendorApproval rejects on a ${blockedStatus} parent order`, async () => {
      const order = { ...draftOrder(), status: blockedStatus };
      const line = rangeLine({
        belowFloorReason: 'vendor_approval_pending',
        vendorApprovalState: 'pending',
        unitCostResolved: true,
        validationIssues: [],
        status: 'draft'
      });
      const state = new Map<unknown, TableState>([
        [salesOrders, { rows: [order] }],
        [salesOrderLines, { rows: [line] }]
      ]);
      const { tx, log } = makeMockTx(state);
      await expect(runCommand(tx, 'resolveVendorApproval', {
        lineId: LINE_ID,
        state: 'approved'
      }, OPERATOR, `cmd-resolve-${blockedStatus}`)).rejects.toThrow(/posted|cancelled|archived|not editable/i);
      expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
    });
  }
});

describe('Issue #64: declined vendor approval blocks confirm/post', () => {
  it('confirmSalesOrder rejects when any line has vendorApprovalState=declined', async () => {
    const order = draftOrder();
    const declinedLine = rangeLine({
      unitPrice: '60.00',
      unitCost: '66.00',
      unitCostResolved: true,
      belowFloorReason: 'vendor_approval_pending',
      vendorApprovalState: 'declined',
      validationIssues: [],
      status: 'draft'
    });
    const customer = { id: '00000000-0000-0000-0000-0000000000e1', name: 'Test Customer', balance: '0.00', creditLimit: '100000.00', creditLimitSource: 'manual' };
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [order] }],
      [salesOrderLines, { rows: [declinedLine] }],
      [customers, { rows: [customer] }]
    ]);
    const { tx, log } = makeMockTx(state);

    await expect(runCommand(tx, 'confirmSalesOrder', {
      orderId: ORDER_ID
    }, OPERATOR, 'cmd-confirm-declined')).rejects.toThrow(/declined|reprice|re-request/i);

    // vendorBills must never be touched on a blocked confirm.
    expect(log.updates.find((entry) => entry.table === vendorBills)).toBeUndefined();
    expect(log.inserts.find((entry) => entry.table === vendorBills)).toBeUndefined();
  });
});

describe('Issue #64: setLineLandedCost', () => {
  it('in-range pick clears the gate (unitCostResolved=true, basis recorded)', async () => {
    const order = draftOrder();
    const batch = rangeBatch();
    const line = rangeLine();
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [order] }],
      [batches, { rows: [batch] }],
      [salesOrderLines, { rows: [line] }]
    ]);
    const { tx, log } = makeMockTx(state);

    const result = await runCommand(tx, 'setLineLandedCost', {
      lineId: LINE_ID,
      landedCost: 65,
      basis: 'manual'
    }, OPERATOR, 'cmd-set-cogs-inrange');

    expect(result.ok).toBe(true);
    const lineUpdate = log.updates.find((entry) => entry.table === salesOrderLines);
    expect(lineUpdate).toBeDefined();
    expect(lineUpdate!.values.unitCost).toBe('65.00');
    expect(lineUpdate!.values.unitCostResolved).toBe(true);
    expect(lineUpdate!.values.landedCostBasis).toBe('manual');
    // Issue #64 reviewer fix: setLineLandedCost on a previously-null priceFloor
    // (range batch case) writes priceFloor = landed cost so the below-floor
    // gate uses landed cost, not list price.
    expect(lineUpdate!.values.priceFloor).toBe('65.00');
    // The "Pick landed COGS" validation issue should be cleared.
    expect((lineUpdate!.values.validationIssues as string[]).some((issue) =>
      issue.startsWith('Pick landed COGS')
    )).toBe(false);
  });

  it('out-of-range pick without override basis is rejected', async () => {
    const order = draftOrder();
    const batch = rangeBatch();
    const line = rangeLine();
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [order] }],
      [batches, { rows: [batch] }],
      [salesOrderLines, { rows: [line] }]
    ]);
    const { tx, log } = makeMockTx(state);

    await expect(runCommand(tx, 'setLineLandedCost', {
      lineId: LINE_ID,
      landedCost: 40, // below 60..72
      basis: 'manual'
    }, OPERATOR, 'cmd-set-cogs-oor')).rejects.toThrow(/below the batch range floor/i);

    // No update should have hit the sales line on a rejected pick.
    expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
  });

  it('out-of-range pick with override basis + manager role + reason succeeds', async () => {
    const order = draftOrder();
    const batch = rangeBatch();
    const line = rangeLine();
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [order] }],
      [batches, { rows: [batch] }],
      [salesOrderLines, { rows: [line] }]
    ]);
    const { tx, log } = makeMockTx(state);

    const result = await runCommand(tx, 'setLineLandedCost', {
      lineId: LINE_ID,
      landedCost: 80,
      basis: 'override',
      reason: 'Damaged inventory, vendor will credit difference.'
    }, MANAGER, 'cmd-set-cogs-override');

    expect(result.ok).toBe(true);
    const lineUpdate = log.updates.find((entry) => entry.table === salesOrderLines);
    expect(lineUpdate).toBeDefined();
    expect(lineUpdate!.values.landedCostBasis).toBe('override');
    expect(lineUpdate!.values.landedCostReason).toMatch(/Damaged inventory/);
  });
});

describe('Issue #64: below-floor vendor approval gate', () => {
  it('setLineBelowFloorReason with vendor_approval_pending sets line vendorApprovalState=pending and refreshes order rollup', async () => {
    const order = draftOrder();
    // Below-floor line: unitPrice 60 < priceFloor 66 (landed cost).
    const line = rangeLine({
      unitPrice: '60.00',
      unitCost: '66.00',
      unitCostResolved: true,
      priceFloor: '66.00',
      validationIssues: [],
      status: 'draft'
    });
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [order] }],
      [salesOrderLines, { rows: [line] }]
    ]);
    const { tx, log } = makeMockTx(state);

    const result = await runCommand(tx, 'setLineBelowFloorReason', {
      lineId: LINE_ID,
      reason: 'vendor_approval_pending',
      note: 'Calling vendor before posting.'
    }, OPERATOR, 'cmd-below-floor-vendor');

    expect(result.ok).toBe(true);
    const lineUpdate = log.updates.find((entry) => entry.table === salesOrderLines);
    expect(lineUpdate).toBeDefined();
    expect(lineUpdate!.values.belowFloorReason).toBe('vendor_approval_pending');
    expect(lineUpdate!.values.vendorApprovalState).toBe('pending');
    // Order rollup refresh should also issue an update against salesOrders.
    expect(log.updates.find((entry) => entry.table === salesOrders)).toBeDefined();
  });

  it('confirmSalesOrder rejects when any line is awaiting vendor approval', async () => {
    const customer = { id: '00000000-0000-0000-0000-0000000000e1', name: 'Test Customer', balance: '0.00', creditLimit: '100000.00', creditLimitSource: 'manual' };
    const order = draftOrder();
    const blockedLine = rangeLine({
      unitPrice: '60.00',
      unitCost: '66.00',
      unitCostResolved: true,
      priceFloor: '66.00',
      belowFloorReason: 'vendor_approval_pending',
      vendorApprovalState: 'pending',
      validationIssues: [],
      status: 'draft'
    });
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [order] }],
      [salesOrderLines, { rows: [blockedLine] }],
      [customers, { rows: [customer] }]
    ]);
    const { tx, log } = makeMockTx(state);

    await expect(runCommand(tx, 'confirmSalesOrder', {
      orderId: ORDER_ID
    }, OPERATOR, 'cmd-confirm-blocked')).rejects.toThrow(/vendor approval/i);

    // vendorBills must never be touched on a blocked confirm.
    expect(log.updates.find((entry) => entry.table === vendorBills)).toBeUndefined();
    expect(log.inserts.find((entry) => entry.table === vendorBills)).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Final-review blocker repair: archivedAt-set (soft-archive) orders must
  // be treated as non-editable just like status=posted/cancelled/archived.
  // A draft order with archived_at != null was previously slipping through
  // assertSalesOrderEditableById because the gate only inspected status.
  // -----------------------------------------------------------------------

  describe('Issue #64 follow-up: archivedAt soft-archive guard on exception commands', () => {
    function archivedDraftOrder() {
      return { ...draftOrder(), status: 'draft', archivedAt: new Date('2026-01-01T00:00:00Z') };
    }

    it('setLineLandedCost rejects when the parent order has archivedAt set even if status=draft', async () => {
      const batch = rangeBatch();
      const line = rangeLine();
      const state = new Map<unknown, TableState>([
        [salesOrders, { rows: [archivedDraftOrder()] }],
        [batches, { rows: [batch] }],
        [salesOrderLines, { rows: [line] }]
      ]);
      const { tx, log } = makeMockTx(state);
      await expect(runCommand(tx, 'setLineLandedCost', {
        lineId: LINE_ID,
        landedCost: 65,
        basis: 'manual'
      }, OPERATOR, 'cmd-archived-set-cogs')).rejects.toThrow(/archiv|not editable/i);
      expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
    });

    it('setLineBelowFloorReason rejects when the parent order has archivedAt set even if status=draft', async () => {
      const line = rangeLine({
        unitPrice: '60.00',
        unitCost: '66.00',
        unitCostResolved: true,
        priceFloor: '66.00',
        validationIssues: [],
        status: 'draft'
      });
      const state = new Map<unknown, TableState>([
        [salesOrders, { rows: [archivedDraftOrder()] }],
        [salesOrderLines, { rows: [line] }]
      ]);
      const { tx, log } = makeMockTx(state);
      await expect(runCommand(tx, 'setLineBelowFloorReason', {
        lineId: LINE_ID,
        reason: 'waive_margin'
      }, OPERATOR, 'cmd-archived-below-floor')).rejects.toThrow(/archiv|not editable/i);
      expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
    });

    it('resolveVendorApproval rejects when the parent order has archivedAt set even if status=draft', async () => {
      const line = rangeLine({
        belowFloorReason: 'vendor_approval_pending',
        vendorApprovalState: 'pending',
        unitCostResolved: true,
        priceFloor: '66.00',
        validationIssues: [],
        status: 'draft'
      });
      const state = new Map<unknown, TableState>([
        [salesOrders, { rows: [archivedDraftOrder()] }],
        [salesOrderLines, { rows: [line] }]
      ]);
      const { tx, log } = makeMockTx(state);
      await expect(runCommand(tx, 'resolveVendorApproval', {
        lineId: LINE_ID,
        state: 'approved'
      }, MANAGER, 'cmd-archived-resolve')).rejects.toThrow(/archiv|not editable/i);
      expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
    });

    it('resolveVendorApproval via orderId rejects when the parent order has archivedAt set even if status=draft', async () => {
      const line = rangeLine({
        belowFloorReason: 'vendor_approval_pending',
        vendorApprovalState: 'pending',
        unitCostResolved: true,
        priceFloor: '66.00',
        validationIssues: [],
        status: 'draft'
      });
      const state = new Map<unknown, TableState>([
        [salesOrders, { rows: [archivedDraftOrder()] }],
        [salesOrderLines, { rows: [line] }]
      ]);
      const { tx, log } = makeMockTx(state);
      await expect(runCommand(tx, 'resolveVendorApproval', {
        orderId: ORDER_ID,
        state: 'approved'
      }, MANAGER, 'cmd-archived-resolve-by-order')).rejects.toThrow(/archiv|not editable/i);
      expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Final-review blocker repair: updateSalesOrderLine must also gate on the
  // parent order's editability. Previously it walked straight into mutating
  // lines on posted/cancelled/archived orders, which corrupted the
  // accounting / inventory snapshot for closed orders.
  // -----------------------------------------------------------------------

  describe('updateSalesOrderLine: parent order editability guard (final-review repair)', () => {
    function blockedOrder(status: string, archivedAt: Date | null = null) {
      return { ...draftOrder(), status, archivedAt };
    }

    function fixedReadyLine(overrides: Record<string, unknown> = {}) {
      return {
        id: LINE_ID,
        orderId: ORDER_ID,
        batchId: BATCH_ID,
        itemName: 'Fixed Batch',
        qty: '1.000',
        unitPrice: '20.00',
        unitCost: '12.00',
        unitCostResolved: true,
        landedCostBasis: 'fixed',
        landedCostReason: null,
        priceFloor: '12.00',
        belowFloorReason: null,
        belowFloorNote: null,
        vendorApprovalState: 'none',
        validationIssues: [],
        status: 'draft',
        sourceRowKey: 'BATCH-FIXED-001',
        unresolvedSourceText: null,
        ...overrides
      };
    }

    for (const blockedStatus of ['posted', 'cancelled', 'archived']) {
      it(`rejects qty/unitPrice update on a ${blockedStatus} parent order and never updates the line`, async () => {
        const line = fixedReadyLine();
        const state = new Map<unknown, TableState>([
          [salesOrders, { rows: [blockedOrder(blockedStatus)] }],
          [salesOrderLines, { rows: [line] }],
          [batches, { rows: [rangeBatch()] }]
        ]);
        const { tx, log } = makeMockTx(state);
        await expect(runCommand(tx, 'updateSalesOrderLine', {
          lineId: LINE_ID,
          qty: 5,
          unitPrice: 99
        }, OPERATOR, `cmd-update-${blockedStatus}-qty`)).rejects.toThrow(/posted|cancelled|archived|not editable/i);
        expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
      });

      it(`rejects batchId swap on a ${blockedStatus} parent order and never updates the line`, async () => {
        const NEW_BATCH_ID = '00000000-0000-0000-0000-0000000000d9';
        const line = fixedReadyLine();
        const state = new Map<unknown, TableState>([
          [salesOrders, { rows: [blockedOrder(blockedStatus)] }],
          [salesOrderLines, { rows: [line] }],
          [batches, { rows: [rangeBatch({ id: NEW_BATCH_ID })] }]
        ]);
        const { tx, log } = makeMockTx(state);
        await expect(runCommand(tx, 'updateSalesOrderLine', {
          lineId: LINE_ID,
          batchId: NEW_BATCH_ID
        }, OPERATOR, `cmd-update-${blockedStatus}-swap`)).rejects.toThrow(/posted|cancelled|archived|not editable/i);
        expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
      });
    }

    it('rejects line update when parent order has archivedAt set even if status=draft', async () => {
      const line = fixedReadyLine();
      const state = new Map<unknown, TableState>([
        [salesOrders, { rows: [blockedOrder('draft', new Date('2026-01-01T00:00:00Z'))] }],
        [salesOrderLines, { rows: [line] }],
        [batches, { rows: [rangeBatch()] }]
      ]);
      const { tx, log } = makeMockTx(state);
      await expect(runCommand(tx, 'updateSalesOrderLine', {
        lineId: LINE_ID,
        qty: 7
      }, OPERATOR, 'cmd-update-archived-qty')).rejects.toThrow(/archiv|not editable/i);
      expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeUndefined();
    });

    it('still allows update on a confirmed parent order (confirmed remains editable pre-post)', async () => {
      const line = fixedReadyLine();
      const state = new Map<unknown, TableState>([
        [salesOrders, { rows: [blockedOrder('confirmed')] }],
        [salesOrderLines, { rows: [line] }],
        [batches, { rows: [rangeBatch({ priceRange: null, unitCost: '12.00', unitPrice: '20.00' })] }]
      ]);
      const { tx, log } = makeMockTx(state);
      const result = await runCommand(tx, 'updateSalesOrderLine', {
        lineId: LINE_ID,
        qty: 2
      }, OPERATOR, 'cmd-update-confirmed-qty');
      expect(result.ok).toBe(true);
      expect(log.updates.find((entry) => entry.table === salesOrderLines)).toBeDefined();
    });
  });

  it('resolveVendorApproval flips line vendor_approval_state and refreshes order rollup', async () => {
    const order = draftOrder();
    const pendingLine = rangeLine({
      unitPrice: '60.00',
      unitCost: '66.00',
      unitCostResolved: true,
      priceFloor: '66.00',
      belowFloorReason: 'vendor_approval_pending',
      vendorApprovalState: 'pending',
      validationIssues: [],
      status: 'draft'
    });
    const state = new Map<unknown, TableState>([
      [salesOrders, { rows: [order] }],
      [salesOrderLines, { rows: [pendingLine] }]
    ]);
    const { tx, log } = makeMockTx(state);

    const result = await runCommand(tx, 'resolveVendorApproval', {
      lineId: LINE_ID,
      state: 'approved'
    }, MANAGER, 'cmd-resolve-approved');

    expect(result.ok).toBe(true);
    const lineUpdate = log.updates.find((entry) => entry.table === salesOrderLines);
    expect(lineUpdate).toBeDefined();
    expect(lineUpdate!.values.vendorApprovalState).toBe('approved');
    // Order-level rollup update should still fire so the order no longer
    // shows vendor_approval_pending=true.
    const orderUpdate = log.updates.find((entry) => entry.table === salesOrders);
    expect(orderUpdate).toBeDefined();
    expect(orderUpdate!.values.vendorApprovalPending).toBe(false);
    // vendorBills must never be touched while resolving vendor approval.
    expect(log.updates.find((entry) => entry.table === vendorBills)).toBeUndefined();
    expect(log.inserts.find((entry) => entry.table === vendorBills)).toBeUndefined();
  });
});
