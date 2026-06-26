/**
 * Phase 4 (§9) — Barter Settlement balance reconciliation invariant tests.
 *
 * `balanceReconciliation.ts` runs nightly and asserts
 *   SUM(client_ledger_entries.amount) == customers.balance  (drift threshold: 1 cent).
 *
 * Both `payWithProduct` (customer branch) and `settleDebtWithProduct` reduce
 * `customers.balance` and append one or two ledger rows that together carry
 * the signed delta. The math is intricate enough to drift if a future
 * refactor changes the split semantics, so this file pins the arithmetic
 * invariants in pure JS — no database required.
 *
 * The split rule (mirrored from both commands):
 *   newBalance      = currentBalance − settlementAmount
 *   positiveBalance = max(currentBalance, 0)
 *   settledPortion  = min(positiveBalance, settlementAmount)  → product_settlement entry
 *   excessPortion   = settlementAmount − settledPortion       → down_payment entry (buyer credit)
 *
 * Invariants we pin:
 *   I1.  settledPortion + excessPortion == settlementAmount  (no rounding loss)
 *   I2.  (initialBalance − settledPortion − excessPortion) == newBalance
 *   I3.  Σ ledger.amount entries == (newBalance − initialBalance)  (so drift = 0)
 *
 * Each test covers a distinct customer starting-balance regime: positive AR
 * fully covered, positive AR over-covered (buyer credit appears), already-
 * credit (negative) balance (excessPortion takes the full settlement), and
 * zero balance (excess only).
 */

import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

interface LedgerEntry {
  kind: 'product_settlement' | 'down_payment';
  amount: Decimal; // signed, matches schema column
}

function applyBarterReduction(
  initialBalance: Decimal,
  settlementAmount: Decimal
): { newBalance: Decimal; entries: LedgerEntry[] } {
  const positiveBalance = Decimal.max(initialBalance, new Decimal(0));
  const settledPortion = Decimal.min(positiveBalance, settlementAmount);
  const excessPortion = settlementAmount.minus(settledPortion);

  const balanceAfterSettled = initialBalance.minus(settledPortion);
  const balanceAfterExcess = balanceAfterSettled.minus(excessPortion);
  const newBalance = balanceAfterExcess.toDecimalPlaces(2);

  const entries: LedgerEntry[] = [];
  if (settledPortion.greaterThan(0)) {
    entries.push({ kind: 'product_settlement', amount: settledPortion.negated() });
  }
  if (excessPortion.greaterThan(0)) {
    entries.push({ kind: 'down_payment', amount: excessPortion.negated() });
  }
  return { newBalance, entries };
}

function sumEntries(entries: LedgerEntry[]): Decimal {
  return entries.reduce((acc, e) => acc.plus(e.amount), new Decimal(0));
}

