/**
 * Credit domain — characterization tests.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  getDb: vi.fn(),
}));

describe('credit domain barrel', () => {
  let Credit: Record<string, unknown>;

  beforeAll(async () => {
    Credit = (await import('../index')) as unknown as Record<string, unknown>;
  });

  const expected = [
    'bulkRevertCustomersToEngine', 'createCreditEngineStance', 'deleteCreditEngineStance',
    'disableCreditEngineForCustomer', 'enableCreditEngineForCustomer', 'revertCustomerCreditToEngine',
    'setCreditEngineConfig', 'setCustomerCreditLimit', 'setCustomerEngineMax',
    'setCustomerStance', 'snoozeCustomerCreditReminder', 'updateCreditEngineStance',
  ];

  for (const name of expected) {
    it(`exports ${name}`, () => {
      expect(Credit).toHaveProperty(name);
      expect(typeof Credit[name]).toBe('function');
    });
  }
});

describe('credit domain schema validation', () => {
  it('setCustomerCreditLimitPayloadSchema requires customerId', async () => {
    const { setCustomerCreditLimitPayloadSchema } = await import('@/server/services/commandBus');
    const result = setCustomerCreditLimitPayloadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('setCustomerCreditLimitPayloadSchema accepts valid payload', async () => {
    const { setCustomerCreditLimitPayloadSchema } = await import('@/server/services/commandBus');
    const result = setCustomerCreditLimitPayloadSchema.safeParse({
      customerId: '00000000-0000-0000-0000-000000000000',
      amount: 5000,
      reason: 'Credit review',
    });
    expect(result.success).toBe(true);
  });
});
