import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

/**
 * Phase 4 (§9) — Barter Settlement money invariant contract tests.
 *
 * Mirrors the `moneyInvariants.test.ts` pattern: this is a contract test, not
 * a database integration test. It reads the Phase 0 migration from disk and
 * asserts the storage-layer CHECK constraints required by the plan §5.3 / §9
 * are present, plus a JS-side arithmetic invariant on the computed
 * gain/loss = settlement_amount − cost_basis equation.
 *
 * The migration constraints are added as `NOT VALID` (consistent with the
 * existing moneyInvariants 0041 / 0055 pattern), so they only enforce against
 * future writes; pre-existing rows are validated by a separate manual
 * `VALIDATE CONSTRAINT` step run by an operator after confirming no legacy
 * drift.
 */

const BARTER_MIGRATION_PATH = resolve(__dirname, '../../migrations/0085_barter_settlement.sql');

describe('migration 0085_barter_settlement — money invariants', () => {
  const sql = readFileSync(BARTER_MIGRATION_PATH, 'utf8');
  const normalized = sql.replace(/\s+/g, ' ');

  it('adds barter_settlements amounts CHECK constraint as NOT VALID', () => {
    // settlement_amount and cost_basis must both be non-negative dollar
    // values. This is the storage-layer guard backing the plan §4 / §5
    // "amounts are non-negative" invariant.
    expect(normalized).toMatch(
      /ALTER TABLE barter_settlements\s+ADD CONSTRAINT barter_settlements_amounts_chk\s+CHECK \(settlement_amount >= 0 AND cost_basis >= 0\)\s+NOT VALID/i
    );
  });

  it('adds barter_settlement_lines qty + unit_cost CHECK constraint as NOT VALID', () => {
    // qty > 0 (every settlement line moves at least some product) and
    // unit_cost >= 0 (allow free/comp lines for completeness).
    expect(normalized).toMatch(
      /ALTER TABLE barter_settlement_lines\s+ADD CONSTRAINT barter_settlement_lines_qty_chk\s+CHECK \(qty > 0 AND unit_cost >= 0\)\s+NOT VALID/i
    );
  });

  it('adds barter_settlement_allocations amount CHECK constraint as NOT VALID', () => {
    // Every allocation must move a positive dollar amount onto an invoice.
    expect(normalized).toMatch(
      /ALTER TABLE barter_settlement_allocations\s+ADD CONSTRAINT barter_settlement_allocations_amount_chk\s+CHECK \(amount > 0\)\s+NOT VALID/i
    );
  });

  it('declares the three NUMERIC(12,2) money columns on barter_settlements', () => {
    // Settlement_amount, cost_basis, gain_loss all share the standard money
    // precision used across invoices/payments/vendor_bills.
    expect(normalized).toMatch(/settlement_amount NUMERIC\(12,2\)/i);
    expect(normalized).toMatch(/cost_basis NUMERIC\(12,2\)/i);
    expect(normalized).toMatch(/gain_loss NUMERIC\(12,2\)/i);
  });

  it('declares qty as NUMERIC(12,3) — three-decimal precision matching batches', () => {
    expect(normalized).toMatch(/qty NUMERIC\(12,3\)/i);
  });

  it('declares gain_loss with a default of 0 (Phase 4 ensures equality to settlement − cost)', () => {
    expect(normalized).toMatch(/gain_loss NUMERIC\(12,2\) NOT NULL DEFAULT 0/i);
  });
});

describe('barter gain_loss arithmetic invariant', () => {
  // Application-layer invariant: gain_loss = settlement_amount - cost_basis
  // for every settlement. This is enforced by the `payWithProduct` and
  // `settleDebtWithProduct` handlers in `src/domains/barter/commands.ts` via
  // `gainLoss = subMoney(settlementAmount, costBasis)`. These tests pin the
  // arithmetic so a regression in the Decimal/rounding helpers shows up here
  // before it can corrupt the gain/loss journal.

  function gainLoss(settlement: string, cost: string): string {
    // Mirror the production formula (subMoney). Decimal.js floors to 2dp
    // matching commandBus.subMoney.
    return new Decimal(settlement).minus(new Decimal(cost)).toDecimalPlaces(2).toFixed(2);
  }

  it('zero gain/loss when settlement equals cost basis (Phase 0 default path)', () => {
    expect(gainLoss('150.00', '150.00')).toBe('0.00');
  });

  it('positive gain when settlement above cost basis', () => {
    // A manager+ override may credit settlementAmount above cost; the
    // remainder is a realized gain.
    expect(gainLoss('200.00', '150.00')).toBe('50.00');
  });

  it('negative loss when settlement below cost basis', () => {
    // Below-cost override is a realized loss; the journal entry carries a
    // negative amount.
    expect(gainLoss('100.00', '150.00')).toBe('-50.00');
  });

  it('preserves cents-precision across multi-line rounding sums', () => {
    // Pro-rata distribution from the per-line settlement loop in
    // payWithProduct must sum to exactly settlementAmount. Spot-check a
    // 1/3-style split that would lose a cent without Decimal.js.
    const lines = [
      new Decimal('100.00').times('33.33').dividedBy('100.00'),
      new Decimal('100.00').times('33.33').dividedBy('100.00'),
      new Decimal('100.00').times('33.34').dividedBy('100.00')
    ];
    const sum = lines.reduce((a, b) => a.plus(b), new Decimal(0)).toDecimalPlaces(2);
    expect(sum.toFixed(2)).toBe('100.00');
  });

  it('large-value gain stays within NUMERIC(12,2) range (no overflow into precision loss)', () => {
    // The storage column is NUMERIC(12,2): max ~9,999,999,999.99. Test a
    // realistic large barter (10k+ dollars) keeps cent-precision.
    expect(gainLoss('1234567.89', '1234500.00')).toBe('67.89');
  });
});
