/**
 * Payments domain — characterization tests.
 *
 * Uses vi.mock to short-circuit the DB import chain.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  getDb: vi.fn(),
}));

describe('payments domain barrel', () => {
  let Payments: Record<string, unknown>;

  beforeAll(async () => {
    Payments = (await import('../index')) as unknown as Record<string, unknown>;
  });

  const expected = [
    'allocatePayment', 'applyClientCredit', 'applyDiscount', 'logPayment',
    'markPaymentUnapplied', 'markUserFeeCollected', 'recordVendorPayment',
    'refundPayment', 'scheduleVendorPayment', 'unallocatePayment', 'voidVendorPayment',
  ];

  for (const name of expected) {
    it(`exports ${name}`, () => {
      expect(Payments).toHaveProperty(name);
      expect(typeof Payments[name]).toBe('function');
    });
  }
});

describe('payments domain — paymentPayloadSchema validation', () => {
  it('rejects amount above 1e10 bound', async () => {
    const { paymentPayloadSchema } = await import('../../../shared/schemas');
    const result = paymentPayloadSchema.safeParse({ amount: 1e10 });
    expect(result.success).toBe(false);
  });

  it('rejects non-cent-aligned amount', async () => {
    const { paymentPayloadSchema } = await import('../../../shared/schemas');
    const result = paymentPayloadSchema.safeParse({ amount: 5.001 });
    expect(result.success).toBe(false);
  });

  it('accepts valid payment amount 100.50', async () => {
    const { paymentPayloadSchema } = await import('../../../shared/schemas');
    const result = paymentPayloadSchema.safeParse({ amount: 100.50 });
    expect(result.success).toBe(true);
  });

  it('accepts 0 amount', async () => {
    const { paymentPayloadSchema } = await import('../../../shared/schemas');
    const result = paymentPayloadSchema.safeParse({ amount: 0 });
    expect(result.success).toBe(true);
  });
});

describe('payments domain — allocatePayment schema', () => {
  it('allocatePaymentPayloadSchema requires paymentId', async () => {
    const { allocatePaymentPayloadSchema } = await import('@/server/services/commandBus');
    const result = allocatePaymentPayloadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('unallocatePaymentPayloadSchema requires allocationId', async () => {
    const { unallocatePaymentPayloadSchema } = await import('@/server/services/commandBus');
    const result = unallocatePaymentPayloadSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
