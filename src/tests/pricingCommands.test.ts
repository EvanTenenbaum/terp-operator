import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), transaction: vi.fn() },
  pool: { query: vi.fn() }
}));

vi.mock('../server/services/journal', () => ({
  appendJsonlJournal: vi.fn(async () => undefined)
}));

vi.mock('../server/services/mediaStorage', () => ({
  deleteMedia: vi.fn(async () => undefined)
}));

import {
  setLineLandedCost,
  setCustomerPricingRule,
  setDefaultPricingRule,
  priceSalesOrder,
  confirmSalesOrder,
  postSalesOrder,
  reverseCommandById
} from '../server/services/commandBus';

import {
  salesOrders as salesOrdersTable,
  salesOrderLines as salesOrderLinesTable,
  batches as batchesTable,
  invoices as invoicesTable,
  inventoryMovements as inventoryMovementsTable,
  clientLedgerEntries as clientLedgerEntriesTable,
  vendorBills as vendorBillsTable,
  correctionJournalEntries as correctionJournalEntriesTable,
  periodLocks as periodLocksTable,
  customers as customersTable,
  commandJournal as commandJournalTable
} from '../server/schema';

const LINE_ID = '11111111-1111-1111-1111-111111111111';
const ORDER_ID = '22222222-2222-2222-2222-222222222222';
const BATCH_ID = '33333333-3333-3333-3333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-4444-444444444444';

const MOCK_USER = { id: 'user-1', name: 'Test', email: 'test@example.com', role: 'operator' as const, workLoop: 'sales' };

interface Row {
  [key: string]: unknown;
}

function makeSelectChain(rows: Row[]) {
  // chain: tx.select(...).from(t).where(...).limit(n) | tx.select(...).from(t).where(...) returning rows
  const result: any = Promise.resolve(rows);
  const limit = vi.fn(() => Promise.resolve(rows));
  const where = vi.fn(() => Object.assign(Promise.resolve(rows), { limit }));
  const from = vi.fn(() => Object.assign(Promise.resolve(rows), { where }));
  return { from, where, limit, result };
}

function makeTxForSelect(handlers: Array<(table: any) => Row[] | undefined>) {
  let call = 0;
  const select = vi.fn(() => ({
    from: (table: any) => {
      const handler = handlers[call] || (() => []);
      const rows = handler(table) ?? [];
      call += 1;
      const limit = vi.fn(() => Promise.resolve(rows));
      const where = vi.fn(() => {
        const p = Promise.resolve(rows) as any;
        p.limit = limit;
        return p;
      });
      const p = Promise.resolve(rows) as any;
      p.where = where;
      p.limit = limit;
      return p;
    }
  }));
  return select;
}

function makeUpdate(captureSet?: (value: unknown) => void) {
  return vi.fn(() => ({
    set: vi.fn((value: unknown) => {
      captureSet?.(value);
      return { where: vi.fn(() => Promise.resolve()) };
    })
  }));
}

function makeUpdateAll(captures: Array<unknown>) {
  return vi.fn(() => ({
    set: vi.fn((value: unknown) => {
      captures.push(value);
      return { where: vi.fn(() => Promise.resolve()) };
    })
  }));
}

function makeInsert(returnedRows: Row[] = []) {
  return vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve(returnedRows))
    })),
    onConflictDoNothing: vi.fn(() => Promise.resolve())
  }));
}

