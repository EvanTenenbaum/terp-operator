import { describe, it, expect, vi } from 'vitest';
import {
  setCustomerCreditLimit,
  revertCustomerCreditToEngine,
  snoozeCustomerCreditReminder,
  setCustomerEngineMax,
  setCustomerStance,
  disableCreditEngineForCustomer,
  enableCreditEngineForCustomer,
  createCreditEngineStance,
  updateCreditEngineStance,
  deleteCreditEngineStance,
  setCreditEngineConfig,
  bulkRevertCustomersToEngine
} from './commandBus';
import type { SessionUser } from '../../shared/types';

// Valid 36-char hex/uuid IDs used throughout the tests
const CUSTOMER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STANCE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STANCE_ID_2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONFIG_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const COMMAND_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const MANAGER: SessionUser = { id: USER_ID, name: 'Manager', email: 'm@x', role: 'manager', workLoop: null };
const OWNER: SessionUser = { id: USER_ID, name: 'Owner', email: 'o@x', role: 'owner', workLoop: null };

interface RecordedInsert {
  table: unknown;
  values: unknown;
  returningRow?: unknown;
}

interface RecordedUpdate {
  table: unknown;
  set: Record<string, unknown>;
  where?: unknown;
}

interface RecordedDelete {
  table: unknown;
  where?: unknown;
}

interface MockState {
  selectResults: Map<unknown, unknown[][]>;
  queries: Array<{ sql?: string; params?: unknown[] }>;
  inserts: RecordedInsert[];
  updates: RecordedUpdate[];
  deletes: RecordedDelete[];
}

function makeTx(
  selectByTable: Map<unknown, unknown[][]>,
  insertReturningByTable: Map<unknown, unknown> = new Map()
): { tx: any; state: MockState } {
  const state: MockState = {
    selectResults: selectByTable,
    queries: [],
    inserts: [],
    updates: [],
    deletes: []
  };

  const tx: any = {
    select: vi.fn((_columns?: unknown) => ({
      from: vi.fn((table: unknown) => {
        const dequeue = () => {
          const queue = state.selectResults.get(table) ?? [];
          const rows = queue.shift() ?? [];
          if (queue.length === 0) state.selectResults.delete(table);
          else state.selectResults.set(table, queue);
          return rows;
        };
        // Promise/thenable so `await tx.select()...from(t)` works without .where.
        const promised = (rows: unknown[]) => Promise.resolve(rows);
        const buildChain = () => {
          const chain: any = {
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => promised(dequeue()))
              })),
              limit: vi.fn(() => promised(dequeue())),
              then: (onF: any, onR: any) => promised(dequeue()).then(onF, onR)
            })),
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => promised(dequeue()))
            })),
            limit: vi.fn(() => promised(dequeue())),
            then: (onF: any, onR: any) => promised(dequeue()).then(onF, onR)
          };
          return chain;
        };
        return buildChain();
      })
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        const returningRow = insertReturningByTable.get(table);
        state.inserts.push({ table, values, returningRow });
        const returning = vi.fn(() => Promise.resolve(returningRow ? [returningRow] : []));
        // Inserts without .returning() still need to be awaitable
        const thenable: any = { returning };
        thenable.then = (onF: any, onR: any) => Promise.resolve(undefined).then(onF, onR);
        return thenable;
      })
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((setValue: Record<string, unknown>) => ({
        where: vi.fn((whereClause: unknown) => {
          state.updates.push({ table, set: setValue, where: whereClause });
          return Promise.resolve();
        })
      }))
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn((whereClause: unknown) => {
        state.deletes.push({ table, where: whereClause });
        return Promise.resolve();
      })
    })),
    query: vi.fn(async (sqlText: string, params: unknown[]) => {
      state.queries.push({ sql: sqlText, params });
      return { rowCount: 0 };
    })
  };

  return { tx, state };
}

function singleSelect(table: unknown, row: unknown | null) {
  return new Map<unknown, unknown[][]>([[table, [row ? [row] : []]]]);
}

// Helper to import drizzle tables in a typed-erased way so tests don't depend
// on column-level exports. We re-import from the schema module.
import {
  customers,
  customerCreditAssessments,
  creditEngineStances,
  creditEngineConfig,
  creditEngineStanceHistory,
  creditEngineConfigHistory
} from '../schema';

// ----- setCustomerCreditLimit -----

