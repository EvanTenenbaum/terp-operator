import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createInMemoryState,
  makeMockedDb,
  type InMemoryState,
} from '../server/services/__tests__/inMemoryDbMock';
import type { SessionUser } from '../shared/types';

// Mock peripheral modules the barter module touches at module-init time.
vi.mock('../server/services/creditEngine', () => ({
  enqueueCustomerRecompute: vi.fn(async () => undefined),
  enqueueAllCustomers: vi.fn(async () => undefined),
}));
vi.mock('../domains/intake', () => ({
  createBatch: vi.fn(async () => ({ affectedIds: ['mock-batch'] })),
}));

import { payWithProduct, settleDebtWithProduct } from '@/domains/barter';

/**
 * Barter settlement — §11 integration tests
 *
 * These tests exercise the full command handlers against the in-memory Drizzle
 * mock. Full coverage requires a test DB with migration 0085 applied; the most
 * complex handler paths (settleDebtWithProduct full flow, idempotency at the
 * commandBus level, reversal through reverseCommandById) are skipped with
 * explanatory comments.
 *
 * The payload-schema contract tests live in barterPayloadValidation.test.ts.
 * The reversal guard unit tests live in barterReversalGuard.test.ts.
 * The arithmetic invariants live in barterMoneyInvariants.test.ts and
 * barterReconciliation.test.ts.
 */

const VENDOR_ID = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = '22222222-2222-4222-8222-222222222222';
const BATCH2_ID = '33333333-3333-4333-8333-333333333333';
const CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';
const COMMAND_ID = '55555555-5555-4555-8555-555555555555';

const MANAGER: SessionUser = { id: 'user-mgr', role: 'manager', email: 'mgr@test.com', name: 'Manager', workLoop: null };
const OPERATOR: SessionUser = { id: 'user-op', role: 'operator', email: 'op@test.com', name: 'Operator', workLoop: null };

function setupState(): {
  state: InMemoryState;
  tx: ReturnType<typeof makeMockedDb>['tx'];
} {
  const state = createInMemoryState();
  state._dynamic = state._dynamic ?? {};
  // Register the barter and peripheral tables so the mock recognises them.
  state._dynamic['barter_settlements'] = [];
  state._dynamic['barter_settlement_lines'] = [];
  state._dynamic['barter_settlement_allocations'] = [];
  state._dynamic['inventory_movements'] = [];
  state._dynamic['vendor_payments'] = [];
  state._dynamic['correction_journal_entries'] = [];
  state._dynamic['period_locks'] = [];
  state._dynamic['contacts'] = [];
  state._dynamic['purchase_receipts'] = [];
  state._dynamic['purchase_receipt_lines'] = [];
  state._dynamic['invoices'] = [];
  const { tx } = makeMockedDb(state);
  return { state, tx };
}

