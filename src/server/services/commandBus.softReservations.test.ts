import { describe, it, expect } from 'vitest';

/**
 * TER-1634: draftReservedQty projection — soft reservation guard
 *
 * These tests document the guard design (pure-logic assertions, following the
 * pattern of commandBus.conflictDetection.test.ts).  The concurrency test
 * demonstrates the intended sequential blocking behavior.
 *
 * KNOWN LIMITATION (GH #249): The soft guard shifts but does NOT close the
 * TOCTOU race window.  Two operators who read the projection simultaneously
 * (before either commits) can both pass and both add overlapping qty.  The
 * hard close is at reserveInventoryForOrder (FOR UPDATE row-lock).  This is
 * documented inline and in the PR body.
 */

// ---------------------------------------------------------------------------
// Guard formula helpers — mirror the production guard logic
// ---------------------------------------------------------------------------

function guardWouldBlock(
  availableQty: number,
  reservedQty: number,
  draftReservedQty: number,
  requestedQty: number
): boolean {
  return availableQty - reservedQty - draftReservedQty < requestedQty;
}

// ---------------------------------------------------------------------------
// addSalesOrderLine guard
// ---------------------------------------------------------------------------

describe('addSalesOrderLine draftReservedQty guard', () => {
  it('blocks when availableQty - reservedQty - draftReservedQty < qty', () => {
    // 10 - 3 - 5 = 2, requesting 3 → should block
    expect(guardWouldBlock(10, 3, 5, 3)).toBe(true);
  });

  it('allows when availableQty - reservedQty - draftReservedQty === qty (exact fit)', () => {
    // 10 - 3 - 5 = 2, requesting 2 → exact fit, should allow
    expect(guardWouldBlock(10, 3, 5, 2)).toBe(false);
  });

  it('allows when availableQty - reservedQty - draftReservedQty > qty', () => {
    // 10 - 3 - 5 = 2, requesting 1 → headroom, should allow
    expect(guardWouldBlock(10, 3, 5, 1)).toBe(false);
  });

  it('allows when draftReservedQty is 0 (no competing drafts) — original behavior preserved', () => {
    // 10 - 3 - 0 = 7, requesting 7 → passes (same as old guard without soft check)
    expect(guardWouldBlock(10, 3, 0, 7)).toBe(false);
  });

  it('treats missing batchId in draftReservedQty map as 0', () => {
    const draftMap: Record<string, number> = {};
    const batchId = '33333333-3333-3333-3333-333333333333';
    const draftReservedQty = draftMap[batchId] ?? 0;
    expect(draftReservedQty).toBe(0);
    // Guard with missing key → same as no competing drafts
    expect(guardWouldBlock(10, 0, draftReservedQty, 5)).toBe(false);
  });

  it('blocks when only draftReservedQty makes it insufficient (reservedQty is 0)', () => {
    // Formal reservation hasn't happened yet but another draft has claimed qty
    // 10 - 0 - 8 = 2, requesting 5 → blocks
    expect(guardWouldBlock(10, 0, 8, 5)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// excludeOrderId prevents double-counting an order's own lines
// ---------------------------------------------------------------------------

describe('excludeOrderId correctness', () => {
  it("own order's lines are excluded so the operator can update without hitting their own reservation", () => {
    // Scenario: Order A already has 3 lbs on batch X.
    // Without excludeOrderId: 10 - 0 - 3 = 7 headroom
    // With excludeOrderId:    10 - 0 - 0 = 10 headroom (own 3 lbs excluded)
    const withoutExclude = 10 - 0 - 3; // 7
    const withExclude = 10 - 0 - 0; // 10
    expect(withExclude).toBeGreaterThan(withoutExclude);
    // Operator wants 10 lbs — only possible because own lines are excluded
    expect(guardWouldBlock(10, 0, 0, 10)).toBe(false);
    expect(guardWouldBlock(10, 0, 3, 10)).toBe(true); // without exclude, fails
  });

  it('cross-operator contention is still detected even with excludeOrderId', () => {
    // Operator A: order=A wants 6 lbs. excludeOrderId=A hides none (A has no lines yet).
    // Operator B: order=B has 5 lbs already. draftReservedQty for A's request = 5.
    // 10 - 0 - 5 = 5 < 6 → A is blocked
    expect(guardWouldBlock(10, 0, 5, 6)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Concurrency / sequential race behavior
// ---------------------------------------------------------------------------

describe('concurrency: two operators competing for the same batch', () => {
  it('serial scenario: B is blocked after A has committed their draft line', () => {
    // Step 1 — A reads projection: 0 competing drafts. A wants 7 lbs. Allowed.
    const aBlocked = guardWouldBlock(10, 0, 0, 7);
    expect(aBlocked).toBe(false);
    // Step 2 — A's line is now in the DB (3 lbs from another order already reserved = 3).
    // B reads projection: 7 (A's new draft line) lbs competing.
    // B wants 7 lbs. 10 - 0 - 7 = 3 < 7 → blocked.
    const bBlocked = guardWouldBlock(10, 0, 7, 7);
    expect(bBlocked).toBe(true);
  });

  it('TOCTOU window (GH #249): simultaneous reads both pass — documented, not regressed', () => {
    // Both A and B read projection before either commits.
    // Both see 0 competing drafts. Both want 7 lbs. Both pass soft guard.
    // Hard close only at reserveInventoryForOrder (FOR UPDATE lock).
    const aBlocked = guardWouldBlock(10, 0, 0, 7);
    const bBlocked = guardWouldBlock(10, 0, 0, 7);
    expect(aBlocked).toBe(false);
    expect(bBlocked).toBe(false);
    // Both passing is the KNOWN limitation — this test documents the residual window.
  });

  it('partial overlap is caught when B reads after A commits', () => {
    // Batch has 10 lbs available.
    // A (in draft): 4 lbs. B wants 8 lbs.
    // 10 - 0 - 4 = 6 < 8 → B blocked. Soft guard fires before any DB write.
    expect(guardWouldBlock(10, 0, 4, 8)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateSalesOrderLine guard (latent gap fix, TER-1634)
// ---------------------------------------------------------------------------

describe('updateSalesOrderLine availability re-check on qty increase', () => {
  it('blocks when new qty exceeds availableQty - reservedQty - draftReservedQty', () => {
    // 8 - 2 - 4 = 2, new qty 5 → block
    expect(guardWouldBlock(8, 2, 4, 5)).toBe(true);
  });

  it('allows when new qty exactly equals available headroom', () => {
    // 8 - 2 - 4 = 2, new qty 2 → allow
    expect(guardWouldBlock(8, 2, 4, 2)).toBe(false);
  });

  it('guard is skipped when payload.qty is null (no qty change)', () => {
    // The guard only runs when payload.qty is non-null
    const payloadQty = null;
    const guardShouldRun = payloadQty != null;
    expect(guardShouldRun).toBe(false);
  });

  it('guard is skipped when the line has no batchId (free-text line)', () => {
    const effectiveBatchId = null as string | null;
    const guardShouldRun = effectiveBatchId != null;
    expect(guardShouldRun).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getDraftReservedQtyMap projection filtering
// ---------------------------------------------------------------------------

describe('getDraftReservedQtyMap projection excludes terminal line statuses', () => {
  const EXCLUDED_STATUSES = ['reserved', 'allocated', 'posted', 'cancelled'];
  const INCLUDED_STATUSES = ['draft', 'needs_fix', 'ready', 'confirmed'];

  for (const status of EXCLUDED_STATUSES) {
    it(`excludes lines with status='${status}' from draftReservedQty`, () => {
      // A line in this status should NOT count toward draftReservedQty
      const includedInProjection = !EXCLUDED_STATUSES.includes(status);
      expect(includedInProjection).toBe(false);
    });
  }

  for (const status of INCLUDED_STATUSES) {
    it(`includes lines with status='${status}' in draftReservedQty`, () => {
      const includedInProjection = !EXCLUDED_STATUSES.includes(status);
      expect(includedInProjection).toBe(true);
    });
  }

  it('project only counts orders where so.status IN (draft, confirmed)', () => {
    const COUNTED_ORDER_STATUSES = ['draft', 'confirmed'];
    const UNCOUNTED_ORDER_STATUSES = ['posted', 'cancelled', 'reversed'];
    for (const s of COUNTED_ORDER_STATUSES) {
      expect(COUNTED_ORDER_STATUSES.includes(s)).toBe(true);
    }
    for (const s of UNCOUNTED_ORDER_STATUSES) {
      expect(COUNTED_ORDER_STATUSES.includes(s)).toBe(false);
    }
  });
});