describe('setCustomerCreditLimit', () => {
  it('happy path: manager sets a limit within the threshold and journals it', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [[{ id: CUSTOMER_ID, name: 'Test', creditLimit: '100.00' }]]],
      [customerCreditAssessments, [[{ recommendedLimit: '1000.00' }]]]
    ]);
    const { tx, state } = makeTx(selectMap);

    const result = await setCustomerCreditLimit(
      tx,
      { customerId: CUSTOMER_ID, amount: 500, reason: 'Special promo' },
      MANAGER,
      COMMAND_ID
    );

    expect(result.ok).toBe(true);
    expect(result.toast).toBe('Manual credit limit set');
    expect(result.affectedIds).toEqual([CUSTOMER_ID]);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].table).toBe(customers);
    expect(state.updates[0].set).toMatchObject({
      creditLimit: '500.00',
      creditLimitSource: 'manual',
      creditLimitManualReason: 'Special promo',
      creditLimitSnoozeCount: 0
    });
    // Recompute enqueued via tx.query()
    expect(state.queries.length).toBeGreaterThanOrEqual(1);
    expect(state.queries[0].params).toEqual([CUSTOMER_ID, 'manualTrigger', COMMAND_ID]);
  });

  it('rejects negative amount', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      setCustomerCreditLimit(tx, { customerId: CUSTOMER_ID, amount: -1, reason: 'why' }, MANAGER, COMMAND_ID)
    ).rejects.toThrow('amount must be greater than or equal to zero');
  });

  it('rejects too-short reason', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      setCustomerCreditLimit(tx, { customerId: CUSTOMER_ID, amount: 100, reason: 'ab' }, MANAGER, COMMAND_ID)
    ).rejects.toThrow('reason must be at least 4 characters');
  });

  it('rejects missing customer', async () => {
    const selectMap = new Map<unknown, unknown[][]>([[customers, [[]]]]);
    const { tx } = makeTx(selectMap);
    await expect(
      setCustomerCreditLimit(tx, { customerId: CUSTOMER_ID, amount: 100, reason: 'good reason' }, MANAGER, COMMAND_ID)
    ).rejects.toThrow('Customer not found.');
  });

  it('rejects when amount > 1.5x recommendation and role is not owner', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [[{ id: CUSTOMER_ID, name: 'Test' }]]],
      [customerCreditAssessments, [[{ recommendedLimit: '1000.00' }]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      setCustomerCreditLimit(
        tx,
        { customerId: CUSTOMER_ID, amount: 2000, reason: 'big bump' },
        MANAGER,
        COMMAND_ID
      )
    ).rejects.toThrow('requires owner role');
  });

  it('allows amount > 1.5x recommendation when role is owner', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [[{ id: CUSTOMER_ID, name: 'Test' }]]],
      [customerCreditAssessments, [[{ recommendedLimit: '1000.00' }]]]
    ]);
    const { tx } = makeTx(selectMap);
    const result = await setCustomerCreditLimit(
      tx,
      { customerId: CUSTOMER_ID, amount: 2000, reason: 'big bump' },
      OWNER,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
  });

  it('handles missing latest assessment (threshold becomes 0; any positive amount requires owner)', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [[{ id: CUSTOMER_ID, name: 'Test' }]]],
      [customerCreditAssessments, [[]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      setCustomerCreditLimit(tx, { customerId: CUSTOMER_ID, amount: 100, reason: 'good reason' }, MANAGER, COMMAND_ID)
    ).rejects.toThrow('requires owner role');
  });
});

// ----- revertCustomerCreditToEngine -----

describe('revertCustomerCreditToEngine', () => {
  it('happy path: clears manual override fields when assessment exists', async () => {
    const selectMap = singleSelect(customers, {
      id: CUSTOMER_ID,
      lastAssessmentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
    });
    const { tx, state } = makeTx(selectMap);
    const result = await revertCustomerCreditToEngine(tx, { customerId: CUSTOMER_ID }, COMMAND_ID);
    expect(result.ok).toBe(true);
    expect(result.toast).toContain('engine credit limit');
    expect(state.updates[0].set).toMatchObject({
      creditLimitSource: 'engine',
      creditLimitManualSetAt: null,
      creditLimitManualSetBy: null,
      creditLimitManualReason: null,
      creditLimitLastReviewedAt: null,
      creditLimitSnoozeCount: 0
    });
    expect(state.queries[0].params).toEqual([CUSTOMER_ID, 'manualTrigger', COMMAND_ID]);
  });

  it('rejects missing customer', async () => {
    const { tx } = makeTx(singleSelect(customers, null));
    await expect(
      revertCustomerCreditToEngine(tx, { customerId: CUSTOMER_ID }, COMMAND_ID)
    ).rejects.toThrow('Customer not found.');
  });

  it('rejects revert when customer has no assessment (CHECK constraint guard)', async () => {
    // Mirrors the customers_engine_source_has_assessment CHECK constraint:
    // source='engine' requires last_assessment_id IS NOT NULL. Throw a clear
    // error BEFORE the UPDATE so callers get a friendly message instead of
    // a raw constraint violation.
    const selectMap = singleSelect(customers, { id: CUSTOMER_ID, lastAssessmentId: null });
    const { tx, state } = makeTx(selectMap);
    await expect(
      revertCustomerCreditToEngine(tx, { customerId: CUSTOMER_ID }, COMMAND_ID)
    ).rejects.toThrow('Customer must have a credit assessment before reverting to engine.');
    // No UPDATE issued, no enqueue.
    expect(state.updates).toHaveLength(0);
    expect(state.queries).toHaveLength(0);
  });

  it('rejects revert when lastAssessmentId is undefined (defensive)', async () => {
    // Some Drizzle adapters omit null columns instead of returning null.
    const selectMap = singleSelect(customers, { id: CUSTOMER_ID });
    const { tx } = makeTx(selectMap);
    await expect(
      revertCustomerCreditToEngine(tx, { customerId: CUSTOMER_ID }, COMMAND_ID)
    ).rejects.toThrow('Customer must have a credit assessment before reverting to engine.');
  });
});

