/**
 * Inventory domain — characterization tests.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  getDb: vi.fn(),
}));

describe('inventory domain barrel', () => {
  let Inventory: Record<string, unknown>;

  beforeAll(async () => {
    Inventory = (await import('../index')) as unknown as Record<string, unknown>;
  });

  const expected = ['setInventoryStatus', 'transferInventoryLocation', 'transferInventoryOwnership'];

  for (const name of expected) {
    it(`exports ${name}`, () => {
      expect(Inventory).toHaveProperty(name);
      expect(typeof Inventory[name]).toBe('function');
    });
  }
});

describe('inventory ownership schema validation', () => {
  it('ownershipSchema accepts valid values', async () => {
    const { ownershipSchema } = await import('../../../shared/schemas');
    expect(ownershipSchema.safeParse('C').success).toBe(true);
    expect(ownershipSchema.safeParse('OFC').success).toBe(true);
    expect(ownershipSchema.safeParse('UNKNOWN').success).toBe(true);
  });

  it('ownershipSchema rejects invalid values', async () => {
    const { ownershipSchema } = await import('../../../shared/schemas');
    expect(ownershipSchema.safeParse('INVALID').success).toBe(false);
  });

  it('inventoryStatusSchema accepts valid statuses', async () => {
    const { inventoryStatusSchema } = await import('../../../shared/schemas');
    expect(inventoryStatusSchema.safeParse('posted').success).toBe(true);
    expect(inventoryStatusSchema.safeParse('held').success).toBe(true);
    expect(inventoryStatusSchema.safeParse('damaged').success).toBe(true);
    expect(inventoryStatusSchema.safeParse('returned').success).toBe(true);
    expect(inventoryStatusSchema.safeParse('in_transit').success).toBe(true);
  });

  it('inventoryStatusSchema rejects invalid statuses', async () => {
    const { inventoryStatusSchema } = await import('../../../shared/schemas');
    expect(inventoryStatusSchema.safeParse('unknown').success).toBe(false);
    expect(inventoryStatusSchema.safeParse('').success).toBe(false);
  });
});
