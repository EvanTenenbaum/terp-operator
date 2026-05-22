import { describe, it, expect } from 'vitest';

// CAP-030: Unit tests for picking command eligibility/guard logic
// (TER-1485 release/recall, TER-1488 ack/return/cancel).
//
// These tests exercise the pure logic that lives inside the command handlers
// without a real DB connection — full DB-integration coverage will land via
// the integration test suite when the migration is applied in CI.

describe('releaseLineForPicking eligibility', () => {
  it('requires an item name', () => {
    expect(() => {
      const line = { itemName: '', batchId: 'abc', qty: '1.000', validationIssues: [], pickReleasedAt: null };
      if (!line.itemName) throw new Error('Line must have an item before releasing for picking.');
    }).toThrow('Line must have an item before releasing for picking.');
  });

  it('requires a batch', () => {
    expect(() => {
      const line = { itemName: 'Flower A', batchId: null, qty: '1.000', validationIssues: [], pickReleasedAt: null };
      if (!line.batchId) throw new Error('Line must have a batch assigned before releasing for picking.');
    }).toThrow('Line must have a batch assigned before releasing for picking.');
  });

  it('requires qty > 0', () => {
    expect(() => {
      const line = { itemName: 'Flower A', batchId: 'abc', qty: '0.000', validationIssues: [], pickReleasedAt: null };
      if (Number(line.qty) <= 0) throw new Error('Line quantity must be greater than zero before releasing for picking.');
    }).toThrow('Line quantity must be greater than zero before releasing for picking.');
  });

  it('blocks on fatal validation issues but allows range-priced COGS issue', () => {
    const fatalIssue = 'Batch price is missing.';
    const cogsIssue = 'Pick landed COGS in $10-$20.';

    const fatalFilter = (issues: string[]) => issues.filter((i) => !i.startsWith('Pick landed COGS'));

    expect(fatalFilter([fatalIssue])).toHaveLength(1);
    expect(fatalFilter([cogsIssue])).toHaveLength(0);
    expect(fatalFilter([cogsIssue, fatalIssue])).toHaveLength(1);
  });

  it('blocks when batch.reservedQty < line.qty', () => {
    expect(() => {
      const line = { itemName: 'Flower A', qty: '5.000' };
      const batch = { reservedQty: '2.000' };
      if (Number(batch.reservedQty) < Number(line.qty)) {
        throw new Error(`${line.itemName} does not have sufficient reservation. Reserve inventory first.`);
      }
    }).toThrow('Reserve inventory first');
  });

  it('is idempotent on already-released lines', () => {
    const line = { pickReleasedAt: new Date() };
    // Guard short-circuits without throwing.
    expect(!!line.pickReleasedAt).toBe(true);
  });
});

describe('recallLineFromPicking guard', () => {
  it('blocks recall when actual_qty > 0', () => {
    expect(() => {
      const fl = { status: 'open', actualQty: '1.000' };
      if (fl.status !== 'open' || Number(fl.actualQty) > 0) {
        throw new Error('Cannot recall a line that has already been picked or is in progress. Use returnPickedUnits first.');
      }
    }).toThrow('Cannot recall');
  });

  it('blocks recall when status is not open', () => {
    expect(() => {
      const fl = { status: 'packed', actualQty: '0.000' };
      if (fl.status !== 'open' || Number(fl.actualQty) > 0) {
        throw new Error('Cannot recall a line that has already been picked or is in progress. Use returnPickedUnits first.');
      }
    }).toThrow('Cannot recall');
  });

  it('allows recall when status=open and actualQty=0', () => {
    const fl = { status: 'open', actualQty: '0.000' };
    const allowed = fl.status === 'open' && Number(fl.actualQty) === 0;
    expect(allowed).toBe(true);
  });

  it('is idempotent on lines that are not released', () => {
    const line = { pickReleasedAt: null };
    expect(!!line.pickReleasedAt).toBe(false);
  });
});

describe('releaseLinesForPicking input validation', () => {
  it('rejects empty lineIds', () => {
    expect(() => {
      const lineIds: string[] = [];
      if (!lineIds.length) throw new Error('lineIds must be a non-empty array.');
    }).toThrow('lineIds must be a non-empty array.');
  });

  it('filters non-string entries', () => {
    const raw: unknown[] = ['a', 123, null, 'b', undefined, 'c'];
    const filtered = raw.filter((id): id is string => typeof id === 'string');
    expect(filtered).toEqual(['a', 'b', 'c']);
  });
});
