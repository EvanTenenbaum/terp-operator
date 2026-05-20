import { describe, it, expect } from 'vitest';
import { paymentPayloadSchema } from './schemas';

/**
 * Issue #35 — DYN-L2 / DYN-L3.
 *
 * Previously `paymentPayloadSchema.amount` was `z.coerce.number()` with no
 * bounds and no precision check, so:
 *   - A typo like `1e10` was silently accepted (DYN-L2).
 *   - `{ amount: 5.001 }` was silently truncated to 5.00 by downstream
 *     `.toFixed(2)` calls (DYN-L3).
 *
 * The fix tightens the schema: ±1,000,000 bounds and a cent-alignment refine
 * that rejects non-2-decimal amounts upfront. Operators now see a clear
 * validation error instead of silent data loss.
 */

describe('paymentPayloadSchema.amount — DYN-L2 / DYN-L3', () => {
  describe('bounds (DYN-L2)', () => {
    it('rejects amounts above the upper bound (1e10)', () => {
      const result = paymentPayloadSchema.safeParse({ amount: 1e10 });
      expect(result.success).toBe(false);
    });

    it('rejects amounts below the lower bound (-1e10)', () => {
      const result = paymentPayloadSchema.safeParse({ amount: -1e10 });
      expect(result.success).toBe(false);
    });

    it('accepts 0', () => {
      const result = paymentPayloadSchema.safeParse({ amount: 0 });
      expect(result.success).toBe(true);
    });

    it('accepts a positive cent-aligned amount (100)', () => {
      const result = paymentPayloadSchema.safeParse({ amount: 100 });
      expect(result.success).toBe(true);
    });

    it('accepts a negative cent-aligned amount (-100) for buyer credit', () => {
      const result = paymentPayloadSchema.safeParse({ amount: -100 });
      expect(result.success).toBe(true);
    });

    it('accepts the exact upper bound (1,000,000)', () => {
      const result = paymentPayloadSchema.safeParse({ amount: 1_000_000 });
      expect(result.success).toBe(true);
    });

    it('accepts the exact lower bound (-1,000,000)', () => {
      const result = paymentPayloadSchema.safeParse({ amount: -1_000_000 });
      expect(result.success).toBe(true);
    });
  });

  describe('cent alignment (DYN-L3)', () => {
    it('rejects a non-cent-aligned amount (5.001)', () => {
      const result = paymentPayloadSchema.safeParse({ amount: 5.001 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path[0] === 'amount');
        expect(issue?.message).toMatch(/cent|decimal/i);
      }
    });

    it('rejects three-decimal negative (-5.001)', () => {
      const result = paymentPayloadSchema.safeParse({ amount: -5.001 });
      expect(result.success).toBe(false);
    });

    it('accepts a 2-decimal amount (5.25)', () => {
      const result = paymentPayloadSchema.safeParse({ amount: 5.25 });
      expect(result.success).toBe(true);
    });

    it('accepts a 1-decimal amount (5.2)', () => {
      const result = paymentPayloadSchema.safeParse({ amount: 5.2 });
      expect(result.success).toBe(true);
    });

    it('accepts whole-cent edge case (5.00)', () => {
      const result = paymentPayloadSchema.safeParse({ amount: 5.0 });
      expect(result.success).toBe(true);
    });
  });

  describe('coercion', () => {
    it('coerces string "100.50" to 100.5', () => {
      const result = paymentPayloadSchema.safeParse({ amount: '100.50' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.amount).toBe(100.5);
    });

    it('rejects coerced string above the upper bound', () => {
      const result = paymentPayloadSchema.safeParse({ amount: '1e10' });
      expect(result.success).toBe(false);
    });
  });
});