describe('setLineLandedCost', () => {
  it('updates the line and marks unitCostResolved when landed COGS is in batch range', async () => {
    const updates: any[] = [];
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: LINE_ID, batchId: BATCH_ID, orderId: ORDER_ID, itemName: 'Test', validationIssues: [], status: 'draft' }],
        () => [{ id: ORDER_ID, status: 'draft', archivedAt: null }],
        () => [{ priceRange: '50-100' }],
        () => []
      ]),
      update: makeUpdateAll(updates)
    };

    const result = await setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 75, basis: 'pick-mid' }, MOCK_USER, 'cmd-1');

    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([ORDER_ID, LINE_ID]);
    expect(updates[0].unitCost).toBe('75.00');
    expect(updates[0].unitCostResolved).toBe(true);
    expect(updates[0].landedCostBasis).toBe('pick-mid');
    expect(result.delta).toMatchObject({ lineId: LINE_ID, landedCost: '75.00', basis: 'pick-mid' });
  });

  it('rejects out-of-range landed COGS', async () => {
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: LINE_ID, batchId: BATCH_ID, orderId: ORDER_ID, itemName: 'Test', validationIssues: [], status: 'draft' }],
        () => [{ id: ORDER_ID, status: 'draft', archivedAt: null }],
        () => [{ priceRange: '50-100' }]
      ]),
      update: makeUpdate()
    };

    await expect(setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 150, basis: 'manual' }, MOCK_USER, 'cmd-2')).rejects.toThrow(/outside.*range/);
  });

  it('rejects out-of-range below the floor without exceptionReason', async () => {
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: LINE_ID, batchId: BATCH_ID, orderId: ORDER_ID, itemName: 'Test', validationIssues: [], status: 'draft' }],
        () => [{ id: ORDER_ID, status: 'draft', archivedAt: null }],
        () => [{ priceRange: '50-100' }]
      ]),
      update: makeUpdate()
    };

    await expect(setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 10, basis: 'manual' }, MOCK_USER, 'cmd-3')).rejects.toThrow(/exception reason/i);
  });

  it('accepts below-range landed COGS when a valid exceptionReason is provided', async () => {
    const updates: any[] = [];
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: LINE_ID, batchId: BATCH_ID, orderId: ORDER_ID, itemName: 'Test', validationIssues: [], status: 'draft' }],
        () => [{ id: ORDER_ID, status: 'draft', archivedAt: null }],
        () => [{ priceRange: '50-100' }],
        () => []
      ]),
      update: makeUpdateAll(updates)
    };

    const result = await setLineLandedCost(
      tx,
      { lineId: LINE_ID, landedCost: 10, basis: 'manual', exceptionReason: 'waive_margin' },
      MOCK_USER,
      'cmd-below-range'
    );
    expect(result.ok).toBe(true);
    expect(result.delta).toMatchObject({ exceptionReason: 'waive_margin' });
    expect(result.toast).toMatch(/below-range: waive_margin/);
  });

  it('accepts any non-negative landed cost when batch has no priceRange', async () => {
    const updates: any[] = [];
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: LINE_ID, batchId: BATCH_ID, orderId: ORDER_ID, itemName: 'Test', validationIssues: [], status: 'draft' }],
        () => [{ id: ORDER_ID, status: 'draft', archivedAt: null }],
        () => [{ priceRange: null }],
        () => []
      ]),
      update: makeUpdateAll(updates)
    };

    const result = await setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 999, basis: 'manual' }, MOCK_USER, 'cmd-4');
    expect(result.ok).toBe(true);
    expect(updates[0].unitCostResolved).toBe(true);
  });

  it('rejects when line does not exist', async () => {
    const tx: any = {
      select: makeTxForSelect([() => []]),
      update: makeUpdate()
    };
    await expect(setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 50, basis: 'manual' }, MOCK_USER, 'cmd-5')).rejects.toThrow(/Sales line not found/);
  });

  it('rejects negative landed cost', async () => {
    const tx: any = {
      select: makeTxForSelect([]),
      update: makeUpdate()
    };
    await expect(setLineLandedCost(tx, { lineId: LINE_ID, landedCost: -1, basis: 'manual' }, MOCK_USER, 'cmd-6')).rejects.toThrow(/non-negative/);
  });

  it('rejects unknown basis value', async () => {
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: LINE_ID, batchId: BATCH_ID, orderId: ORDER_ID, itemName: 'Test', validationIssues: [], status: 'draft' }],
        () => [{ id: ORDER_ID, status: 'draft', archivedAt: null }],
        () => [{ priceRange: null }]
      ]),
      update: makeUpdate()
    };
    await expect(
      setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 50, basis: 'something-bogus' }, MOCK_USER, 'cmd-bad-basis')
    ).rejects.toThrow(/basis/i);
  });
});

describe('setCustomerPricingRule', () => {
  it('writes new pricing rule and emits delta with priorPricingRule', async () => {
    let updateValues: any = null;
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: CUSTOMER_ID, name: 'Test Cust', pricingRule: { default: { basis: 'percent', amount: 0.25 } } }]
      ]),
      update: makeUpdate((value) => (updateValues = value))
    };

    const next = { default: { basis: 'percent', amount: 0.4 } };
    const result = await setCustomerPricingRule(tx, { customerId: CUSTOMER_ID, pricingRule: next }, 'cmd-rule-1');
    expect(result.ok).toBe(true);
    expect(updateValues.pricingRule).toEqual(next);
    const delta = result.delta as Record<string, unknown>;
    expect(delta.pricingRule).toEqual(next);
    expect(delta.priorPricingRule).toEqual({ default: { basis: 'percent', amount: 0.25 } });
    expect(result.affectedIds).toEqual([CUSTOMER_ID]);
  });

  it('rejects when customer not found', async () => {
    const tx: any = {
      select: makeTxForSelect([() => []]),
      update: makeUpdate()
    };
    await expect(setCustomerPricingRule(tx, { customerId: CUSTOMER_ID, pricingRule: {} }, 'cmd-rule-2')).rejects.toThrow(/Customer not found/);
  });

  it('rejects malformed pricingRule before writing to the DB', async () => {
    let updateCalled = false;
    const tx: any = {
      select: makeTxForSelect([() => [{ id: CUSTOMER_ID, name: 'C', pricingRule: {} }]]),
      update: vi.fn(() => {
        updateCalled = true;
        return { set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) };
      })
    };
    await expect(
      setCustomerPricingRule(
        tx,
        { customerId: CUSTOMER_ID, pricingRule: { default: { basis: 'percent', amount: 'not-a-number' } } },
        'cmd-rule-bad'
      )
    ).rejects.toThrow(/pricing rule/i);
    expect(updateCalled).toBe(false);
  });

  it('rejects pricingRule that is not an object', async () => {
    const tx: any = {
      select: makeTxForSelect([() => [{ id: CUSTOMER_ID, name: 'C', pricingRule: {} }]]),
      update: makeUpdate()
    };
    await expect(
      setCustomerPricingRule(tx, { customerId: CUSTOMER_ID, pricingRule: 'nope' }, 'cmd-rule-bad-2')
    ).rejects.toThrow(/pricing rule/i);
  });
});