// ----- snoozeCustomerCreditReminder -----

describe('snoozeCustomerCreditReminder', () => {
  it('happy path: increments snooze count, updates reminder days when supplied', async () => {
    const recentSetAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [[{ id: CUSTOMER_ID, creditLimitManualSetAt: recentSetAt, creditLimitSnoozeCount: 2 }]]],
      [creditEngineConfig, [[{ manualOverrideSnoozeCapDays: 365 }]]]
    ]);
    const { tx, state } = makeTx(selectMap);
    const result = await snoozeCustomerCreditReminder(
      tx,
      { customerId: CUSTOMER_ID, newReminderDays: 30 },
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(result.toast).toBe('Reminder snoozed');
    expect(state.updates[0].set).toMatchObject({
      creditLimitSnoozeCount: 3,
      creditLimitReminderDays: 30
    });
  });

  it('happy path: no newReminderDays means reminder days untouched', async () => {
    const recentSetAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [[{ id: CUSTOMER_ID, creditLimitManualSetAt: recentSetAt, creditLimitSnoozeCount: 0 }]]],
      [creditEngineConfig, [[{ manualOverrideSnoozeCapDays: 365 }]]]
    ]);
    const { tx, state } = makeTx(selectMap);
    await snoozeCustomerCreditReminder(tx, { customerId: CUSTOMER_ID }, COMMAND_ID);
    expect(state.updates[0].set).not.toHaveProperty('creditLimitReminderDays');
    expect(state.updates[0].set.creditLimitSnoozeCount).toBe(1);
  });

  it('rejects when manual override is older than snooze cap', async () => {
    const oldSetAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [[{ id: CUSTOMER_ID, creditLimitManualSetAt: oldSetAt, creditLimitSnoozeCount: 0 }]]],
      [creditEngineConfig, [[{ manualOverrideSnoozeCapDays: 365 }]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      snoozeCustomerCreditReminder(tx, { customerId: CUSTOMER_ID }, COMMAND_ID)
    ).rejects.toThrow('snooze cap');
  });

  it('rejects when customer has no manual override', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [[{ id: CUSTOMER_ID, creditLimitManualSetAt: null, creditLimitSnoozeCount: 0 }]]],
      [creditEngineConfig, [[{ manualOverrideSnoozeCapDays: 365 }]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      snoozeCustomerCreditReminder(tx, { customerId: CUSTOMER_ID }, COMMAND_ID)
    ).rejects.toThrow('no manual override');
  });

  it('rejects when newReminderDays is invalid', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      snoozeCustomerCreditReminder(tx, { customerId: CUSTOMER_ID, newReminderDays: -5 }, COMMAND_ID)
    ).rejects.toThrow('newReminderDays must be a positive integer');
  });

  it('rejects when customer is missing', async () => {
    const selectMap = new Map<unknown, unknown[][]>([[customers, [[]]]]);
    const { tx } = makeTx(selectMap);
    await expect(
      snoozeCustomerCreditReminder(tx, { customerId: CUSTOMER_ID }, COMMAND_ID)
    ).rejects.toThrow('Customer not found.');
  });

  it('rejects when config is missing', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [[{ id: CUSTOMER_ID, creditLimitManualSetAt: new Date(), creditLimitSnoozeCount: 0 }]]],
      [creditEngineConfig, [[]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      snoozeCustomerCreditReminder(tx, { customerId: CUSTOMER_ID }, COMMAND_ID)
    ).rejects.toThrow('config is missing');
  });
});

// ----- setCustomerEngineMax -----

describe('setCustomerEngineMax', () => {
  it('happy path: sets a positive engine max and enqueues recompute', async () => {
    const selectMap = singleSelect(customers, { id: CUSTOMER_ID });
    const { tx, state } = makeTx(selectMap);
    const result = await setCustomerEngineMax(
      tx,
      { customerId: CUSTOMER_ID, engineMax: 5000 },
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(state.updates[0].set).toMatchObject({ engineMax: '5000.00' });
    expect(state.queries[0].params).toEqual([CUSTOMER_ID, 'event:setEngineMax', COMMAND_ID]);
  });

  it('happy path: null engine max clears the cap', async () => {
    const selectMap = singleSelect(customers, { id: CUSTOMER_ID });
    const { tx, state } = makeTx(selectMap);
    await setCustomerEngineMax(tx, { customerId: CUSTOMER_ID, engineMax: null }, COMMAND_ID);
    expect(state.updates[0].set).toMatchObject({ engineMax: null });
  });

  it('rejects negative engine max', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      setCustomerEngineMax(tx, { customerId: CUSTOMER_ID, engineMax: -10 }, COMMAND_ID)
    ).rejects.toThrow('engineMax must be greater than or equal to zero');
  });
});

