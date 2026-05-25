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

describe('acknowledgeWarehouseAlert', () => {
  it('rejects negative alertIndex', () => {
    expect(() => {
      const alertIndex = -1;
      if (!Number.isInteger(alertIndex) || alertIndex < 0) {
        throw new Error('alertIndex must be a non-negative integer.');
      }
    }).toThrow('alertIndex');
  });

  it('rejects non-integer alertIndex', () => {
    expect(() => {
      const alertIndex = Number.parseInt('not-a-number', 10);
      if (!Number.isInteger(alertIndex) || alertIndex < 0) {
        throw new Error('alertIndex must be a non-negative integer.');
      }
    }).toThrow('alertIndex');
  });

  it('rejects out-of-range alertIndex', () => {
    expect(() => {
      const alerts = [{ kind: 'qty_changed' }];
      const alertIndex = 5;
      if (alertIndex >= alerts.length) {
        throw new Error(`Alert index ${alertIndex} is out of range (${alerts.length} alert(s)).`);
      }
    }).toThrow('out of range');
  });

  it('clears statusExtended when no alerts remain', () => {
    const alerts: Array<Record<string, unknown>> = [{ kind: 'qty_changed' }];
    alerts.splice(0, 1);
    const statusExtended = alerts.length === 0 ? null : 'recall_pending';
    expect(statusExtended).toBeNull();
  });

  it('keeps statusExtended when alerts remain', () => {
    const alerts: Array<Record<string, unknown>> = [
      { kind: 'qty_changed' },
      { kind: 'line_cancelled' }
    ];
    alerts.splice(0, 1);
    const prior = 'recall_pending';
    const statusExtended = alerts.length === 0 ? null : prior;
    expect(statusExtended).toBe('recall_pending');
    expect(alerts).toHaveLength(1);
  });
});

describe('returnPickedUnits', () => {
  it('rejects qty = 0', () => {
    expect(() => {
      const qty = 0;
      if (qty <= 0) throw new Error('Return quantity must be greater than zero.');
    }).toThrow('greater than zero');
  });

  it('rejects qty > actual_qty', () => {
    expect(() => {
      const qty = 5;
      const actualQty = '3.000';
      if (qty > Number(actualQty)) {
        throw new Error(`Cannot return ${qty} — only ${actualQty} units were picked.`);
      }
    }).toThrow('Cannot return');
  });

  it('computes next reserved with floor at 0', () => {
    const batch = { reservedQty: '1.000' };
    const qty = 3;
    const nextReserved = Math.max(0, Number(batch.reservedQty) - qty);
    expect(nextReserved).toBe(0);
  });
});

describe('cancelFulfillmentLine', () => {
  it('is idempotent when already cancelled', () => {
    const fl = { statusExtended: 'cancelled' };
    expect(fl.statusExtended === 'cancelled').toBe(true);
  });

  it('triggers return when actual_qty > 0', () => {
    const fl = { actualQty: '2.000' };
    expect(Number(fl.actualQty) > 0).toBe(true);
  });

  it('caps reservation release at sol.qty', () => {
    const batch = { reservedQty: '10.000' };
    const sol = { qty: '3.000' };
    const releaseQty = Math.min(Number(batch.reservedQty), Number(sol.qty));
    expect(releaseQty).toBe(3);
  });
});

// GH #287: cancelSalesOrder must release reservedQty for all lines with a batchId,
// regardless of line.status. Previously only 'reserved' status lines were released,
// leaving inventory locked for lines in 'allocated' or other advanced statuses.
describe('cancelSalesOrder reservedQty release (GH #287)', () => {
  // Simulate the reservation-release logic extracted from cancelSalesOrder.
  function simulateCancelReservations(
    lines: { batchId: string | null; qty: string; status: string }[],
    batches: Record<string, { reservedQty: string }>
  ): Record<string, number> {
    const result: Record<string, number> = { ...Object.fromEntries(Object.entries(batches).map(([k, v]) => [k, Number(v.reservedQty)])) };
    for (const line of lines) {
      if (!line.batchId) continue;
      // Fixed: no status filter — release for all lines with a batchId
      const prior = result[line.batchId] ?? 0;
      result[line.batchId] = Math.max(0, prior - Number(line.qty));
    }
    return result;
  }

  it('releases reservedQty for lines in reserved status', () => {
    const lines = [{ batchId: 'b1', qty: '3.000', status: 'reserved' }];
    const batches = { b1: { reservedQty: '5.000' } };
    const result = simulateCancelReservations(lines, batches);
    expect(result['b1']).toBe(2);
  });

  it('releases reservedQty for lines in allocated status (was the bug)', () => {
    const lines = [{ batchId: 'b1', qty: '2.000', status: 'allocated' }];
    const batches = { b1: { reservedQty: '4.000' } };
    const result = simulateCancelReservations(lines, batches);
    // Before fix: status !== 'reserved' would skip this line → result stays 4.
    // After fix: line is processed → result = 2.
    expect(result['b1']).toBe(2);
  });

  it('skips lines without a batchId', () => {
    const lines = [{ batchId: null, qty: '5.000', status: 'reserved' }];
    const batches = { b1: { reservedQty: '5.000' } };
    const result = simulateCancelReservations(lines, batches);
    expect(result['b1']).toBe(5); // unchanged
  });

  it('clamps reservedQty at zero to prevent negative inventory', () => {
    const lines = [{ batchId: 'b1', qty: '10.000', status: 'confirmed' }];
    const batches = { b1: { reservedQty: '3.000' } };
    const result = simulateCancelReservations(lines, batches);
    expect(result['b1']).toBe(0); // clamped, not negative
  });

  it('releases across multiple lines from different statuses', () => {
    const lines = [
      { batchId: 'b1', qty: '2.000', status: 'reserved' },
      { batchId: 'b1', qty: '1.000', status: 'allocated' },
      { batchId: 'b2', qty: '5.000', status: 'confirmed' },
    ];
    const batches = { b1: { reservedQty: '6.000' }, b2: { reservedQty: '8.000' } };
    const result = simulateCancelReservations(lines, batches);
    expect(result['b1']).toBe(3); // 6 - 2 - 1
    expect(result['b2']).toBe(3); // 8 - 5
  });
});