describe('setDefaultPricingRule', () => {
  it('updates existing system_settings row and captures priorPricingRule in delta', async () => {
    let updateValues: any = null;
    const existingId = '99999999-9999-9999-9999-999999999999';
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: existingId, key: 'pricing.defaults', value: { default: { basis: 'percent', amount: 0.3 } } }]
      ]),
      update: makeUpdate((value) => (updateValues = value)),
      insert: makeInsert()
    };

    const next = { default: { basis: 'dollar', amount: 50 } };
    const result = await setDefaultPricingRule(tx, { pricingRule: next }, 'cmd-default-1');
    expect(result.ok).toBe(true);
    expect(updateValues.value).toEqual(next);
    const delta = result.delta as Record<string, unknown>;
    expect(delta.priorPricingRule).toEqual({ default: { basis: 'percent', amount: 0.3 } });
    expect(result.affectedIds).toEqual([existingId]);
  });

  it('inserts when no existing row and returns inserted UUID in affectedIds', async () => {
    let insertValues: any = null;
    const insertedId = '88888888-8888-8888-8888-888888888888';
    const tx: any = {
      select: makeTxForSelect([() => []]),
      insert: vi.fn(() => ({
        values: vi.fn((v: unknown) => {
          insertValues = v;
          return { returning: vi.fn(() => Promise.resolve([{ id: insertedId }])) };
        })
      })),
      update: makeUpdate()
    };
    const next = { default: { basis: 'percent', amount: 0.35 } };
    const result = await setDefaultPricingRule(tx, { pricingRule: next }, 'cmd-default-2');
    expect(result.ok).toBe(true);
    expect(insertValues).toEqual({ key: 'pricing.defaults', value: next });
    expect(result.affectedIds).toEqual([insertedId]);
  });

  it('rejects malformed pricingRule before writing', async () => {
    let writeCalled = false;
    const tx: any = {
      select: makeTxForSelect([() => []]),
      insert: vi.fn(() => {
        writeCalled = true;
        return {
          values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 'x' }])) }))
        };
      }),
      update: vi.fn(() => {
        writeCalled = true;
        return { set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) };
      })
    };
    await expect(
      setDefaultPricingRule(
        tx,
        { pricingRule: { default: { basis: 'percent', amount: 'not-a-number' } } },
        'cmd-default-bad'
      )
    ).rejects.toThrow(/pricing rule/i);
    expect(writeCalled).toBe(false);
  });
});