// ----- setCustomerStance -----

describe('setCustomerStance', () => {
  it('happy path: sets a non-null stance after validating it exists', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineStances, [[{ id: STANCE_ID }]]],
      [customers, [[{ id: CUSTOMER_ID }]]]
    ]);
    const { tx, state } = makeTx(selectMap);
    const result = await setCustomerStance(
      tx,
      { customerId: CUSTOMER_ID, stanceId: STANCE_ID },
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(state.updates[0].set).toMatchObject({ stanceId: STANCE_ID });
    expect(state.queries[0].params).toEqual([CUSTOMER_ID, 'event:setStance', COMMAND_ID]);
  });

  it('happy path: null stance clears it without checking existence', async () => {
    const selectMap = singleSelect(customers, { id: CUSTOMER_ID });
    const { tx, state } = makeTx(selectMap);
    await setCustomerStance(tx, { customerId: CUSTOMER_ID, stanceId: null }, COMMAND_ID);
    expect(state.updates[0].set).toMatchObject({ stanceId: null });
  });

  it('rejects unknown stance id', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineStances, [[]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      setCustomerStance(tx, { customerId: CUSTOMER_ID, stanceId: STANCE_ID }, COMMAND_ID)
    ).rejects.toThrow('Stance not found.');
  });
});

// ----- disableCreditEngineForCustomer -----

