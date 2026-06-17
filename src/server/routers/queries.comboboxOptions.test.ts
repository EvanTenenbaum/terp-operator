import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { queriesRouter } from './queries';
import { pool } from '../db';
import type { SessionUser } from '../../shared/types';

/**
 * P0-2 / T-B-02 — comboboxOptions query.
 *
 * Entity-aware autocomplete endpoint used by ComboboxCellEditor, FilterToolbar,
 * VendorSearch, and CustomerSearch. One endpoint for 11 entity types with
 * per-entity search columns, status narrowing, and role gating.
 */

function makeUser(role: SessionUser['role'] = 'operator'): SessionUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test',
    email: 't@x',
    role,
    workLoop: null,
  };
}

function makeCaller(role: SessionUser['role'] = 'operator') {
  return queriesRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    io: {} as SocketServer,
    user: makeUser(role),
  });
}

function mockPool(rows: Record<string, unknown>[] = []) {
  return vi.spyOn(pool, 'query').mockImplementation(async () => ({ rows }) as never);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('comboboxOptions', () => {
  // AC-4: Per-entity min role — viewer gets FORBIDDEN.
  it('rejects a viewer requesting vendorBill options with FORBIDDEN', async () => {
    const viewerCaller = makeCaller('viewer');
    await expect(
      viewerCaller.comboboxOptions({ entityType: 'vendorBill', search: '' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // AC-4: viewer on any entity should be FORBIDDEN (all entities require operator+).
  it('rejects a viewer requesting customer options with FORBIDDEN', async () => {
    const viewerCaller = makeCaller('viewer');
    await expect(
      viewerCaller.comboboxOptions({ entityType: 'customer', search: '' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // AC-5: Bad status string is rejected with BAD_REQUEST before any SQL runs.
  it('rejects an inline batch status that is not in BatchStatus', async () => {
    const spy = mockPool([]);
    await expect(
      makeCaller().comboboxOptions({
        entityType: 'batch',
        search: '',
        filters: { status: 'archived' }, // not in BatchStatus enum
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(spy).not.toHaveBeenCalled();
  });

  // AC-5: Valid status should be accepted and passed through.
  it('accepts a valid batch status filter', async () => {
    const spy = mockPool([{
      id: '11111111-1111-1111-1111-111111111111',
      label: 'Batch-001',
      sublabel: 'B001 · Vendor Co',
      status: 'posted',
      availableQty: 50,
      balance: null,
    }]);
    const result = await makeCaller().comboboxOptions({
      entityType: 'batch',
      search: 'Batch',
      filters: { status: 'posted' },
    });
    // Verify the SQL includes the status filter parameter
    const sql = spy.mock.calls[0][0] as string;
    expect(sql.toLowerCase()).toContain('b.status = $');
    expect(result.truncated).toBe(false);
  });

  // AC-6: Each call executes exactly one SQL statement.
  it('executes exactly one SQL statement per call', async () => {
    const spy = mockPool([{
      id: '11111111-1111-1111-1111-111111111111',
      label: 'PO-001',
      sublabel: 'Vendor Co · draft',
      status: 'draft',
      availableQty: null,
      balance: null,
    }]);
    await makeCaller().comboboxOptions({ entityType: 'purchaseOrder', search: 'PO' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // AC-7: truncated is true when more rows exist than limit.
  it('reports truncated=true when more rows exist than limit', async () => {
    // Return limit+1 rows (i.e., 11 when limit defaults to 20 — so use limit=3).
    const fillerRows = Array.from({ length: 4 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      label: `Cust ${i}`,
      sublabel: null,
      status: null,
      availableQty: null,
      balance: 0,
    }));
    mockPool(fillerRows);

    const result = await makeCaller().comboboxOptions({
      entityType: 'customer',
      search: 'Cust',
      limit: 3,
    });
    expect(result.options).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  // AC-7: truncated is false when rows <= limit.
  it('reports truncated=false when results fit within limit', async () => {
    const rows = [
      { id: 'a', label: 'Acme', sublabel: null, status: null, availableQty: null, balance: 1000 },
      { id: 'b', label: 'Beta', sublabel: null, status: null, availableQty: null, balance: 500 },
    ];
    mockPool(rows);
    const result = await makeCaller().comboboxOptions({
      entityType: 'customer',
      search: '',
      limit: 10,
    });
    expect(result.options).toHaveLength(2);
    expect(result.truncated).toBe(false);
  });

  // AC-3: All 11 entity types are accepted (none trigger BAD_REQUEST for unknown).
  it('accepts all 11 supported entity types', async () => {
    const types = [
      'customer', 'vendor', 'staff', 'item', 'batch', 'tag',
      'transactionType', 'purchaseOrder', 'salesOrder', 'invoice', 'vendorBill',
    ] as const;
    for (const entityType of types) {
      mockPool([]);
      const result = await makeCaller().comboboxOptions({ entityType, search: '' });
      expect(result.entityType).toBe(entityType);
      expect(result.truncated).toBe(false);
    }
  });

  // Empty search returns first N rows with no ILIKE clause.
  it('returns the first limit rows when search is empty', async () => {
    const rows = [
      { id: 'a', label: 'Zeta', sublabel: null, status: null, availableQty: null, balance: 0 },
      { id: 'b', label: 'Alpha', sublabel: null, status: null, availableQty: null, balance: 0 },
    ];
    const spy = mockPool(rows);
    const result = await makeCaller().comboboxOptions({
      entityType: 'vendor',
      search: '',
      limit: 2,
    });
    expect(result.options).toHaveLength(2);
    // SQL should not contain an ILIKE clause for empty search.
    const sql = spy.mock.calls[0][0] as string;
    expect(sql.toLowerCase()).not.toContain('ilike');
  });

  // Anchored-priority ordering: anchored hits first.
  it('orders anchored-prefix matches before substring matches', async () => {
    const spy = mockPool([]);
    await makeCaller().comboboxOptions({ entityType: 'customer', search: 'acme' });
    const sql = spy.mock.calls[0][0] as string;
    expect(sql.toLowerCase()).toContain('case when');
    expect(sql.toLowerCase()).toContain('then 0 else 1 end');
  });

  // Customer balance is included.
  it('includes balance for customer entities', async () => {
    mockPool([{ id: 'a', label: 'Acme', sublabel: null, status: null, availableQty: null, balance: 1500 }]);
    const result = await makeCaller().comboboxOptions({ entityType: 'customer', search: 'Acme' });
    expect(result.options[0].balance).toBe(1500);
  });

  // Batch availableQty is included.
  it('includes availableQty for batch entities', async () => {
    mockPool([{ id: 'a', label: 'Batch-X', sublabel: 'BX001 · Vendor', status: 'posted', availableQty: 42, balance: null }]);
    const result = await makeCaller().comboboxOptions({ entityType: 'batch', search: 'X' });
    expect(result.options[0].availableQty).toBe(42);
  });

  // noResultsHint is present when empty.
  it('returns a noResultsHint when no options match', async () => {
    mockPool([]);
    const result = await makeCaller().comboboxOptions({ entityType: 'item', search: 'zzz_nonexistent' });
    expect(result.options).toHaveLength(0);
    expect(result.noResultsHint).toBeTruthy();
    expect(result.noResultsHint).toContain('zzz_nonexistent');
  });

  // Tags filter for customer.
  it('applies tags filter for customer entities', async () => {
    const spy = mockPool([]);
    await makeCaller().comboboxOptions({
      entityType: 'customer',
      search: '',
      filters: { tags: ['vip'] },
    });
    const sql = spy.mock.calls[0][0] as string;
    expect(sql.toLowerCase()).toContain('tags &&');
  });

  // Filter not allowed for entity → BAD_REQUEST.
  it('rejects disallowed filter for the entity with BAD_REQUEST', async () => {
    mockPool([]);
    // 'direction' filter is only allowed for transactionType, not for customer.
    await expect(
      makeCaller().comboboxOptions({
        entityType: 'customer',
        search: '',
        filters: { direction: 'receiving' as const },
      } as any)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // entityType returned matches input.
  it('returns entityType matching input', async () => {
    mockPool([{ id: 'a', label: 'PO-001', sublabel: 'V · draft', status: 'draft', availableQty: null, balance: null }]);
    const result = await makeCaller().comboboxOptions({ entityType: 'purchaseOrder', search: 'PO' });
    expect(result.entityType).toBe('purchaseOrder');
  });

  // Sublabel is returned when non-null.
  it('returns sublabel for entities that have it', async () => {
    mockPool([{ id: 'a', label: 'PO-001', sublabel: 'Vendor Co · draft', status: 'draft', availableQty: null, balance: null }]);
    const result = await makeCaller().comboboxOptions({ entityType: 'purchaseOrder', search: 'PO' });
    expect(result.options[0].sublabel).toBe('Vendor Co · draft');
  });
});