describe('priceSalesOrder with customer-rule strategy', () => {
  it('throws when any line has unresolvedCost', async () => {
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: ORDER_ID, customerId: CUSTOMER_ID, orderNo: 'SO-1' }],
        () => [{ id: CUSTOMER_ID, name: 'C', tags: [], pricingRule: { default: { basis: 'percent', amount: 0.3 } } }],
        () => [
          { id: 'l1', itemName: 'A', batchId: BATCH_ID, qty: '1', unitCost: '50', unitPrice: '0', unitCostResolved: false },
          { id: 'l2', itemName: 'B', batchId: null, qty: '1', unitCost: '20', unitPrice: '0', unitCostResolved: true }
        ]
      ]),
      update: makeUpdate(),
      insert: makeInsert()
    };
    await expect(priceSalesOrder(tx, { orderId: ORDER_ID, strategy: 'customer-rule' }, 'cmd-pr-1')).rejects.toThrow(/unresolved landed COGS/);
  });

  it('applies customer-category rule when present, then customer-default, then settings, then fallback', async () => {
    // Set up: customer has Flower category + default rule; settings has different Flower rule + default
    const lines = [
      { id: 'l1', itemName: 'Flower-A', batchId: 'b1', qty: '1', unitCost: '50', unitPrice: '0', unitCostResolved: true },
      { id: 'l2', itemName: 'Vape-A', batchId: 'b2', qty: '1', unitCost: '100', unitPrice: '0', unitCostResolved: true },
      { id: 'l3', itemName: 'Custom', batchId: null, qty: '1', unitCost: '25', unitPrice: '0', unitCostResolved: true }
    ];
    const updates: Array<any> = [];
    const customerRule = {
      categories: { Flower: { basis: 'percent', amount: 0.5 } },
      default: { basis: 'percent', amount: 0.2 }
    };

    let selectCall = 0;
    const tx: any = {
      select: vi.fn(() => ({
        from: (_table: any) => {
          // Sequence after prefetch refactor:
          //   0 orders, 1 customers, 2 salesOrderLines, 3 systemSettings,
          //   4 batches(all line.batchIds in one call), 5 recalcOrder lines
          const responses: Row[][] = [
            [{ id: ORDER_ID, customerId: CUSTOMER_ID, orderNo: 'SO-1' }],
            [{ id: CUSTOMER_ID, tags: [], pricingRule: customerRule, name: 'C' }],
            lines,
            [{ key: 'pricing.defaults', value: { default: { basis: 'percent', amount: 0.3 } } }],
            [
              { id: 'b1', category: 'Flower' },
              { id: 'b2', category: 'Vape' }
            ],
            lines.map((l) => ({ ...l, unitPrice: '0', qty: '1' }))
          ];
          const rows = responses[selectCall] ?? [];
          selectCall += 1;
          const p: any = Promise.resolve(rows);
          const limit = vi.fn(() => Promise.resolve(rows));
          const where = vi.fn(() => {
            const wp: any = Promise.resolve(rows);
            wp.limit = limit;
            return wp;
          });
          p.where = where;
          p.limit = limit;
          return p;
        }
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => {
          updates.push(value);
          return { where: vi.fn(() => Promise.resolve()) };
        })
      })),
      insert: makeInsert()
    };

    const result = await priceSalesOrder(tx, { orderId: ORDER_ID, strategy: 'customer-rule' }, 'cmd-pr-2');
    expect(result.ok).toBe(true);
    const delta = result.delta as Record<string, unknown>;
    const ruleAppliedLines = delta.ruleAppliedLines as Array<Record<string, unknown>>;
    expect(ruleAppliedLines).toHaveLength(3);
    // line 1: Flower category → customer-category (50%) → 50 * 1.5 = 75 (above margin floor of 60)
    expect(ruleAppliedLines[0]).toMatchObject({ ruleSource: 'customer-category', unitPrice: '75.00' });
    // line 2: Vape category (not in customer.categories), falls to customer-default (20%) → 100 * 1.2 = 120 (at margin floor)
    expect(ruleAppliedLines[1]).toMatchObject({ ruleSource: 'customer-default', unitPrice: '120.00' });
    // line 3: no batch (no category), falls to customer-default → 25 * 1.2 = 30 (at margin floor)
    expect(ruleAppliedLines[2]).toMatchObject({ ruleSource: 'customer-default', unitPrice: '30.00' });
  });

  it('falls through to settings-category and settings-default when no customer rule', async () => {
    const lines = [
      { id: 'l1', itemName: 'Flower-A', batchId: 'b1', qty: '1', unitCost: '100', unitPrice: '0', unitCostResolved: true },
      { id: 'l2', itemName: 'Other', batchId: null, qty: '1', unitCost: '40', unitPrice: '0', unitCostResolved: true }
    ];
    const updates: Array<any> = [];
    const settingsRule = {
      categories: { Flower: { basis: 'dollar', amount: 50 } },
      default: { basis: 'percent', amount: 0.25 }
    };

    let selectCall = 0;
    const tx: any = {
      select: vi.fn(() => ({
        from: (_table: any) => {
          const responses: Row[][] = [
            [{ id: ORDER_ID, customerId: CUSTOMER_ID, orderNo: 'SO-1' }],
            [{ id: CUSTOMER_ID, tags: [], pricingRule: {}, name: 'C' }],
            lines,
            [{ key: 'pricing.defaults', value: settingsRule }],
            [{ id: 'b1', category: 'Flower' }],
            lines
          ];
          const rows = responses[selectCall] ?? [];
          selectCall += 1;
          const p: any = Promise.resolve(rows);
          const limit = vi.fn(() => Promise.resolve(rows));
          const where = vi.fn(() => {
            const wp: any = Promise.resolve(rows);
            wp.limit = limit;
            return wp;
          });
          p.where = where;
          p.limit = limit;
          return p;
        }
      })),
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => {
          updates.push(value);
          return { where: vi.fn(() => Promise.resolve()) };
        })
      })),
      insert: makeInsert()
    };

    const result = await priceSalesOrder(tx, { orderId: ORDER_ID, strategy: 'customer-rule' }, 'cmd-pr-3');
    expect(result.ok).toBe(true);
    const delta = result.delta as Record<string, unknown>;
    const ruleAppliedLines = delta.ruleAppliedLines as Array<Record<string, unknown>>;
    // line 1: Flower → settings-category dollar +50 → 100 + 50 = 150 (above margin floor 120)
    expect(ruleAppliedLines[0]).toMatchObject({ ruleSource: 'settings-category', unitPrice: '150.00' });
    // line 2: no category → settings-default 25% → 40 * 1.25 = 50 (at margin floor 48)
    expect(ruleAppliedLines[1]).toMatchObject({ ruleSource: 'settings-default', unitPrice: '50.00' });
  });

  it('lifts a candidate price up to the margin guardrail floor and reports the adjustment in the delta', async () => {
    // Rule produces a candidate below the standard pricing profile minimum margin floor (20% of cost).
    // cost = 100, rule = percent 0.05 → candidate 105; margin floor = 120 → final 120 (lifted).
    const lines = [
      { id: 'l1', itemName: 'Cheap', batchId: null, qty: '1', unitCost: '100', unitPrice: '0', unitCostResolved: true }
    ];
    let selectCall = 0;
    const tx: any = {
      select: vi.fn(() => ({
        from: (_table: any) => {
          const responses: Row[][] = [
            [{ id: ORDER_ID, customerId: CUSTOMER_ID, orderNo: 'SO-1' }],
            [{ id: CUSTOMER_ID, tags: [], pricingRule: {}, name: 'C' }],
            lines,
            [{ key: 'pricing.defaults', value: { default: { basis: 'percent', amount: 0.05 } } }],
            // No batchIds, so no batches query is issued — next select is recalcOrder lines.
            lines
          ];
          const rows = responses[selectCall] ?? [];
          selectCall += 1;
          const p: any = Promise.resolve(rows);
          const limit = vi.fn(() => Promise.resolve(rows));
          const where = vi.fn(() => {
            const wp: any = Promise.resolve(rows);
            wp.limit = limit;
            return wp;
          });
          p.where = where;
          p.limit = limit;
          return p;
        }
      })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
      insert: makeInsert()
    };

    const result = await priceSalesOrder(tx, { orderId: ORDER_ID, strategy: 'customer-rule' }, 'cmd-pr-guardrail');
    expect(result.ok).toBe(true);
    const delta = result.delta as Record<string, unknown>;
    const lineEntry = (delta.ruleAppliedLines as Array<Record<string, unknown>>)[0];
    expect(lineEntry).toMatchObject({
      ruleSource: 'settings-default',
      unitPrice: '120.00',
      candidateUnitPrice: '105.00',
      guardrailAdjusted: true,
      minimumUnitPrice: '120.00'
    });
    expect((lineEntry.guardrails as string[]).includes('min_margin')).toBe(true);
  });
});