describe('disableCreditEngineForCustomer', () => {
  it('happy path: disables engine and flips engine-source to manual', async () => {
    const selectMap = singleSelect(customers, { id: CUSTOMER_ID, creditLimitSource: 'engine' });
    const { tx, state } = makeTx(selectMap);
    const result = await disableCreditEngineForCustomer(
      tx,
      { customerId: CUSTOMER_ID, reason: 'fraud watch' },
      USER_ID,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(result.toast).toBe('Engine disabled for customer');
    expect(state.updates[0].set).toMatchObject({
      engineDisabledBy: USER_ID,
      engineDisabledReason: 'fraud watch',
      creditLimitSource: 'manual'
    });
  });

  it('happy path: keeps manual source untouched when already manual', async () => {
    const selectMap = singleSelect(customers, { id: CUSTOMER_ID, creditLimitSource: 'manual' });
    const { tx, state } = makeTx(selectMap);
    await disableCreditEngineForCustomer(
      tx,
      { customerId: CUSTOMER_ID, reason: 'fraud watch' },
      USER_ID,
      COMMAND_ID
    );
    expect(state.updates[0].set).not.toHaveProperty('creditLimitSource');
  });

  it('rejects short reason', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      disableCreditEngineForCustomer(tx, { customerId: CUSTOMER_ID, reason: 'no' }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('reason must be at least 4 characters');
  });
});

// ----- enableCreditEngineForCustomer -----

describe('enableCreditEngineForCustomer', () => {
  it('happy path: clears disabled fields and enqueues recompute', async () => {
    const selectMap = singleSelect(customers, { id: CUSTOMER_ID });
    const { tx, state } = makeTx(selectMap);
    const result = await enableCreditEngineForCustomer(tx, { customerId: CUSTOMER_ID }, COMMAND_ID);
    expect(result.ok).toBe(true);
    expect(state.updates[0].set).toMatchObject({
      engineDisabledAt: null,
      engineDisabledBy: null,
      engineDisabledReason: null
    });
    expect(state.queries[0].params).toEqual([CUSTOMER_ID, 'manualTrigger', COMMAND_ID]);
  });

  it('rejects missing customer', async () => {
    const { tx } = makeTx(singleSelect(customers, null));
    await expect(
      enableCreditEngineForCustomer(tx, { customerId: CUSTOMER_ID }, COMMAND_ID)
    ).rejects.toThrow('Customer not found.');
  });
});

// ----- createCreditEngineStance -----

describe('createCreditEngineStance', () => {
  const balancedWeights = {
    revenueMomentum: 20,
    cashCollection: 20,
    profitability: 20,
    debtAging: 20,
    repaymentVelocity: 10,
    tenureDepth: 10
  };

  it('happy path: inserts the stance and audit history', async () => {
    const insertReturning = new Map<unknown, unknown>([
      [
        creditEngineStances,
        {
          id: STANCE_ID,
          name: 'Test Stance',
          description: null,
          weightRevenueMomentum: 20,
          weightCashCollection: 20,
          weightProfitability: 20,
          weightDebtAging: 20,
          weightRepaymentVelocity: 10,
          weightTenureDepth: 10
        }
      ]
    ]);
    const { tx, state } = makeTx(new Map(), insertReturning);

    const result = await createCreditEngineStance(
      tx,
      { name: 'Test Stance', weights: balancedWeights },
      USER_ID,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([STANCE_ID]);
    expect(result.toast).toBe('Stance created');
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0].table).toBe(creditEngineStances);
    expect(state.inserts[1].table).toBe(creditEngineStanceHistory);
    const historyValues = state.inserts[1].values as Record<string, unknown>;
    expect(historyValues.action).toBe('create');
    expect(historyValues.affectedCustomerCount).toBe(0);
  });

  it('rejects weights that do not sum to 100', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      createCreditEngineStance(
        tx,
        {
          name: 'Bad',
          weights: { ...balancedWeights, revenueMomentum: 25 }
        },
        USER_ID,
        COMMAND_ID
      )
    ).rejects.toThrow('weights must sum to 100');
  });

  it('rejects extreme weights without acknowledgement', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      createCreditEngineStance(
        tx,
        {
          name: 'Extreme',
          weights: {
            revenueMomentum: 60,
            cashCollection: 10,
            profitability: 10,
            debtAging: 10,
            repaymentVelocity: 5,
            tenureDepth: 5
          }
        },
        USER_ID,
        COMMAND_ID
      )
    ).rejects.toThrow('acknowledgeExtremeWeights=true');
  });

  it('rejects extreme weights with short justification', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      createCreditEngineStance(
        tx,
        {
          name: 'Extreme',
          weights: {
            revenueMomentum: 60,
            cashCollection: 10,
            profitability: 10,
            debtAging: 10,
            repaymentVelocity: 5,
            tenureDepth: 5
          },
          acknowledgeExtremeWeights: true,
          extremeWeightJustification: 'short'
        },
        USER_ID,
        COMMAND_ID
      )
    ).rejects.toThrow('at least 12 characters');
  });

  it('accepts extreme weights when properly acknowledged', async () => {
    const insertReturning = new Map<unknown, unknown>([
      [
        creditEngineStances,
        {
          id: STANCE_ID,
          name: 'Aggressive',
          description: null,
          weightRevenueMomentum: 60,
          weightCashCollection: 10,
          weightProfitability: 10,
          weightDebtAging: 10,
          weightRepaymentVelocity: 5,
          weightTenureDepth: 5
        }
      ]
    ]);
    const { tx } = makeTx(new Map(), insertReturning);
    const result = await createCreditEngineStance(
      tx,
      {
        name: 'Aggressive',
        weights: {
          revenueMomentum: 60,
          cashCollection: 10,
          profitability: 10,
          debtAging: 10,
          repaymentVelocity: 5,
          tenureDepth: 5
        },
        acknowledgeExtremeWeights: true,
        extremeWeightJustification: 'High-risk pilot rollout'
      },
      USER_ID,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
  });

  it('rejects non-integer weights', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      createCreditEngineStance(
        tx,
        {
          name: 'Decimals',
          weights: { ...balancedWeights, revenueMomentum: 20.5 }
        },
        USER_ID,
        COMMAND_ID
      )
    ).rejects.toThrow('must be an integer');
  });

  it('rejects out-of-range weights', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      createCreditEngineStance(
        tx,
        {
          name: 'Negative',
          weights: { ...balancedWeights, revenueMomentum: -1 }
        },
        USER_ID,
        COMMAND_ID
      )
    ).rejects.toThrow('between 0 and 100');
  });

  it('rejects missing weights object', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      createCreditEngineStance(tx, { name: 'NoWeights' }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('weights must be an object');
  });
});

// ----- updateCreditEngineStance -----

