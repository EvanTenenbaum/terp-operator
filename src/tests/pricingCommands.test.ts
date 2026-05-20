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
  postSalesOrder
} from '../server/services/commandBus';

const LINE_ID = '11111111-1111-1111-1111-111111111111';
const ORDER_ID = '22222222-2222-2222-2222-222222222222';
const BATCH_ID = '33333333-3333-3333-3333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-4444-444444444444';

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
    let updateValues: any = null;
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: LINE_ID, batchId: BATCH_ID }],
        () => [{ priceRange: '50-100' }]
      ]),
      update: makeUpdate((value) => (updateValues = value))
    };

    const result = await setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 75, basis: 'pick-mid' }, 'cmd-1');

    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([LINE_ID]);
    expect(updateValues.unitCost).toBe('75.00');
    expect(updateValues.unitCostResolved).toBe(true);
    expect(updateValues.landedCostBasis).toBe('pick-mid');
    expect(result.delta).toMatchObject({ lineId: LINE_ID, landedCost: '75.00', basis: 'pick-mid' });
  });

  it('rejects out-of-range landed COGS', async () => {
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: LINE_ID, batchId: BATCH_ID }],
        () => [{ priceRange: '50-100' }]
      ]),
      update: makeUpdate()
    };

    await expect(setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 150, basis: 'manual' }, 'cmd-2')).rejects.toThrow(/outside the batch COGS range/);
  });

  it('rejects out-of-range below the floor', async () => {
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: LINE_ID, batchId: BATCH_ID }],
        () => [{ priceRange: '50-100' }]
      ]),
      update: makeUpdate()
    };

    await expect(setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 10, basis: 'manual' }, 'cmd-3')).rejects.toThrow(/outside the batch COGS range/);
  });

  it('accepts any non-negative landed cost when batch has no priceRange', async () => {
    let updateValues: any = null;
    const tx: any = {
      select: makeTxForSelect([
        () => [{ id: LINE_ID, batchId: BATCH_ID }],
        () => [{ priceRange: null }]
      ]),
      update: makeUpdate((value) => (updateValues = value))
    };

    const result = await setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 999, basis: 'manual' }, 'cmd-4');
    expect(result.ok).toBe(true);
    expect(updateValues.unitCostResolved).toBe(true);
  });

  it('rejects when line does not exist', async () => {
    const tx: any = {
      select: makeTxForSelect([() => []]),
      update: makeUpdate()
    };
    await expect(setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 50, basis: 'manual' }, 'cmd-5')).rejects.toThrow(/Sales order line not found/);
  });

  it('rejects negative landed cost', async () => {
    const tx: any = {
      select: makeTxForSelect([]),
      update: makeUpdate()
    };
    await expect(setLineLandedCost(tx, { lineId: LINE_ID, landedCost: -1, basis: 'manual' }, 'cmd-6')).rejects.toThrow(/non-negative/);
  });

  it('rejects unknown basis value', async () => {
    const tx: any = {
      select: makeTxForSelect([]),
      update: makeUpdate()
    };
    await expect(
      setLineLandedCost(tx, { lineId: LINE_ID, landedCost: 50, basis: 'something-bogus' }, 'cmd-bad-basis')
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
