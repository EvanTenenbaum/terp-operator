import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();

vi.mock('../db', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
  pool: { query: vi.fn(), on: vi.fn(), connect: vi.fn() },
  pingDatabase: vi.fn(async () => true)
}));

const mockCtx = {
  req: {} as any,
  res: {} as any,
  io: {} as any,
  user: { id: 'test-user-id', name: 'Test', email: 'test@test.com', role: 'manager' as const }
};

describe('refereeCredits query', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns credits for the given referee ordered by created_at desc', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          refereeId: '22222222-2222-2222-2222-222222222222',
          transactionType: 'purchase_order',
          transactionNo: 'PO-001',
          transactionTotal: '1000.00',
          creditAmount: '50.00',
          amountPaid: '0.00',
          status: 'accrued',
          voidedAt: null,
          voidedReason: null,
          createdAt: new Date('2026-05-01T00:00:00Z')
        }
      ]
    });

    const { queriesRouter } = await import('../routers/queries');
    const caller = queriesRouter.createCaller(mockCtx);

    const result = await caller.refereeCredits({
      refereeId: '22222222-2222-2222-2222-222222222222'
    });

    expect(result).toHaveLength(1);
    expect((result[0] as any).creditAmount).toBe('50.00');
    expect((result[0] as any).status).toBe('accrued');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when referee has no credits', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });

    const { queriesRouter } = await import('../routers/queries');
    const caller = queriesRouter.createCaller(mockCtx);

    const result = await caller.refereeCredits({
      refereeId: '33333333-3333-3333-3333-333333333333'
    });

    expect(result).toEqual([]);
  });
});