describe('updateCreditEngineStance', () => {
  const balancedWeights = {
    revenueMomentum: 20,
    cashCollection: 20,
    profitability: 20,
    debtAging: 20,
    repaymentVelocity: 10,
    tenureDepth: 10
  };

  const existingStance = {
    id: STANCE_ID,
    name: 'Old',
    description: null,
    weightRevenueMomentum: 16,
    weightCashCollection: 17,
    weightProfitability: 17,
    weightDebtAging: 17,
    weightRepaymentVelocity: 17,
    weightTenureDepth: 16
  };

  it('happy path: updates name and weights, journals history with affectedCustomerCount, enqueues all', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineStances, [[existingStance]]],
      // Drizzle .from(customers).where(...) returns one row with `count` (no .limit)
      [customers, [[{ count: 4 }]]]
    ]);
    const { tx, state } = makeTx(selectMap);

    const result = await updateCreditEngineStance(
      tx,
      { stanceId: STANCE_ID, name: 'New name', weights: balancedWeights },
      USER_ID,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(result.toast).toContain('recomputing');
    expect(state.updates.find((u) => u.table === creditEngineStances)?.set).toMatchObject({
      name: 'New name',
      weightRevenueMomentum: 20
    });
    const historyInsert = state.inserts.find((i) => i.table === creditEngineStanceHistory);
    expect(historyInsert).toBeDefined();
    expect((historyInsert!.values as Record<string, unknown>).affectedCustomerCount).toBe(4);
    // enqueueAllCustomers triggers a tx.query (INSERT ... SELECT)
    const enqueueQuery = state.queries.find((q) => q.sql?.includes('SELECT id, $1'));
    expect(enqueueQuery).toBeDefined();
  });

  it('happy path: name-only change does not enqueue recompute', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineStances, [[existingStance]]],
      [customers, [[{ count: 0 }]]]
    ]);
    const { tx, state } = makeTx(selectMap);
    const result = await updateCreditEngineStance(
      tx,
      { stanceId: STANCE_ID, name: 'New Name' },
      USER_ID,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(result.toast).toBe('Stance updated');
    expect(state.queries).toHaveLength(0);
  });

  it('rejects missing stance', async () => {
    const selectMap = new Map<unknown, unknown[][]>([[creditEngineStances, [[]]]]);
    const { tx } = makeTx(selectMap);
    await expect(
      updateCreditEngineStance(tx, { stanceId: STANCE_ID }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('Stance not found.');
  });

  it('rejects update with invalid weight sum', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineStances, [[existingStance]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      updateCreditEngineStance(
        tx,
        { stanceId: STANCE_ID, weights: { ...balancedWeights, revenueMomentum: 25 } },
        USER_ID,
        COMMAND_ID
      )
    ).rejects.toThrow('weights must sum to 100');
  });

  it('rejects extreme-weight update without ack', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineStances, [[existingStance]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      updateCreditEngineStance(
        tx,
        {
          stanceId: STANCE_ID,
          weights: {
            revenueMomentum: 70,
            cashCollection: 5,
            profitability: 5,
            debtAging: 10,
            repaymentVelocity: 5,
            tenureDepth: 5
          }
        },
        USER_ID,
        COMMAND_ID
      )
    ).rejects.toThrow('acknowledgeExtremeWeights=true');
  });

  it('updates description to null when empty string is provided', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineStances, [[{ ...existingStance, description: 'old desc' }]]],
      [customers, [[{ count: 0 }]]]
    ]);
    const { tx, state } = makeTx(selectMap);
    await updateCreditEngineStance(
      tx,
      { stanceId: STANCE_ID, description: '   ' },
      USER_ID,
      COMMAND_ID
    );
    const stanceUpdate = state.updates.find((u) => u.table === creditEngineStances);
    expect(stanceUpdate?.set).toMatchObject({ description: null });
  });
});

// ----- deleteCreditEngineStance -----