describe('Barter settlement — balance reconciliation invariant (drift = 0)', () => {
  it('positive AR fully covered → one product_settlement entry, no buyer credit', () => {
    const initial = new Decimal('1000.00');
    const settlement = new Decimal('700.00');
    const { newBalance, entries } = applyBarterReduction(initial, settlement);

    // Σ(amount) == balance delta — the only invariant the reconciliation cron
    // checks. This is what makes drift = 0.
    const sum = sumEntries(entries);
    expect(sum.toFixed(2)).toBe(newBalance.minus(initial).toFixed(2));

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('product_settlement');
    expect(newBalance.toFixed(2)).toBe('300.00');
  });

  it('positive AR over-covered → two entries (settlement + buyer credit)', () => {
    // Customer owes $400; settles with $700 of product. $400 consumes AR; $300
    // becomes a buyer credit (down_payment). Both ledger rows must sum to
    // exactly the balance delta.
    const initial = new Decimal('400.00');
    const settlement = new Decimal('700.00');
    const { newBalance, entries } = applyBarterReduction(initial, settlement);

    const sum = sumEntries(entries);
    expect(sum.toFixed(2)).toBe(newBalance.minus(initial).toFixed(2));

    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe('product_settlement');
    expect(entries[0].amount.toFixed(2)).toBe('-400.00');
    expect(entries[1].kind).toBe('down_payment');
    expect(entries[1].amount.toFixed(2)).toBe('-300.00');
    expect(newBalance.toFixed(2)).toBe('-300.00'); // buyer credit
  });

  it('already-credit customer → single down_payment entry, all excess', () => {
    // Customer already has a buyer credit of $100 (balance = -100). Operator
    // issues $200 of product as a refund-in-kind (payWithProduct customer
    // branch). All $200 is "excess" — no positive AR to consume.
    const initial = new Decimal('-100.00');
    const settlement = new Decimal('200.00');
    const { newBalance, entries } = applyBarterReduction(initial, settlement);

    const sum = sumEntries(entries);
    expect(sum.toFixed(2)).toBe(newBalance.minus(initial).toFixed(2));

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('down_payment');
    expect(entries[0].amount.toFixed(2)).toBe('-200.00');
    expect(newBalance.toFixed(2)).toBe('-300.00');
  });

  it('zero-balance customer → single down_payment entry, all excess', () => {
    const initial = new Decimal('0.00');
    const settlement = new Decimal('150.00');
    const { newBalance, entries } = applyBarterReduction(initial, settlement);

    const sum = sumEntries(entries);
    expect(sum.toFixed(2)).toBe(newBalance.minus(initial).toFixed(2));

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('down_payment');
    expect(newBalance.toFixed(2)).toBe('-150.00');
  });

  it('cent-precision: 33.33-style split sums exactly to the settlement amount', () => {
    // Adversarial: balance 100.00, settlement 33.33 — the entry/balance math
    // must round to two decimal places without losing a cent.
    const initial = new Decimal('100.00');
    const settlement = new Decimal('33.33');
    const { newBalance, entries } = applyBarterReduction(initial, settlement);

    const sum = sumEntries(entries);
    expect(sum.toFixed(2)).toBe(newBalance.minus(initial).toFixed(2));
    expect(entries[0].amount.toFixed(2)).toBe('-33.33');
    expect(newBalance.toFixed(2)).toBe('66.67');
  });

  it('multi-step: two sequential settlements both preserve drift = 0', () => {
    // First settlement consumes part of AR. Second over-settles into buyer
    // credit. The cumulative ledger sum must equal cumulative balance delta.
    let balance = new Decimal('500.00');
    const ledger: LedgerEntry[] = [];

    let r = applyBarterReduction(balance, new Decimal('200.00'));
    ledger.push(...r.entries);
    const firstDelta = r.newBalance.minus(balance);
    balance = r.newBalance;

    r = applyBarterReduction(balance, new Decimal('400.00'));
    ledger.push(...r.entries);
    const secondDelta = r.newBalance.minus(balance);
    balance = r.newBalance;

    const totalDelta = firstDelta.plus(secondDelta);
    const sum = sumEntries(ledger);
    expect(sum.toFixed(2)).toBe(totalDelta.toFixed(2));
    expect(balance.toFixed(2)).toBe('-100.00');
  });
});

describe('Barter settlement — outbound vendor branch arithmetic', () => {
  // Vendor branch reduces vendor_bills.amount_paid (not customer.balance). The
  // invariant we pin: settlement_amount applied to a bill cannot exceed the
  // open balance (billAmount − billPaid). Mirrors the guard in
  // payWithProduct step 8.
  it('rejects settlement that would exceed open vendor bill balance', () => {
    const billAmount = new Decimal('500.00');
    const billPaid = new Decimal('300.00');
    const settlement = new Decimal('300.00'); // attempts to overpay by $100

    const open = billAmount.minus(billPaid);
    const wouldExceed = billPaid.plus(settlement).greaterThan(billAmount);
    expect(wouldExceed).toBe(true);
    expect(open.toFixed(2)).toBe('200.00');
  });

  it('marks bill paid when settlement closes the gap exactly', () => {
    const billAmount = new Decimal('500.00');
    const billPaid = new Decimal('300.00');
    const settlement = new Decimal('200.00');
    const nextPaid = billPaid.plus(settlement);
    const isFullyPaid = nextPaid.gte(billAmount);
    expect(isFullyPaid).toBe(true);
    expect(nextPaid.toFixed(2)).toBe('500.00');
  });
});
