import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contract test for migration `0041_money_invariants.sql`.
 *
 * Money + inventory invariants live in application code today; this migration
 * promotes them into the storage layer as CHECK constraints so storage-level
 * drift surfaces immediately. The migration is deliberately additive — each
 * constraint is added with `NOT VALID` so it only enforces against future
 * writes. A separate, manually-run `VALIDATE CONSTRAINT` (documented in the
 * migration header) scans existing rows once an operator has confirmed there
 * is no legacy drift to clean up.
 *
 * This test is a contract assertion: no database connection, no fixtures. It
 * reads the migration file from disk and asserts that the expected
 * `ADD CONSTRAINT ... CHECK (...) NOT VALID` statements are present for each
 * of the four invariants required by issue #18 slice 1. If someone deletes a
 * constraint or weakens the NOT VALID pattern, this test fails loudly.
 */

const MIGRATION_PATH = resolve(__dirname, '../../../migrations/0041_money_invariants.sql');

describe('migration 0041_money_invariants', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const normalized = sql.replace(/\s+/g, ' ');

  it('adds invoices.amount_paid CHECK constraint as NOT VALID', () => {
    expect(normalized).toMatch(
      /ALTER TABLE invoices\s+ADD CONSTRAINT invoices_amount_paid_chk\s+CHECK \(amount_paid >= 0 AND amount_paid <= total\)\s+NOT VALID/i
    );
  });

  it('adds payments.unapplied_amount CHECK constraint as NOT VALID', () => {
    expect(normalized).toMatch(
      /ALTER TABLE payments\s+ADD CONSTRAINT payments_unapplied_amount_chk\s+CHECK \(unapplied_amount >= 0\)\s+NOT VALID/i
    );
  });

  it('adds batches qty CHECK constraint covering intake, available, reserved as NOT VALID', () => {
    expect(normalized).toMatch(
      /ALTER TABLE batches\s+ADD CONSTRAINT batches_qty_nonneg_chk\s+CHECK \(intake_qty >= 0 AND available_qty >= 0 AND reserved_qty >= 0\)\s+NOT VALID/i
    );
  });

  it('adds purchase_order_lines qty CHECK constraint covering qty + received_qty as NOT VALID', () => {
    expect(normalized).toMatch(
      /ALTER TABLE purchase_order_lines\s+ADD CONSTRAINT purchase_order_lines_qty_nonneg_chk\s+CHECK \(qty >= 0 AND received_qty >= 0\)\s+NOT VALID/i
    );
  });

  it('guards every ADD CONSTRAINT with an idempotent pg_constraint existence check', () => {
    // Re-runnable migrations are mandatory. Each constraint must be wrapped in
    // a `IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '...')`
    // guard so re-applying the migration is a no-op.
    const expectedConames = [
      'invoices_amount_paid_chk',
      'payments_unapplied_amount_chk',
      'batches_qty_nonneg_chk',
      'purchase_order_lines_qty_nonneg_chk'
    ];
    for (const coname of expectedConames) {
      const guard = new RegExp(
        `IF NOT EXISTS \\(\\s*SELECT 1 FROM pg_constraint WHERE conname = '${coname}'\\s*\\)`,
        'i'
      );
      expect(normalized).toMatch(guard);
    }
  });

  it('documents the manual VALIDATE step for each constraint in the leading comment block', () => {
    // The header must list the exact `ALTER TABLE ... VALIDATE CONSTRAINT ...`
    // statements an operator runs after auditing for pre-existing drift.
    expect(sql).toMatch(/ALTER TABLE invoices\s+VALIDATE CONSTRAINT invoices_amount_paid_chk/i);
    expect(sql).toMatch(/ALTER TABLE payments\s+VALIDATE CONSTRAINT payments_unapplied_amount_chk/i);
    expect(sql).toMatch(/ALTER TABLE batches\s+VALIDATE CONSTRAINT batches_qty_nonneg_chk/i);
    expect(sql).toMatch(
      /ALTER TABLE purchase_order_lines\s+VALIDATE CONSTRAINT purchase_order_lines_qty_nonneg_chk/i
    );
  });
});