describe('deleteCreditEngineStance', () => {
  const existing = {
    id: STANCE_ID,
    name: 'Test',
    description: null,
    weightRevenueMomentum: 20,
    weightCashCollection: 20,
    weightProfitability: 20,
    weightDebtAging: 20,
    weightRepaymentVelocity: 10,
    weightTenureDepth: 10
  };

  it('happy path: deletes stance and journals history', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineStances, [[existing]]],
      [creditEngineConfig, [[{ globalDefaultStanceId: STANCE_ID_2 }]]],
      [customers, [[{ count: 0 }]]]
    ]);
    const { tx, state } = makeTx(selectMap);
    const result = await deleteCreditEngineStance(tx, { stanceId: STANCE_ID }, USER_ID, COMMAND_ID);
    expect(result.ok).toBe(true);
    expect(result.toast).toBe('Stance deleted');
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0].table).toBe(creditEngineStances);
    const historyInsert = state.inserts.find((i) => i.table === creditEngineStanceHistory);
    expect((historyInsert!.values as Record<string, unknown>).action).toBe('delete');
  });

  it('rejects deleting the global default stance', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineStances, [[existing]]],
      [creditEngineConfig, [[{ globalDefaultStanceId: STANCE_ID }]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      deleteCreditEngineStance(tx, { stanceId: STANCE_ID }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('global default');
  });

  it('rejects deleting a stance still assigned to customers', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineStances, [[existing]]],
      [creditEngineConfig, [[{ globalDefaultStanceId: STANCE_ID_2 }]]],
      [customers, [[{ count: 3 }]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      deleteCreditEngineStance(tx, { stanceId: STANCE_ID }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('still assigned to customers');
  });

  it('rejects missing stance', async () => {
    const selectMap = new Map<unknown, unknown[][]>([[creditEngineStances, [[]]]]);
    const { tx } = makeTx(selectMap);
    await expect(
      deleteCreditEngineStance(tx, { stanceId: STANCE_ID }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('Stance not found.');
  });
});

// ----- setCreditEngineConfig -----

describe('setCreditEngineConfig', () => {
  const baseConfig = {
    id: CONFIG_ID,
    globalDefaultStanceId: STANCE_ID,
    coldStartMinPostedInvoices: 3,
    coldStartMinTenureDays: 60,
    manualOverrideReminderDefaultDays: 60,
    manualOverrideSnoozeCapDays: 365,
    shadowMode: true
  };

  it('happy path: updates multiple fields and journals history', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineConfig, [[baseConfig]]],
      [creditEngineStances, [[{ id: STANCE_ID_2 }]]]
    ]);
    const { tx, state } = makeTx(selectMap);
    const result = await setCreditEngineConfig(
      tx,
      {
        globalDefaultStanceId: STANCE_ID_2,
        coldStartMinPostedInvoices: 5,
        shadowMode: false
      },
      USER_ID,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(result.toast).toBe('Engine config updated');
    expect(state.updates[0].set).toMatchObject({
      globalDefaultStanceId: STANCE_ID_2,
      coldStartMinPostedInvoices: 5,
      shadowMode: false,
      updatedBy: USER_ID
    });
    const history = state.inserts.find((i) => i.table === creditEngineConfigHistory);
    expect(history).toBeDefined();
    const values = history!.values as Record<string, unknown>;
    expect((values.preState as Record<string, unknown>).shadowMode).toBe(true);
    expect((values.postState as Record<string, unknown>).shadowMode).toBe(false);
  });

  it('rejects when stance does not exist', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [creditEngineConfig, [[baseConfig]]],
      [creditEngineStances, [[]]]
    ]);
    const { tx } = makeTx(selectMap);
    await expect(
      setCreditEngineConfig(tx, { globalDefaultStanceId: STANCE_ID_2 }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('does not reference an existing stance');
  });

  it('rejects when config row is missing', async () => {
    const selectMap = new Map<unknown, unknown[][]>([[creditEngineConfig, [[]]]]);
    const { tx } = makeTx(selectMap);
    await expect(
      setCreditEngineConfig(tx, { shadowMode: false }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('config row is missing');
  });

  it('rejects negative integer fields', async () => {
    const selectMap = new Map<unknown, unknown[][]>([[creditEngineConfig, [[baseConfig]]]]);
    const { tx } = makeTx(selectMap);
    await expect(
      setCreditEngineConfig(tx, { coldStartMinPostedInvoices: -1 }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('non-negative integer');
  });

  it('rejects non-boolean shadowMode', async () => {
    const selectMap = new Map<unknown, unknown[][]>([[creditEngineConfig, [[baseConfig]]]]);
    const { tx } = makeTx(selectMap);
    await expect(
      setCreditEngineConfig(tx, { shadowMode: 'no' }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('shadowMode must be a boolean');
  });

  it('rejects re-enabling shadow mode once it has been disabled (one-way-down)', async () => {
    // Persisted config has shadowMode=false; payload attempts to flip back to
    // true. Must be rejected server-side regardless of the UI affordance.
    const liveConfig = { ...baseConfig, shadowMode: false };
    const selectMap = new Map<unknown, unknown[][]>([[creditEngineConfig, [[liveConfig]]]]);
    const { tx, state } = makeTx(selectMap);
    await expect(
      setCreditEngineConfig(tx, { shadowMode: true }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('Shadow mode cannot be re-enabled once it has been disabled.');
    // No UPDATE issued, no history row written.
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it('allows shadowMode=false when persisted is already false (idempotent no-op)', async () => {
    // Setting shadowMode=false when it's already false should succeed: it
    // only writes the audit row and any other changed fields. This protects
    // operators who toggle other settings after going live.
    const liveConfig = { ...baseConfig, shadowMode: false };
    const selectMap = new Map<unknown, unknown[][]>([[creditEngineConfig, [[liveConfig]]]]);
    const { tx, state } = makeTx(selectMap);
    const result = await setCreditEngineConfig(
      tx,
      { shadowMode: false },
      USER_ID,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(state.updates[0].set).toMatchObject({ shadowMode: false });
  });

  it('rejects manualOverrideSnoozeCapDays below the 30-day server minimum', async () => {
    // The credit-review queue computes a "near snooze cap" badge using
    // `cap - 30`; a cap below 30 makes the badge math nonsense. Reject it
    // server-side so the UI cannot push the queue into a broken state.
    const selectMap = new Map<unknown, unknown[][]>([[creditEngineConfig, [[baseConfig]]]]);
    const { tx } = makeTx(selectMap);
    await expect(
      setCreditEngineConfig(tx, { manualOverrideSnoozeCapDays: 29 }, USER_ID, COMMAND_ID)
    ).rejects.toThrow('manualOverrideSnoozeCapDays must be at least 30.');
  });

  it('allows manualOverrideSnoozeCapDays at exactly 30', async () => {
    const selectMap = new Map<unknown, unknown[][]>([[creditEngineConfig, [[baseConfig]]]]);
    const { tx, state } = makeTx(selectMap);
    const result = await setCreditEngineConfig(
      tx,
      { manualOverrideSnoozeCapDays: 30 },
      USER_ID,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(state.updates[0].set).toMatchObject({ manualOverrideSnoozeCapDays: 30 });
  });
});

// ----- bulkRevertCustomersToEngine -----

describe('bulkRevertCustomersToEngine', () => {
  it('happy path: owner flips eligible customers and disables shadow mode', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      // First customers select: eligible candidates with assessments.
      [customers, [
        [{ id: CUSTOMER_ID }, { id: STANCE_ID }],
        // Second customers select: skipped candidates without assessment.
        []
      ]],
      [
        creditEngineConfig,
        [[{ id: CONFIG_ID, shadowMode: true, globalDefaultStanceId: STANCE_ID, coldStartMinPostedInvoices: 3, coldStartMinTenureDays: 60, manualOverrideReminderDefaultDays: 60, manualOverrideSnoozeCapDays: 365 }]]
      ]
    ]);
    const { tx, state } = makeTx(selectMap);
    const result = await bulkRevertCustomersToEngine(tx, {}, OWNER, COMMAND_ID);
    expect(result.ok).toBe(true);
    expect(result.affectedIds).toHaveLength(2);
    expect(result.toast).toContain('Reverted 2 customer');
    expect(result.toast).not.toContain('skipped');
    // Two updates: one mass update of customers, one shadow_mode flip on config
    const customerUpdate = state.updates.find((u) => u.table === customers);
    expect(customerUpdate?.set).toMatchObject({ creditLimitSource: 'engine' });
    const configUpdate = state.updates.find((u) => u.table === creditEngineConfig);
    expect(configUpdate?.set).toMatchObject({ shadowMode: false });
    // Config history written
    const history = state.inserts.find((i) => i.table === creditEngineConfigHistory);
    expect(history).toBeDefined();
    // enqueueAll triggered
    expect(state.queries.some((q) => q.sql?.includes('SELECT id, $1'))).toBe(true);
  });

  it('happy path: no eligible customers means no updates beyond shadow toggle', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      // Eligible candidates AND skipped candidates both empty.
      [customers, [[], []]],
      [
        creditEngineConfig,
        [[{ id: CONFIG_ID, shadowMode: false, globalDefaultStanceId: STANCE_ID, coldStartMinPostedInvoices: 3, coldStartMinTenureDays: 60, manualOverrideReminderDefaultDays: 60, manualOverrideSnoozeCapDays: 365 }]]
      ]
    ]);
    const { tx, state } = makeTx(selectMap);
    const result = await bulkRevertCustomersToEngine(tx, {}, OWNER, COMMAND_ID);
    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([]);
    // No customer update, no shadow flip (already off), no config history
    expect(state.updates.find((u) => u.table === customers)).toBeUndefined();
    expect(state.updates.find((u) => u.table === creditEngineConfig)).toBeUndefined();
    expect(state.inserts.find((i) => i.table === creditEngineConfigHistory)).toBeUndefined();
  });

  it('filters customers without assessment and reports them as skipped', async () => {
    // Eligible: one customer with assessment. Skipped: two manual customers
    // missing last_assessment_id — the bulk UPDATE must not touch them or
    // the customers_engine_source_has_assessment CHECK constraint would
    // raise. They should appear in the toast as `skipped`.
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [
        [{ id: CUSTOMER_ID }], // eligible
        [{ id: STANCE_ID }, { id: STANCE_ID_2 }] // skipped (no assessment)
      ]]
    ]);
    const { tx, state } = makeTx(selectMap);
    const result = await bulkRevertCustomersToEngine(
      tx,
      { flipShadowMode: false },
      OWNER,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([CUSTOMER_ID]);
    expect(result.toast).toMatch(/Reverted 1 customer.*2 skipped \(no assessment yet\)/);
    // Only the eligible customer is updated.
    const customerUpdate = state.updates.find((u) => u.table === customers);
    expect(customerUpdate?.set).toMatchObject({ creditLimitSource: 'engine' });
  });

  it('reports skipped even when zero eligible customers', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [
        [], // none eligible
        [{ id: STANCE_ID }] // one skipped
      ]]
    ]);
    const { tx } = makeTx(selectMap);
    const result = await bulkRevertCustomersToEngine(
      tx,
      { flipShadowMode: false },
      OWNER,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    expect(result.affectedIds).toEqual([]);
    expect(result.toast).toMatch(/Reverted 0 customer.*1 skipped \(no assessment yet\)/);
  });

  it('honors flipShadowMode=false', async () => {
    const selectMap = new Map<unknown, unknown[][]>([
      [customers, [
        [{ id: CUSTOMER_ID }], // eligible
        [] // no skipped
      ]]
    ]);
    const { tx, state } = makeTx(selectMap);
    const result = await bulkRevertCustomersToEngine(
      tx,
      { flipShadowMode: false },
      OWNER,
      COMMAND_ID
    );
    expect(result.ok).toBe(true);
    // Should not look up config when flipShadowMode is false
    expect(state.updates.find((u) => u.table === creditEngineConfig)).toBeUndefined();
  });

  it('rejects when caller is not owner', async () => {
    const { tx } = makeTx(new Map());
    await expect(
      bulkRevertCustomersToEngine(tx, {}, MANAGER, COMMAND_ID)
    ).rejects.toThrow('requires owner role');
  });
});
