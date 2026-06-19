/**
 * Intake domain — characterization tests.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/server/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  getDb: vi.fn(),
}));

describe('intake domain barrel', () => {
  let Intake: Record<string, unknown>;

  beforeAll(async () => {
    Intake = (await import('../index')) as unknown as Record<string, unknown>;
  });

  const expected = [
    'adjustBatchQuantity', 'createBatch', 'createCustomerSheetSnapshot', 'deleteBatch',
    'flagBatch', 'importBatchesCsv', 'rejectBatch', 'setBatchLotInfo',
    'setBatchPrice', 'updateBatch', 'verifyAllIntake',
  ];

  for (const name of expected) {
    it(`exports ${name}`, () => {
      expect(Intake).toHaveProperty(name);
      expect(typeof Intake[name]).toBe('function');
    });
  }
});

describe('intake domain — importBatchesCsv (pure rejection)', () => {
  it('importBatchesCsv throws immediately (TER-1658)', async () => {
    const mod = await import('../commands');
    await expect(
      mod.importBatchesCsv(null as any, {} as any, 'cmd-1')
    ).rejects.toThrow('CSV import is not available');
  });
});

describe('intake customer sheet snapshot helpers', () => {
  it('CUSTOMER_SHEET_MODES includes internal and catalog', async () => {
    const { CUSTOMER_SHEET_MODES } = await import('../../../shared/customerSheetSnapshot');
    expect(CUSTOMER_SHEET_MODES).toContain('internal');
    expect(CUSTOMER_SHEET_MODES).toContain('catalog');
  });

  it('buildCustomerSheetSnapshotRows returns sanitized rows', async () => {
    const { buildCustomerSheetSnapshotRows } = await import('../../../shared/customerSheetSnapshot');
    const input = [
      { name: 'Apple', price: '1.50', qty: '10' },
      { name: 'Banana', price: '0.75', qty: '20' },
    ];
    const result = buildCustomerSheetSnapshotRows(input, 'internal');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
  });
});
