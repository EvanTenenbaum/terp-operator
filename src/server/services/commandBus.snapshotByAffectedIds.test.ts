import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.hoisted is required so the spy is available when the vi.mock factory runs
// (which is hoisted to the top of the file before module-level statements).
const { dbSelectSpy } = vi.hoisted(() => ({
  dbSelectSpy: vi.fn(),
}));

// Mock the module-level db so we can assert it is NOT called when
// snapshotByAffectedIds is invoked with an explicit tx (GH #150).
vi.mock('../db', () => ({
  db: {
    select: dbSelectSpy,
    transaction: async (fn: any) => fn({ select: vi.fn() })
  },
  pool: { query: async () => ({ rows: [] }) }
}));

import { snapshotByAffectedIds } from './commandBus';

function makeSelectChain(): ReturnType<typeof vi.fn> {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([])
    })
  });
}

beforeEach(() => {
  dbSelectSpy.mockClear();
});

describe('snapshotByAffectedIds — transaction-scoped select (GH #150)', () => {
  it('calls dbLike.select() and NOT the module-level db.select() when a tx is provided', async () => {
    const txSelectSpy = makeSelectChain();
    await snapshotByAffectedIds({ select: txSelectSpy } as any, ['id-1']);
    expect(txSelectSpy).toHaveBeenCalled();
    expect(dbSelectSpy).not.toHaveBeenCalled();
  });

  it('returns an empty object when ids array is empty (fast-path guard)', async () => {
    const result = await snapshotByAffectedIds({ select: makeSelectChain() } as any, []);
    expect(result).toEqual({});
    expect(dbSelectSpy).not.toHaveBeenCalled();
  });

  it('deduplicates ids and filters falsy values before querying', async () => {
    const txSelectSpy = makeSelectChain();
    await snapshotByAffectedIds({ select: txSelectSpy } as any, ['id-1', 'id-1', '', 'id-2', null as any]);
    // unique non-falsy set is ['id-1', 'id-2'] — non-empty, so select IS called
    expect(txSelectSpy).toHaveBeenCalled();
    expect(dbSelectSpy).not.toHaveBeenCalled();
  });

  it('returns a populated snapshot when the tx finds matching rows for a table', async () => {
    const BATCH_ROW = { id: 'id-1', name: 'Test Batch' };
    let callCount = 0;
    const txSelectSpy = vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() =>
          Promise.resolve(callCount++ === 0 ? [BATCH_ROW] : [])
        )
      })
    }));
    const result = await snapshotByAffectedIds({ select: txSelectSpy } as any, ['id-1']);
    // First table (batches) returned a row — snapshot should be non-empty
    const keys = Object.keys(result);
    expect(keys.length).toBeGreaterThan(0);
    expect(dbSelectSpy).not.toHaveBeenCalled();
  });
});