describe('confirmSalesOrder / postSalesOrder block on unresolved COGS', () => {
  function makeConfirmTx(linesRows: Row[], orderRow: Row, customerRow: Row | null) {
    // confirmSalesOrder calls:
    //   recalcOrder: select salesOrderLines (call 0), update orders
    //   select salesOrders → order  (call 1)
    //   select salesOrderLines → lines  (call 2)
    //   select customers → customer (call 3, only if validation/COGS pass)
    let call = 0;
    const responses: Row[][] = [
      linesRows,
      [orderRow],
      linesRows,
      customerRow ? [customerRow] : []
    ];
    return {
      select: vi.fn(() => ({
        from: (_t: any) => {
          const rows = responses[call] ?? [];
          call += 1;
          const p: any = Promise.resolve(rows);
          const limit = vi.fn(() => Promise.resolve(rows));
          const where = vi.fn(() => {
            const wp: any = Promise.resolve(rows);
            wp.limit = limit;
            return wp;
          });
          p.where = where;
          p.limit = limit;
          return p;
        }
      })),
      update: makeUpdate(),
      insert: makeInsert()
    };
  }

  function makePostTx(linesRows: Row[], orderRow: Row) {
    // postSalesOrder calls:
    //   select salesOrders → order  (call 0)
    //   select salesOrderLines → lines  (call 1)
    let call = 0;
    const responses: Row[][] = [
      [orderRow],
      linesRows
    ];
    return {
      select: vi.fn(() => ({
        from: (_t: any) => {
          const rows = responses[call] ?? [];
          call += 1;
          const p: any = Promise.resolve(rows);
          const limit = vi.fn(() => Promise.resolve(rows));
          const where = vi.fn(() => {
            const wp: any = Promise.resolve(rows);
            wp.limit = limit;
            return wp;
          });
          p.where = where;
          p.limit = limit;
          return p;
        }
      })),
      update: makeUpdate(),
      insert: makeInsert()
    };
  }

  it('confirmSalesOrder throws when a line has unitCostResolved=false', async () => {
    const lines = [
      {
        id: 'l1',
        orderId: ORDER_ID,
        itemName: 'Range-priced',
        batchId: BATCH_ID,
        qty: '1',
        unitPrice: '10',
        unitCost: '5',
        unitCostResolved: false,
        validationIssues: []
      }
    ];
    const order = { id: ORDER_ID, customerId: CUSTOMER_ID, orderNo: 'SO-1', status: 'draft', total: '10' };
    const customer = { id: CUSTOMER_ID, balance: '0', creditLimit: '10000', name: 'C', tags: [] };
    const tx: any = makeConfirmTx(lines, order, customer);
    await expect(confirmSalesOrder(tx, { orderId: ORDER_ID }, 'cmd-confirm-1')).rejects.toThrow(/unresolved landed COGS/);
  });

  it('postSalesOrder throws when a line has unitCostResolved=false', async () => {
    const lines = [
      {
        id: 'l1',
        orderId: ORDER_ID,
        itemName: 'Range-priced',
        batchId: BATCH_ID,
        qty: '1',
        unitPrice: '10',
        unitCost: '5',
        unitCostResolved: false,
        validationIssues: [],
        status: 'priced'
      }
    ];
    const order = { id: ORDER_ID, customerId: CUSTOMER_ID, orderNo: 'SO-1', status: 'confirmed', total: '10' };
    const tx: any = makePostTx(lines, order);
    await expect(postSalesOrder(tx, { orderId: ORDER_ID }, 'cmd-post-1')).rejects.toThrow(/unresolved landed COGS/);
  });
});

