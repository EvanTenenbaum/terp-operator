/**
 * Pick domain — characterization tests.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  getDb: vi.fn(),
}));

describe('pick domain barrel', () => {
  let Pick: Record<string, unknown>;

  beforeAll(async () => {
    Pick = (await import('../index')) as unknown as Record<string, unknown>;
  });

  const expected = [
    'allocateOrderToFulfillment', 'printLabels', 'recallLineFromPicking',
    'recordWeighAndPack', 'releaseLineForPicking', 'releaseLinesForPicking', 'returnPickedUnits',
  ];

  for (const name of expected) {
    it(`exports ${name}`, () => {
      expect(Pick).toHaveProperty(name);
      expect(typeof Pick[name]).toBe('function');
    });
  }
});

describe('pick domain — releaseLinesForPicking bulk validation', () => {
  it('releases lines for picking with mock tx (pre-DB validation)', async () => {
    const mod = await import('../commands');
    const mockTx = {} as any;
    // Non-array payload should throw before any DB access
    await expect(
      mod.releaseLinesForPicking(mockTx, { lineIds: 'not-an-array' }, 'user-1', 'cmd-1')
    ).rejects.toThrow('lineIds must be a non-empty array');
  });
});

describe('pick domain — returnPickedUnits qty validation', () => {
  it('requires positive quantity', async () => {
    const mod = await import('../commands');
    const mockTx = {} as any;
    await expect(
      mod.returnPickedUnits(mockTx, {
        fulfillmentLineId: '00000000-0000-0000-0000-000000000000',
        qty: -5,
      }, 'cmd-1')
    ).rejects.toThrow('Return quantity must be greater than zero');
  });

  it('rejects zero quantity', async () => {
    const mod = await import('../commands');
    const mockTx = {} as any;
    await expect(
      mod.returnPickedUnits(mockTx, {
        fulfillmentLineId: '00000000-0000-0000-0000-000000000000',
        qty: 0,
      }, 'cmd-1')
    ).rejects.toThrow('Return quantity must be greater than zero');
  });
});
