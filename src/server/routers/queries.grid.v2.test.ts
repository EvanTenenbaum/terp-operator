// @vitest-environment node
/**
 * queries.grid v2 — filter/sort/group/paginate test suite.
 *
 * Tests the full procedure (input validation, allowlist enforcement,
 * SQL generation, backwards compat) using mocked pool.query so no
 * real database is required.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { buildGridV2Query, queriesRouter } from './queries';
import { pool } from '../db';
import type { SessionUser, Role } from '../../shared/types';

function makeUser(role: Role = 'operator'): SessionUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test',
    email: 't@x',
    role,
    workLoop: null
  };
}

function makeCaller(role: Role = 'operator') {
  return queriesRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    io: {} as SocketServer,
    user: makeUser(role)
  });
}

const ALL_GRID_VIEWS = [
  'reports',
  'intake',
  'purchaseOrders',
  'sales',
  'matchmaking',
  'orders',
  'payments',
  'inventory',
  'clients',
  'vendors',
  'fulfillment',
  'connectors',
  'recovery',
  'closeout',
  'referees',
  'processors',
  'photography',
  'purchaseReceipts',
  'items',
  'disputes',
] as const;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── §8.1 — Backwards compat: legacy `{ view }` input ──

describe('grid v2 — backwards compat (§8.1)', () => {
  it('accepts the deprecated `view` alias with no new fields', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [
        { id: 'a', status: 'draft', __totalRows: 2 },
        { id: 'b', status: 'approved', __totalRows: 2 },
      ],
    } as any);

    const result = await makeCaller().grid({ view: 'purchaseOrders' });

    expect(spy).toHaveBeenCalledTimes(1);
    // Verify result is array-shaped (backwards compat) with metadata properties
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result.entityType).toBe('purchaseOrders');
    expect(result.totalRows).toBe(2);
  });

  it('accepts the new `entityType` field', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: 'x', __totalRows: 1 }],
    } as any);

    const result = await makeCaller().grid({ entityType: 'purchaseOrders' });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });

  it.each([
    ['payments', 'from payments'],
    ['inventory', 'from batches'],
    ['clients', 'from customers'],
    ['vendors', 'from vendor_bills'],
    ['orders', 'from sales_orders'],
    ['closeout', 'from archive_runs'],
    ['recovery', 'from command_journal'],
  ] as const)('keeps view alias `%s` on the grid query path', async (view, expectedSql) => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: `${view}-row`, __totalRows: 1 }],
    } as any);

    const result = await makeCaller().grid({ view });

    expect(result.entityType).toBe(view);
    expect(result.length).toBe(1);
    expect(String(spy.mock.calls[0][0]).toLowerCase()).toContain(expectedSql);
  });

  it.each(ALL_GRID_VIEWS)('builds grid SQL for registered view `%s`', async (view) => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: `${view}-row`, __totalRows: 1 }],
    } as any);

    const result = await makeCaller().grid({ view });

    expect(result.entityType).toBe(view);
    expect(result.length).toBe(1);
  });

  it.each(ALL_GRID_VIEWS)('uses subquery-visible default ordering for `%s`', (view) => {
    const { sql } = buildGridV2Query(view, undefined, undefined, undefined, null, 0);
    const outerOrderBy = sql.match(/\) sub\s*(?:where [\s\S]*?)?\s*order by ([\s\S]*?)(?:\nlimit|\noffset|$)/i)?.[1] ?? '';

    expect(outerOrderBy).not.toMatch(/\b[a-z][a-z0-9_]*\./i);
    expect(outerOrderBy).not.toMatch(/\b(?:created_at|updated_at|media_updated_at|has_primary_photo)\b/i);
  });

  it('selects photography summary fields from the joined summary table before ordering by aliases', () => {
    const { sql } = buildGridV2Query('photography', undefined, undefined, undefined, null, 0);

    expect(sql).toContain('bms.media_updated_at as "mediaUpdatedAt"');
    expect(sql).toContain('bms.has_primary_photo as "hasPrimaryPhoto"');
    expect(sql).toContain('case when "hasPrimaryPhoto" then 1 else 0 end asc');
  });

  it('keeps direct purchase-order autocomplete ordering on the source table column', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: 'po-1', label: 'PO-1' }],
    } as any);

    await makeCaller().comboboxOptions({ entityType: 'purchaseOrder', search: '', limit: 5, filters: {} });

    const sql = String(spy.mock.calls[0][0]);
    expect(sql).toContain('order by po.created_at desc');
    expect(sql).not.toContain('order by "createdAt" desc');
  });

  it('accepts observed payment and photography states in status counts', async () => {
    const spy = vi.spyOn(pool, 'query')
      .mockResolvedValueOnce({ rows: [{ status: 'draft', cnt: 3 }, { status: 'ready', cnt: 3 }, { status: 'posted', cnt: 502 }] } as any)
      .mockResolvedValueOnce({ rows: [{ status: 'open', cnt: 1 }, { status: 'in_progress', cnt: 2 }, { status: 'done', cnt: 3 }] } as any);

    const paymentCounts = await makeCaller().statusCounts({ entityType: 'payment' });
    const photographyCounts = await makeCaller().statusCounts({ entityType: 'photographyQueue' });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(paymentCounts.statuses.map((row) => row.status)).toEqual(['draft', 'ready', 'posted', 'refunded', 'reversed']);
    expect(paymentCounts.statuses.find((row) => row.status === 'ready')?.count).toBe(3);
    expect(photographyCounts.statuses.map((row) => row.status)).toEqual(['open', 'in_progress', 'done']);
  });

  it('builds legacy row helper queries without ambiguous or missing source columns', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

    await makeCaller().matchmakingBoard();
    await makeCaller().intakeQueue();
    await makeCaller().contactLedger({ contactId: '00000000-0000-0000-0000-000000000002', limit: 10 });

    const sqlStatements = spy.mock.calls.map((call) => String(call[0]));
    expect(sqlStatements.some((sql) => sql.includes(') sub\norder by case status'))).toBe(true);
    expect(sqlStatements.some((sql) => sql.includes('order by case po.status'))).toBe(true);
    expect(sqlStatements.some((sql) => sql.includes('SELECT id, contact_id, kind'))).toBe(true);
  });

  it('rejects when neither entityType nor view is provided', async () => {
    await expect(
      makeCaller().grid({} as any)
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ── §8.2 — Status filter ──

describe('grid v2 — status filter (§8.2)', () => {
  it('compiles filters.status into the SQL WHERE clause', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [
        { id: 'a', status: 'approved', __totalRows: 1 },
      ],
    } as any);

    const result = await makeCaller().grid({
      entityType: 'purchaseOrders',
      filters: { status: 'approved' },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const sql: string = spy.mock.calls[0][0] as string;
    expect(sql.toLowerCase()).toContain('status = $');
    const params = spy.mock.calls[0][1] as unknown[];
    expect(params).toContain('approved');
    expect(result.totalRows).toBe(1);
  });

  it('rejects a bogus status value not in the canonical enum', async () => {
    await expect(
      makeCaller().grid({
        entityType: 'purchaseOrders',
        filters: { status: 'shipped' }, // not a valid PurchaseOrderStatus
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ── §8.3 — Pagination requires sort ──

describe('grid v2 — pagination validation (§8.3)', () => {
  it('rejects offset > 0 without sort', async () => {
    await expect(
      makeCaller().grid({
        entityType: 'purchaseOrders',
        offset: 50,
        limit: 25,
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('accepts offset 0 without sort', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: 'a', __totalRows: 1 }],
    } as any);

    const result = await makeCaller().grid({
      entityType: 'purchaseOrders',
      offset: 0,
      limit: 25,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('accepts offset > 0 with sort', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: 'a', __totalRows: 1 }],
    } as any);

    const result = await makeCaller().grid({
      entityType: 'purchaseOrders',
      sort: { field: 'createdAt', direction: 'desc' },
      offset: 50,
      limit: 25,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── §8.4 — Bad sort field rejected ──

describe('grid v2 — sort allowlist (§8.4)', () => {
  it('rejects sort.field not in entity allowlist', async () => {
    await expect(
      makeCaller().grid({
        entityType: 'purchaseOrders',
        sort: { field: 'leaked_column', direction: 'asc' },
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('accepts valid sort.field from allowlist', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: 'a', __totalRows: 1 }],
    } as any);

    const result = await makeCaller().grid({
      entityType: 'purchaseOrders',
      sort: { field: 'createdAt', direction: 'asc' },
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── §8.4b — Bad groupBy field rejected ──

describe('grid v2 — groupBy allowlist', () => {
  it('rejects groupBy field not in entity allowlist', async () => {
    await expect(
      makeCaller().grid({
        entityType: 'purchaseOrders',
        groupBy: 'leaked_column',
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('accepts valid groupBy field from allowlist', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: 'a', status: 'draft', __totalRows: 1 }],
    } as any);

    const result = await makeCaller().grid({
      entityType: 'purchaseOrders',
      groupBy: 'status',
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── §8.5 — Single-query (N+1 guard) ──

describe('grid v2 — N+1 guard (§8.5)', () => {
  it('executes exactly one SQL statement per call', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: 'a', status: 'confirmed', __totalRows: 1 }],
    } as any);

    await makeCaller().grid({
      entityType: 'sales',
      filters: { status: 'confirmed' },
      sort: { field: 'createdAt', direction: 'desc' },
      limit: 50,
      offset: 0,
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('executes exactly one SQL statement even with groupBy', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [
        { id: 'a', status: 'draft', __totalRows: 3 },
        { id: 'b', status: 'approved', __totalRows: 3 },
        { id: 'c', status: 'approved', __totalRows: 3 },
      ],
    } as any);

    await makeCaller().grid({
      entityType: 'purchaseOrders',
      groupBy: 'status',
      sort: { field: 'createdAt', direction: 'desc' },
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── §8.7 — Role projection preserved ──

describe('grid v2 — role projection (§8.7)', () => {
  it('blanks internalMargin for operator on sales view (v1 parity)', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [
        { id: 'a', orderNo: 'SO-1', internalMargin: 500, marginWaivedTotal: 100, __totalRows: 1 },
      ],
    } as any);

    const result = await makeCaller('operator').grid({ entityType: 'sales' });
    expect(result[0].internalMargin).toBeNull();
    expect(result[0].marginWaivedTotal).toBeNull();
  });

  it('blanks unitCost for operator on inventory view (v1 parity)', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [
        { id: 'a', name: 'Flower', unitCost: 500, __totalRows: 1 },
      ],
    } as any);

    const result = await makeCaller('operator').grid({ entityType: 'inventory' });
    expect(result[0].unitCost).toBeNull();
  });

  it('does not blank sensitive fields for manager', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [
        { id: 'a', orderNo: 'SO-1', internalMargin: 500, marginWaivedTotal: 100, __totalRows: 1 },
      ],
    } as any);

    const result = await makeCaller('manager').grid({ entityType: 'sales' });
    expect(result[0].internalMargin).toBe(500);
    expect(result[0].marginWaivedTotal).toBe(100);
  });
});

// ── §8.8 — eq allowlist ──

describe('grid v2 — eq allowlist', () => {
  it('rejects eq key not in entity allowlist', async () => {
    await expect(
      makeCaller().grid({
        entityType: 'purchaseOrders',
        filters: { eq: { nonExistentField: 'value' } },
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('accepts eq key in entity allowlist', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: 'a', status: 'draft', __totalRows: 1 }],
    } as any);

    await makeCaller().grid({
      entityType: 'purchaseOrders',
      filters: { eq: { vendorId: 'v1' } },
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── §8.9 — dateRange allowlist ──

describe('grid v2 — dateRange allowlist', () => {
  it('rejects dateRange field not in entity allowlist', async () => {
    await expect(
      makeCaller().grid({
        entityType: 'purchaseOrders',
        filters: { dateRange: { field: 'bogusDateField', from: '2026-01-01T00:00:00Z' } },
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('accepts dateRange field in entity allowlist', async () => {
    const spy = vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [{ id: 'a', __totalRows: 1 }],
    } as any);

    await makeCaller().grid({
      entityType: 'purchaseOrders',
      filters: { dateRange: { field: 'createdAt', from: '2026-01-01T00:00:00Z' } },
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── §8.10 — totalRows extracted correctly ──

describe('grid v2 — totalRows metadata', () => {
  it('totalRows equals row count when no filter applied', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [
        { id: 'a', __totalRows: 3 },
        { id: 'b', __totalRows: 3 },
        { id: 'c', __totalRows: 3 },
      ],
    } as any);

    const result = await makeCaller().grid({ entityType: 'purchaseOrders' });
    expect(result.totalRows).toBe(3);
    expect(result.length).toBe(3);
  });

  it('totalRows still correct when rows array is shorter than total', async () => {
    // Simulates pagination: 2 rows returned but totalRows=100
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [
        { id: 'a', __totalRows: 100 },
        { id: 'b', __totalRows: 100 },
      ],
    } as any);

    const result = await makeCaller().grid({
      entityType: 'purchaseOrders',
      limit: 2,
      offset: 0,
      sort: { field: 'createdAt', direction: 'desc' },
    });
    expect(result.totalRows).toBe(100);
    expect(result.length).toBe(2);
  });

  it('totalRows is 0 when result set is empty', async () => {
    vi.spyOn(pool, 'query').mockResolvedValue({
      rows: [],
    } as any);

    const result = await makeCaller().grid({ entityType: 'purchaseOrders' });
    expect(result.totalRows).toBe(0);
    expect(result.length).toBe(0);
  });
});