describe('postSalesOrder COGS exception accounting (#64 PR-3)', () => {
  // postSalesOrder is a deep handler. We build a table-aware tx mock that
  // dispatches select/insert/update by drizzle-table identity, returning
  // queued result rows. Each test seeds the queues with exactly the rows
  // the run will consume, then asserts on capture arrays.

  interface PostTxCaptures {
    inserts: Array<{ table: any; values: any }>;
    updates: Array<{ table: any; values: any }>;
  }

  interface PostTxQueues {
    // result-rowsets in call order, keyed by drizzle table object
    select: Map<any, Row[][]>;
    // sql FOR UPDATE rowsets in call order: [customer, batch1, batch2, ...]
    execute: Array<{ rows: Row[] }>;
    // returned rows for inserts by table
    insertReturning: Map<any, Row[][]>;
  }

  function makePostTx(queues: PostTxQueues, captures: PostTxCaptures) {
    const select = vi.fn(() => ({
      from: (table: any) => {
        const q = queues.select.get(table);
        const rows = q && q.length ? (q.shift() as Row[]) : [];
        const limitFn = vi.fn(() => Promise.resolve(rows));
        const orderByFn = vi.fn(() => {
          const op: any = Promise.resolve(rows);
          op.limit = limitFn;
          return op;
        });
        const whereFn = vi.fn(() => {
          const wp: any = Promise.resolve(rows);
          wp.limit = limitFn;
          wp.orderBy = orderByFn;
          return wp;
        });
        const p: any = Promise.resolve(rows);
        p.where = whereFn;
        p.limit = limitFn;
        p.orderBy = orderByFn;
        return p;
      }
    }));

    const insert = vi.fn((table: any) => ({
      values: vi.fn((values: any) => {
        captures.inserts.push({ table, values });
        const q = queues.insertReturning.get(table);
        const returnRows = q && q.length ? (q.shift() as Row[]) : [];
        // Make the no-returning path awaitable too.
        const chain: any = Promise.resolve(undefined);
        chain.returning = vi.fn(() => Promise.resolve(returnRows));
        return chain;
      }),
      onConflictDoNothing: vi.fn(() => Promise.resolve())
    }));

    const update = vi.fn((table: any) => ({
      set: vi.fn((values: any) => {
        captures.updates.push({ table, values });
        return { where: vi.fn(() => Promise.resolve()) };
      })
    }));

    const execute = vi.fn(() => {
      const next = queues.execute.shift();
      return Promise.resolve(next ?? { rows: [] });
    });

    const query = vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 }));

    return { select, insert, update, execute, query };
  }

  function seedQueues(opts: {
    order: Row;
    lines: Row[];
    batchesByLineId: Record<string, Row>;
    customer: Row;
    invoice: Row;
    cjEntries: Row[];
    periodLockExists?: boolean;
    vendorIdByBatchId?: Record<string, string | null>;
    vendorBill?: Row | null;
  }): PostTxQueues {
    const selectMap = new Map<any, Row[][]>();
    const insertReturning = new Map<any, Row[][]>();
    const execute: Array<{ rows: Row[] }> = [];

    // Select sequence for salesOrders:
    //   1) initial order lookup
    //   2) freshOrder after recalcOrder
    selectMap.set(salesOrdersTable, [[opts.order], [opts.order]]);

    // Select sequence for salesOrderLines:
    //   1) initial lines lookup
    //   2) recalcOrder lines lookup
    selectMap.set(salesOrderLinesTable, [opts.lines, opts.lines]);

    // Select sequence for batches:
    //   1..N) per-line pre-check (capacity)
    //   N+1..M) per below-floor vendor_approval_pending line: batches lookup for vendorId
    const batchSequence: Row[][] = [];
    for (const line of opts.lines) {
      batchSequence.push([opts.batchesByLineId[(line.id as string)]]);
    }
    for (const line of opts.lines) {
      if (line.belowFloorReason === 'vendor_approval_pending' && line.batchId) {
        const vendorId =
          (opts.vendorIdByBatchId ?? {})[line.batchId as string] ??
          (opts.batchesByLineId[line.id as string] as Row | undefined)?.vendorId ??
          null;
        batchSequence.push([{ vendorId } as Row]);
      }
    }
    selectMap.set(batchesTable, batchSequence);

    // Select sequence for periodLocks: one per posting that has any
    // belowFloorReason line (assertPeriodUnlocked runs once, on first hit).
    const hasException = opts.lines.some((l) => l.belowFloorReason != null);
    if (hasException) {
      selectMap.set(periodLocksTable, [opts.periodLockExists ? [{ period: '2026-05' }] : []]);
    }

    // Insert returnings.
    insertReturning.set(invoicesTable, [[opts.invoice]]);
    insertReturning.set(correctionJournalEntriesTable, opts.cjEntries.map((e) => [e]));

    // tx.execute FOR UPDATE sequence:
    //   1) customer lock
    //   2) per-line batch lock
    //   3) per vendor_approval_pending line: vendor-bill FOR UPDATE SKIP LOCKED
    //      (added in #64 PR-3 F-6 — locks the open bill before annotating
    //      discrepancyNotes to prevent silent loss under concurrency).
    execute.push({ rows: [opts.customer] });
    for (const line of opts.lines) {
      execute.push({ rows: [opts.batchesByLineId[line.id as string]] });
    }
    for (const line of opts.lines) {
      if (line.belowFloorReason === 'vendor_approval_pending' && line.batchId) {
        execute.push({ rows: opts.vendorBill ? [opts.vendorBill] : [] });
      }
    }

    return { select: selectMap, execute, insertReturning };
  }

  const BATCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const VENDOR_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const INVOICE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const CJ_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const VBILL_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  function defaultOrder(): Row {
    return {
      id: ORDER_ID,
      customerId: CUSTOMER_ID,
      orderNo: 'SO-EX-1',
      status: 'confirmed',
      total: '0'
    };
  }
  function defaultCustomer(): Row {
    return {
      id: CUSTOMER_ID,
      name: 'Customer X',
      balance: '0',
      creditLimit: '999999'
    };
  }
  function defaultBatch(overrides: Partial<Row> = {}): Row {
    return {
      id: BATCH_A,
      availableQty: '100.000',
      reservedQty: '0.000',
      unitCost: '40.00',
      ownershipStatus: 'O',
      vendorId: null,
      status: 'available',
      ...overrides
    };
  }
  function defaultInvoice(): Row {
    return {
      id: INVOICE_ID,
      invoiceNo: 'INV-1',
      customerId: CUSTOMER_ID,
      orderId: ORDER_ID,
      total: '0',
      amountPaid: '0',
      status: 'open'
    };
  }
  function makeLine(overrides: Partial<Row> = {}): Row {
    return {
      id: 'l-ex-1',
      orderId: ORDER_ID,
      itemName: 'Strain A',
      batchId: BATCH_A,
      qty: '10',
      unitPrice: '60',
      unitCost: '40',
      unitCostResolved: true,
      validationIssues: [],
      status: 'priced',
      sourceRowKey: null,
      priceFloor: null,
      belowFloorReason: null,
      belowFloorNote: null,
      vendorApprovalState: 'none',
      ...overrides
    };
  }

  // NOTE: production reality — setLineLandedCost writes
  // unitCost = priceFloor = landedCost (both columns always equal). The
  // below-floor exception is the SELLING PRICE (unitPrice) falling below
  // the priceFloor, so variance = (priceFloor - unitPrice) * qty.
  it('waive_margin line creates correction journal entry with correct variance', async () => {
    const line = makeLine({
      priceFloor: '50',
      unitCost: '50',
      unitPrice: '40',
      qty: '10',
      belowFloorReason: 'waive_margin',
      belowFloorNote: 'rush'
    });
    const captures: PostTxCaptures = { inserts: [], updates: [] };
    const queues = seedQueues({
      order: defaultOrder(),
      lines: [line],
      batchesByLineId: { 'l-ex-1': defaultBatch() },
      customer: defaultCustomer(),
      invoice: defaultInvoice(),
      cjEntries: [{ id: CJ_ID, period: '2026-05', amount: '100.00', memo: 'cj', status: 'posted' }]
    });
    const tx: any = makePostTx(queues, captures);
    const result = await postSalesOrder(tx, { orderId: ORDER_ID }, 'cmd-pr3-waive');

    expect(result.ok).toBe(true);
    const cjInsert = captures.inserts.find((i) => i.table === correctionJournalEntriesTable);
    expect(cjInsert).toBeTruthy();
    // variance = max(0, (50 - 40) * 10) = 100
    expect(cjInsert!.values.amount).toBe('100.00');
    expect(cjInsert!.values.period).toBe(new Date().toISOString().slice(0, 7));
    expect(cjInsert!.values.memo).toMatch(/waive_margin/);
    expect(cjInsert!.values.memo).toContain('SO-EX-1');
    expect(cjInsert!.values.memo).toContain('Strain A');
    expect(cjInsert!.values.memo).toContain('rush');
    expect(result.affectedIds).toContain(CJ_ID);
  });

  it('take_loss line creates correction journal entry', async () => {
    // unitCost = priceFloor = 50 (set together by setLineLandedCost),
    // unitPrice = 40 (below floor). variance = (50 - 40) * 4 = 40.
    const line = makeLine({
      priceFloor: '50',
      unitCost: '50',
      unitPrice: '40',
      qty: '4',
      belowFloorReason: 'take_loss'
    });
    const captures: PostTxCaptures = { inserts: [], updates: [] };
    const queues = seedQueues({
      order: defaultOrder(),
      lines: [line],
      batchesByLineId: { 'l-ex-1': defaultBatch({ unitCost: '50.00' }) },
      customer: defaultCustomer(),
      invoice: defaultInvoice(),
      cjEntries: [{ id: CJ_ID, period: '2026-05', amount: '40.00', memo: '', status: 'posted' }]
    });
    const tx: any = makePostTx(queues, captures);
    const result = await postSalesOrder(tx, { orderId: ORDER_ID }, 'cmd-pr3-loss');

    expect(result.ok).toBe(true);
    const cjInsert = captures.inserts.find((i) => i.table === correctionJournalEntriesTable);
    expect(cjInsert).toBeTruthy();
    expect(cjInsert!.values.amount).toBe('40.00');
    expect(cjInsert!.values.memo).toMatch(/take_loss/);
  });

  it('keep_margin line creates correction journal entry with computed variance', async () => {
    // unitCost = priceFloor = 50, unitPrice = 48 (slightly below floor).
    // variance = (50 - 48) * 5 = 10.
    const line = makeLine({
      priceFloor: '50',
      unitCost: '50',
      unitPrice: '48',
      qty: '5',
      belowFloorReason: 'keep_margin'
    });
    const captures: PostTxCaptures = { inserts: [], updates: [] };
    const queues = seedQueues({
      order: defaultOrder(),
      lines: [line],
      batchesByLineId: { 'l-ex-1': defaultBatch({ unitCost: '50.00' }) },
      customer: defaultCustomer(),
      invoice: defaultInvoice(),
      cjEntries: [{ id: CJ_ID, period: '2026-05', amount: '10.00', memo: '', status: 'posted' }]
    });
    const tx: any = makePostTx(queues, captures);
    const result = await postSalesOrder(tx, { orderId: ORDER_ID }, 'cmd-pr3-keep');

    expect(result.ok).toBe(true);
    const cjInsert = captures.inserts.find((i) => i.table === correctionJournalEntriesTable);
    expect(cjInsert).toBeTruthy();
    expect(cjInsert!.values.amount).toBe('10.00');
    expect(cjInsert!.values.memo).toMatch(/keep_margin/);
  });

  it('renegotiate line creates correction journal entry', async () => {
    // unitCost = priceFloor = 55, unitPrice = 40. variance = (55 - 40) * 2 = 30.
    const line = makeLine({
      priceFloor: '55',
      unitCost: '55',
      unitPrice: '40',
      qty: '2',
      belowFloorReason: 'renegotiate'
    });
    const captures: PostTxCaptures = { inserts: [], updates: [] };
    const queues = seedQueues({
      order: defaultOrder(),
      lines: [line],
      batchesByLineId: { 'l-ex-1': defaultBatch({ unitCost: '55.00' }) },
      customer: defaultCustomer(),
      invoice: defaultInvoice(),
      cjEntries: [{ id: CJ_ID, period: '2026-05', amount: '30.00', memo: '', status: 'posted' }]
    });
    const tx: any = makePostTx(queues, captures);
    const result = await postSalesOrder(tx, { orderId: ORDER_ID }, 'cmd-pr3-reneg');

    expect(result.ok).toBe(true);
    const cjInsert = captures.inserts.find((i) => i.table === correctionJournalEntriesTable);
    expect(cjInsert).toBeTruthy();
    expect(cjInsert!.values.amount).toBe('30.00');
    expect(cjInsert!.values.memo).toMatch(/renegotiate/);
  });

  it('vendor_approval_pending annotates open vendor bill while preserving prior notes', async () => {
    // vendorApprovalState = 'approved' (gate passes) but belowFloorReason
    // records the original below-floor reason for accounting/AP purposes.
    // unitCost = priceFloor = 60 (set together by setLineLandedCost),
    // unitPrice = 50 (below floor). variance = (60 - 50) * 3 = 30.
    const line = makeLine({
      priceFloor: '60',
      unitCost: '60',
      unitPrice: '50',
      qty: '3',
      belowFloorReason: 'vendor_approval_pending',
      vendorApprovalState: 'approved'
    });
    const existingBill: Row = {
      id: VBILL_ID,
      vendorId: VENDOR_A,
      billNo: 'VBILL-1',
      amount: '500.00',
      amountPaid: '0.00',
      status: 'open',
      discrepancyNotes: 'prior note',
      dueReason: null
    };
    const captures: PostTxCaptures = { inserts: [], updates: [] };
    const queues = seedQueues({
      order: defaultOrder(),
      lines: [line],
      batchesByLineId: { 'l-ex-1': defaultBatch({ vendorId: VENDOR_A }) },
      customer: defaultCustomer(),
      invoice: defaultInvoice(),
      cjEntries: [{ id: CJ_ID, period: '2026-05', amount: '30.00', memo: '', status: 'posted' }],
      vendorBill: existingBill
    });
    const tx: any = makePostTx(queues, captures);
    const result = await postSalesOrder(tx, { orderId: ORDER_ID }, 'cmd-pr3-vap');

    expect(result.ok).toBe(true);
    // CJ entry created
    const cjInsert = captures.inserts.find((i) => i.table === correctionJournalEntriesTable);
    expect(cjInsert).toBeTruthy();
    // variance = max(0, (60 - 50) * 3) = 30
    expect(cjInsert!.values.amount).toBe('30.00');

    // Vendor bill annotation: append-preserving, no dollar/status mutation
    const vbUpdate = captures.updates.find((u) => u.table === vendorBillsTable);
    expect(vbUpdate).toBeTruthy();
    expect(vbUpdate!.values.discrepancyNotes).toContain('prior note');
    expect(vbUpdate!.values.discrepancyNotes).toMatch(/vendor_approval_pending/);
    expect(vbUpdate!.values.discrepancyNotes).toContain('SO-EX-1');
    expect(vbUpdate!.values.discrepancyNotes).toContain('Strain A');
    // No mutation of amount / status / amountPaid / dueReason
    expect(vbUpdate!.values.amount).toBeUndefined();
    expect(vbUpdate!.values.status).toBeUndefined();
    expect(vbUpdate!.values.amountPaid).toBeUndefined();
    expect(vbUpdate!.values.dueReason).toBeUndefined();

    // Vendor bill id NOT in affectedIds
    expect(result.affectedIds).toContain(CJ_ID);
    expect(result.affectedIds).not.toContain(VBILL_ID);
  });

  it('in-range line (no belowFloorReason) creates no correction journal entry', async () => {
    const line = makeLine({
      priceFloor: '50',
      unitCost: '40',
      qty: '5',
      belowFloorReason: null
    });
    const captures: PostTxCaptures = { inserts: [], updates: [] };
    const queues = seedQueues({
      order: defaultOrder(),
      lines: [line],
      batchesByLineId: { 'l-ex-1': defaultBatch() },
      customer: defaultCustomer(),
      invoice: defaultInvoice(),
      cjEntries: []
    });
    const tx: any = makePostTx(queues, captures);
    const result = await postSalesOrder(tx, { orderId: ORDER_ID }, 'cmd-pr3-norm');

    expect(result.ok).toBe(true);
    const cjInserts = captures.inserts.filter((i) => i.table === correctionJournalEntriesTable);
    expect(cjInserts).toHaveLength(0);
  });

  it('reversal of postSalesOrder sets snapshotted correction journal entries to "reversed"', async () => {
    // NOTE: pre-populates afterSnapshot.correctionJournalEntries to exercise
    // the reversal-loop logic for #64 PR-3. snapshotByAffectedIds uses
    // db.select() (a separate pool connection) and may not capture entries
    // inserted in the same tx — real-DB snapshot population must wait for
    // GitHub Issue #150. This test seeds the snapshot directly to verify the
    // reversal branch handles the entries correctly when they are present.
    const cjId1 = '11111111-cccc-cccc-cccc-cccccccccccc';
    const cjId2 = '22222222-cccc-cccc-cccc-cccccccccccc';
    const originalCommandId = '99999999-1111-1111-1111-111111111111';
    const afterSnapshot = {
      // Empty side-effect tables so per-line/invoice/order reversal loops
      // are no-ops; only the correctionJournalEntries loop runs.
      salesOrderLines: [],
      invoices: [],
      salesOrders: [],
      correctionJournalEntries: [{ id: cjId1 }, { id: cjId2 }]
    };
    const original: Row = {
      id: originalCommandId,
      commandName: 'postSalesOrder',
      status: 'ok',
      reversedByCommandId: null,
      afterSnapshot,
      beforeSnapshot: {},
      result: null
    };

    const captures: PostTxCaptures = { inserts: [], updates: [] };
    const queues: PostTxQueues = {
      select: new Map(),
      execute: [],
      insertReturning: new Map()
    };
    queues.select.set(commandJournalTable, [[original]]);
    const tx: any = makePostTx(queues, captures);

    const result = await reverseCommandById(
      tx,
      { commandId: originalCommandId },
      'cmd-pr3-reverse'
    );

    expect(result.ok).toBe(true);
    const cjReversals = captures.updates.filter((u) => u.table === correctionJournalEntriesTable);
    expect(cjReversals).toHaveLength(2);
    for (const u of cjReversals) {
      expect(u.values.status).toBe('reversed');
    }
    expect(result.affectedIds).toContain(cjId1);
    expect(result.affectedIds).toContain(cjId2);
  });
});