describe('Barter settlement — §11 integration tests', () => {
  let state: InMemoryState;
  let tx: ReturnType<typeof makeMockedDb>['tx'];

  beforeEach(() => {
    const ctx = setupState();
    state = ctx.state;
    tx = ctx.tx;
  });

  // ── §11.2 — Over-issue rejection ──────────────────────────────────────────
  it('§11.2 — payWithProduct rejects when qty exceeds batch availableQty', async () => {
    state.vendors.push({
      id: VENDOR_ID,
      name: 'Test Vendor',
      termsDays: 14,
    });
    state.batches.push({
      id: BATCH_ID,
      name: 'Test Batch',
      availableQty: '5.000',
      unitCost: '10.00',
      intakeQty: '10.000',
      ownershipStatus: 'OFC',
      status: 'posted',
    });

    await expect(
      payWithProduct(tx as never, {
        counterpartyType: 'vendor',
        vendorId: VENDOR_ID,
        lines: [{ batchId: BATCH_ID, qty: 10 }],
      }, MANAGER, COMMAND_ID)
    ).rejects.toThrow(/available|insufficient/i);
  });

  // ── §11.3 — Gain/loss with override ───────────────────────────────────────
  it('§11.3a — payWithProduct override above cost produces positive gain/loss', async () => {
    state.vendors.push({
      id: VENDOR_ID,
      name: 'Test Vendor',
      termsDays: 14,
    });
    state.batches.push({
      id: BATCH_ID,
      name: 'Test Batch',
      availableQty: '10.000',
      unitCost: '10.00',
      intakeQty: '10.000',
      ownershipStatus: 'OFC',
      status: 'posted',
    });

    const result = await payWithProduct(tx as never, {
      counterpartyType: 'vendor',
      vendorId: VENDOR_ID,
      lines: [{ batchId: BATCH_ID, qty: 5 }],
      settlementAmount: 75,
      overrideReason: 'market adjustment',
    }, MANAGER, COMMAND_ID);

    expect(result.ok).toBe(true);

    // Verify the settlement row records the override and positive gain.
    const settlements = state._dynamic!['barter_settlements'];
    expect(settlements.length).toBe(1);
    const settlement = settlements[0];
    expect(settlement.settlementAmount).toBe('75.00');
    expect(settlement.costBasis).toBe('50.00');
    expect(settlement.gainLoss).toBe('25.00');
    expect(settlement.valueOverridden).toBe(true);
    expect(settlement.overrideReason).toBe('market adjustment');

    // Verify correction journal entry was created for the gain.
    const journals = state._dynamic!['correction_journal_entries'] as Array<Record<string, unknown>>;
    expect(journals.length).toBe(1);
    const journal = journals[0];
    expect(journal.amount).toBe('25.00');
    expect(journal.memo).toMatch(/gain/i);
  });

  // §11.3b — settleDebtWithProduct override below cost requires the full
  // intake path (creates PO, PO lines, batches via createBatch, receipt,
  // receipt lines, vendor bill, vendor payment, settlement, settlement lines,
  // inventory movements, client ledger entries, correction journal entries).
  // The in-memory mock's createBatch stub returns { affectedIds: ['mock-batch'] }
  // but does not materialise the batch row in state.batches — the handler's
  // subsequent UPDATE batches SET ... WHERE id = 'mock-batch' finds no row.
  // Making this work requires either a real DB with migration 0085 applied or
  // enhancing the stub to materialise rows in the in-memory state.
  it.skip('§11.3b — settleDebtWithProduct override below cost produces negative gain/loss (needs real DB — complex intake path)', () => {});

  // ── §11.6 — Idempotent replay ─────────────────────────────────────────────
  // Idempotency is handled at the commandBus.executeCommand level (line ~898),
  // not by the raw handlers. The atomic claim INSERT … ON CONFLICT DO NOTHING
  // on command_journal.idempotencyKey gates replay. Testing this requires
  // full executeCommand integration with the real db or an executeCommand-
  // level mock, which is beyond the scope of the in-memory table mock.
  it.skip('§11.6a — payWithProduct idempotent replay (needs commandBus-level integration)', () => {});
  it.skip('§11.6b — settleDebtWithProduct idempotent replay (needs commandBus-level integration)', () => {});

  // ── §11.7 — Reversal restoration ──────────────────────────────────────────
  // Reversal is handled by reverseCommandById in commandBus.ts, which
  // snapshots affected tables before mutation and restores on error. Testing
  // this requires full reverseCommandById integration (command journal,
  // before/after snapshots, affected-id tracking). The guard unit tests in
  // barterReversalGuard.test.ts cover the pre-flight logic.
  it.skip('§11.7a — payWithProduct reversal restores batch qty, vendor bill, and offsets gain/loss (needs commandBus-level integration)', () => {});
  it.skip('§11.7b — settleDebtWithProduct reversal restores customer balance, vendor bill, and PO (needs commandBus-level integration)', () => {});

  // ── §11.10 — Vendor identity auto-provision ───────────────────────────────
  // settleDebtWithProduct creates PO, batches (via createBatch helper), receipt,
  // vendor bill, vendor payment, settlement, lines, and ledger entries. The
  // auto-provision step (contact → vendor resolution under FOR UPDATE lock) is
  // exercised within this full path. A real database is needed for meaningful
  // coverage.
  it.skip('§11.10a — settleDebtWithProduct auto-provisions vendor (needs real DB — complex intake path)', () => {});
  it.skip('§11.10b — settleDebtWithProduct reuses existing vendor (needs real DB — complex intake path)', () => {});

  // ── §11.11 — Override gating runtime checks ───────────────────────────────
  it('§11.11a — payWithProduct rejects non-manager override attempt', async () => {
    state.vendors.push({
      id: VENDOR_ID,
      name: 'Test Vendor',
      termsDays: 14,
    });
    state.batches.push({
      id: BATCH_ID,
      name: 'Test Batch',
      availableQty: '10.000',
      unitCost: '10.00',
      intakeQty: '10.000',
      ownershipStatus: 'OFC',
      status: 'posted',
    });

    // Operator tries to override settlementAmount with a reason.
    await expect(
      payWithProduct(tx as never, {
        counterpartyType: 'vendor',
        vendorId: VENDOR_ID,
        lines: [{ batchId: BATCH_ID, qty: 5 }],
        settlementAmount: 75,
        overrideReason: 'market adjustment',
      }, OPERATOR, COMMAND_ID)
    ).rejects.toThrow(/override/i);
  });

  it('§11.11b — payWithProduct rejects manager override without reason', async () => {
    state.vendors.push({
      id: VENDOR_ID,
      name: 'Test Vendor',
      termsDays: 14,
    });
    state.batches.push({
      id: BATCH_ID,
      name: 'Test Batch',
      availableQty: '10.000',
      unitCost: '10.00',
      intakeQty: '10.000',
      ownershipStatus: 'OFC',
      status: 'posted',
    });

    // Manager tries to override settlementAmount WITHOUT a reason.
    await expect(
      payWithProduct(tx as never, {
        counterpartyType: 'vendor',
        vendorId: VENDOR_ID,
        lines: [{ batchId: BATCH_ID, qty: 5 }],
        settlementAmount: 75,
        // overrideReason intentionally omitted
      }, MANAGER, COMMAND_ID)
    ).rejects.toThrow(/overrideReason/i);
  });

  it('§11.11b — settleDebtWithProduct rejects manager override without reason', async () => {
    // settleDebtWithProduct override gate fires at step 3 (cost-basis comparison),
    // before step 4 (customer lookup). Schema validation needs a valid UUID for
    // customerId but the DB is never queried — no seed data needed.
    // Cost basis = 5 × $10 = $50, settlementAmount = $75 → override attempted.
    await expect(
      settleDebtWithProduct(tx as never, {
        customerId: CUSTOMER_ID,
        lines: [{ productName: 'Test Product', qty: 5, unitCost: 10 }],
        settlementAmount: 75,
        // overrideReason intentionally omitted
      }, MANAGER, COMMAND_ID)
    ).rejects.toThrow(/overrideReason/i);
  });

  // ── Multi-batch correctness ───────────────────────────────────────────────
  it('§11 multi-a — payWithProduct handles multi-batch settlement with correct cost aggregation', async () => {
    state.vendors.push({
      id: VENDOR_ID,
      name: 'Test Vendor',
      termsDays: 14,
    });
    state.batches.push({
      id: BATCH_ID,
      name: 'Batch A',
      availableQty: '10.000',
      unitCost: '10.00',
      intakeQty: '10.000',
      ownershipStatus: 'OFC',
      status: 'posted',
    });
    state.batches.push({
      id: BATCH2_ID,
      name: 'Batch B',
      availableQty: '10.000',
      unitCost: '20.00',
      intakeQty: '10.000',
      ownershipStatus: 'OFC',
      status: 'posted',
    });

    const result = await payWithProduct(tx as never, {
      counterpartyType: 'vendor',
      vendorId: VENDOR_ID,
      lines: [
        { batchId: BATCH_ID, qty: 3 },
        { batchId: BATCH2_ID, qty: 2 },
      ],
    }, MANAGER, COMMAND_ID);

    expect(result.ok).toBe(true);

    // Cost basis = 3*10 + 2*20 = 70
    const settlements = state._dynamic!['barter_settlements'];
    expect(settlements.length).toBe(1);
    expect(settlements[0].costBasis).toBe('70.00');
    expect(settlements[0].settlementAmount).toBe('70.00'); // default = costBasis
    expect(settlements[0].gainLoss).toBe('0.00');

    // Both batches were deducted.
    const updatedA = state.batches.find(b => b.id === BATCH_ID);
    const updatedB = state.batches.find(b => b.id === BATCH2_ID);
    expect(updatedA?.availableQty).toBe('7.000');
    expect(updatedB?.availableQty).toBe('8.000');

    // Two settlement lines created.
    const lines = state._dynamic!['barter_settlement_lines'] as Array<Record<string, unknown>>;
    expect(lines.length).toBe(2);
  });

  // §11 multi-b — settleDebtWithProduct multi-line correctness requires the
  // full intake path (PO, createBatch, receipt, vendor bill, vendor payment,
  // settlement, lines, ledger entries). A real database is needed.
  it.skip('§11 multi-b — settleDebtWithProduct handles multi-line settlement (needs real DB — complex intake path)', () => {});
});
