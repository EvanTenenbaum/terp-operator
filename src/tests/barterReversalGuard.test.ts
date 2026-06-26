/**
 * Phase 4 (§7, §11.1) — Barter Settlement reversal guard unit tests.
 *
 * `assertBarterSettlementReversible` is the pre-flight guard that runs
 * BEFORE any snapshot-restore mutation in `reverseCommandById`. It blocks
 * inbound reversal when the received product has already been (partly)
 * resold or when the barter PO has been amended downstream. Outbound
 * reversal is always allowed through (the inventory came FROM us — restoring
 * availableQty is unambiguous).
 *
 * These tests use the existing shared in-memory Drizzle mock so the guard
 * exercises real Drizzle query chains and the same predicate parser used
 * by production reversal code. No real database required.
 *
 * Coverage from §11 of the plan:
 *   §11.1 — Inbound where received product was resold → reversal blocked.
 *   §7   — Outbound reversal is always safe (short-circuit return).
 *   §7   — PO amendment downstream → reversal blocked.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  createInMemoryState,
  makeMockedDb,
  type InMemoryState,
} from '../server/services/__tests__/inMemoryDbMock';

// Mock peripheral systems the barter module touches at module-init time.
vi.mock('../server/services/creditEngine', () => ({
  enqueueCustomerRecompute: vi.fn(async () => undefined),
  enqueueAllCustomers: vi.fn(async () => undefined),
}));

vi.mock('../domains/intake', () => ({
  createBatch: vi.fn(async () => ({ affectedIds: ['mock-batch'] })),
}));

import { assertBarterSettlementReversible } from '@/domains/barter';

const SETTLEMENT_ID = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = '22222222-2222-4222-8222-222222222222';
const PO_ID = '33333333-3333-4333-8333-333333333333';
const LINE_ID = '44444444-4444-4444-8444-444444444444';

function setupState(): { state: InMemoryState; tx: ReturnType<typeof makeMockedDb>['tx'] } {
  const state = createInMemoryState();
  // Register the barter tables in _dynamic so the mock recognizes them.
  state._dynamic = state._dynamic ?? {};
  state._dynamic['barter_settlements'] = [];
  state._dynamic['barter_settlement_lines'] = [];
  state._dynamic['purchase_orders'] = state.purchaseOrders;
  const { tx } = makeMockedDb(state);
  return { state, tx };
}

describe('assertBarterSettlementReversible — §7 / §11.1', () => {
  let state: InMemoryState;
  let tx: ReturnType<typeof makeMockedDb>['tx'];

  beforeEach(() => {
    const ctx = setupState();
    state = ctx.state;
    tx = ctx.tx;
  });

  it('throws when the settlement does not exist', async () => {
    await expect(
      assertBarterSettlementReversible(tx as never, SETTLEMENT_ID)
    ).rejects.toThrow(/not found/i);
  });

  // Storage note: the in-memory mock returns raw stored objects, so seeded
  // rows must use the *JS field names from schema.ts* (camelCase) that the
  // guard reads (e.g. `batchId`, `intakeQty`, `availableQty`, `settlementNo`,
  // `purchaseOrderId`), not the snake_case underlying column names.

  it('returns silently for an outbound settlement regardless of batch state', async () => {
    // Outbound: inventory came FROM us. Restoring availableQty is always
    // safe; the guard must not reach into the lines/batches at all.
    state._dynamic!['barter_settlements'].push({
      id: SETTLEMENT_ID,
      settlementNo: 'BARTER-OUT-1',
      direction: 'outbound',
      status: 'posted',
      purchaseOrderId: null,
    });
    // Even if there were a resold batch in state, outbound short-circuits.
    state._dynamic!['barter_settlement_lines'].push({
      settlementId: SETTLEMENT_ID,
      batchId: BATCH_ID,
    });
    state.batches.push({
      id: BATCH_ID,
      intakeQty: '100.000',
      availableQty: '10.000', // would block inbound; outbound ignores.
    });

    await expect(
      assertBarterSettlementReversible(tx as never, SETTLEMENT_ID)
    ).resolves.toBeUndefined();
  });

  it('blocks inbound reversal when batch availableQty < intakeQty (resold downstream)', async () => {
    state._dynamic!['barter_settlements'].push({
      id: SETTLEMENT_ID,
      settlementNo: 'BARTER-IN-1',
      direction: 'inbound',
      status: 'posted',
      purchaseOrderId: null,
    });
    state._dynamic!['barter_settlement_lines'].push({
      id: LINE_ID,
      settlementId: SETTLEMENT_ID,
      batchId: BATCH_ID,
    });
    // Batch was intaken at 100, only 60 remaining — 40 units left the batch.
    state.batches.push({
      id: BATCH_ID,
      intakeQty: '100.000',
      availableQty: '60.000',
    });

    await expect(
      assertBarterSettlementReversible(tx as never, SETTLEMENT_ID)
    ).rejects.toThrow(/partly resold/i);
  });

  it('allows inbound reversal when no downstream movement has happened (availableQty == intakeQty)', async () => {
    state._dynamic!['barter_settlements'].push({
      id: SETTLEMENT_ID,
      settlementNo: 'BARTER-IN-2',
      direction: 'inbound',
      status: 'posted',
      purchaseOrderId: null,
    });
    state._dynamic!['barter_settlement_lines'].push({
      id: LINE_ID,
      settlementId: SETTLEMENT_ID,
      batchId: BATCH_ID,
    });
    state.batches.push({
      id: BATCH_ID,
      intakeQty: '50.000',
      availableQty: '50.000',
    });

    await expect(
      assertBarterSettlementReversible(tx as never, SETTLEMENT_ID)
    ).resolves.toBeUndefined();
  });

  it('blocks inbound reversal when the barter PO has been amended downstream', async () => {
    state._dynamic!['barter_settlements'].push({
      id: SETTLEMENT_ID,
      settlementNo: 'BARTER-IN-3',
      direction: 'inbound',
      status: 'posted',
      purchaseOrderId: PO_ID,
    });
    state._dynamic!['barter_settlement_lines'].push({
      id: LINE_ID,
      settlementId: SETTLEMENT_ID,
      batchId: BATCH_ID,
    });
    state.batches.push({
      id: BATCH_ID,
      intakeQty: '10.000',
      availableQty: '10.000',
    });
    // PO was 'received' when settlement posted; any other status means a
    // downstream amendment (e.g. correction journal flipped status).
    state.purchaseOrders.push({
      id: PO_ID,
      poNo: 'BTR-PO-DRIFT',
      status: 'amended',
    });

    await expect(
      assertBarterSettlementReversible(tx as never, SETTLEMENT_ID)
    ).rejects.toThrow(/downstream amendment/i);
  });

  it('allows inbound reversal when the barter PO is still in the as-posted state', async () => {
    state._dynamic!['barter_settlements'].push({
      id: SETTLEMENT_ID,
      settlementNo: 'BARTER-IN-4',
      direction: 'inbound',
      status: 'posted',
      purchaseOrderId: PO_ID,
    });
    state._dynamic!['barter_settlement_lines'].push({
      id: LINE_ID,
      settlementId: SETTLEMENT_ID,
      batchId: BATCH_ID,
    });
    state.batches.push({
      id: BATCH_ID,
      intakeQty: '10.000',
      availableQty: '10.000',
    });
    state.purchaseOrders.push({
      id: PO_ID,
      poNo: 'BTR-PO-CLEAN',
      status: 'received',
    });

    await expect(
      assertBarterSettlementReversible(tx as never, SETTLEMENT_ID)
    ).resolves.toBeUndefined();
  });

  it('blocks re-reversal of a settlement already in the reversed state', async () => {
    state._dynamic!['barter_settlements'].push({
      id: SETTLEMENT_ID,
      settlementNo: 'BARTER-DBL',
      direction: 'inbound',
      status: 'reversed',
      purchaseOrderId: null,
    });

    await expect(
      assertBarterSettlementReversible(tx as never, SETTLEMENT_ID)
    ).rejects.toThrow(/already reversed/i);
  });
});
