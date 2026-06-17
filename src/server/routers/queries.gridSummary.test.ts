import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { queriesRouter } from './queries';
import { pool } from '../db';
import type { SessionUser } from '../../shared/types';

/**
 * T-B-13 — gridSummary aggregate query.
 *
 * Accepts { entityType, filters? } and returns aggregate counts, optional
 * currency total, status breakdowns, and metric labels for the grid v2
 * summary toolbar. One endpoint for 9 entity types.
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

/**
 * Mocks pool.query to return distinct responses for the two calls
 * gridSummary makes: the aggregate SELECT (call 1) and the status
 * breakdown SELECT (call 2).
 */
function mockGridResponses(
  aggRow: Record<string, unknown> = {},
  statusRows: Array<Record<string, unknown>> = [],
) {
  let callCount = 0;
  return vi.spyOn(pool, 'query').mockImplementation(async (_sql: string, _params: unknown[]) => {
    callCount++;
    if (callCount === 1) {
      return { rows: [aggRow] } as any;
    }
    return { rows: statusRows } as any;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('queries.gridSummary', () => {
  // ── Basic shape ──

  it('returns summary for purchaseOrder', async () => {
    mockGridResponses(
      { cnt: 12, currency_total: 54321.00 },
      [
        { status: 'draft', count: 5 },
        { status: 'confirmed', count: 7 },
      ],
    );

    const result = await makeCaller().gridSummary({ entityType: 'purchaseOrder' });

    expect(result.entityType).toBe('purchaseOrder');
    expect(result.count).toBe(12);
    expect(result.currencyTotal).toBe(54321.00);
    expect(result.summary.totalRows).toBe(12);
    expect(result.summary.currencyTotal).toBe(54321.00);
    expect(result.summary.statusCounts).toHaveLength(2);
    expect(result.summary.statusCounts[0]).toEqual({ status: 'draft', count: 5 });
    expect(result.summary.statusCounts[1]).toEqual({ status: 'confirmed', count: 7 });
  });

  // ── Currency total ──

  it('returns currency total for all money entities', async () => {
    const moneyEntities = [
      'purchaseOrder', 'salesOrder', 'payment', 'invoice', 'vendorBill', 'vendorPayment',
    ];

    for (const entityType of moneyEntities) {
      vi.restoreAllMocks(); // reset call count per entity
      mockGridResponses(
        { cnt: 3, currency_total: 999.99 },
        [{ status: 'posted', count: 3 }],
      );

      const result = await makeCaller().gridSummary({ entityType });
      expect(result.currencyTotal).toBe(999.99);
      expect(result.summary.currencyTotal).toBe(999.99);
    }
  });

  it('omits currencyTotal for entities without a money column', async () => {
    mockGridResponses(
      { cnt: 1 },
      [{ status: 'pending', count: 1 }],
    );

    const result = await makeCaller().gridSummary({ entityType: 'purchaseReceipt' });
    expect(result.currencyTotal).toBeUndefined();
    expect(result.summary.currencyTotal).toBeUndefined();
  });

  // ── Metric labels (batch qty) ──

  it('returns metric labels for batch with Available Qty', async () => {
    mockGridResponses(
      { cnt: 5, qty_sum: 1500.500 },
      [{ status: 'posted', count: 5 }],
    );

    const result = await makeCaller().gridSummary({ entityType: 'batch' });

    expect(result.summary.metricLabels).toHaveLength(1);
    expect(result.summary.metricLabels[0].label).toBe('Available Qty');
    expect(result.summary.metricLabels[0].value).toBe('1500.500');
  });

  it('returns no metric labels for non-batch entities', async () => {
    mockGridResponses(
      { cnt: 8, currency_total: 4000 },
      [{ status: 'draft', count: 8 }],
    );

    const result = await makeCaller().gridSummary({ entityType: 'purchaseOrder' });
    expect(result.summary.metricLabels).toHaveLength(0);
  });

  // ── Empty filters ──

  it('handles empty filters', async () => {
    mockGridResponses(
      { cnt: 0, currency_total: 0 },
      [],
    );

    const result = await makeCaller().gridSummary({
      entityType: 'purchaseOrder',
      filters: {},
    });

    expect(result.entityType).toBe('purchaseOrder');
    expect(result.count).toBe(0);
  });

  // ── All 9 entity types ──

  it('supports all 9 entity types', async () => {
    const entities = [
      'purchaseOrder', 'salesOrder', 'batch', 'payment', 'invoice',
      'purchaseReceipt', 'vendorBill', 'vendorPayment', 'fulfillmentLine',
    ] as const;

    for (const entityType of entities) {
      vi.restoreAllMocks();
      mockGridResponses(
        { cnt: 1, currency_total: entityType === 'batch' || entityType === 'purchaseReceipt' || entityType === 'fulfillmentLine' ? undefined : 100 },
        [{ status: 'open', count: 1 }],
      );

      const result = await makeCaller().gridSummary({ entityType });
      expect(result.entityType).toBe(entityType);
      expect(typeof result.count).toBe('number');
    }
  });

  // ── Status filter ──

  it('injects a status filter into the SQL', async () => {
    const spy = mockGridResponses(
      { cnt: 2, currency_total: 500 },
      [{ status: 'draft', count: 2 }],
    );

    await makeCaller().gridSummary({
      entityType: 'purchaseOrder',
      filters: { status: 'draft' },
    });

    // First call is the aggregate query
    const sql = spy.mock.calls[0][0] as string;
    expect(sql.toLowerCase()).toContain('status = $');
  });

  // ── Count invariance ──

  it('count equals summary.totalRows', async () => {
    mockGridResponses(
      { cnt: 7, currency_total: 2100 },
      [
        { status: 'submitted', count: 3 },
        { status: 'confirmed', count: 4 },
      ],
    );

    const result = await makeCaller().gridSummary({ entityType: 'purchaseOrder' });

    expect(result.count).toBe(7);
    expect(result.count).toBe(result.summary.totalRows);
    expect(result.count).toBeGreaterThanOrEqual(0);
  });

  // ── Unknown entity type ──

  it('rejects unknown entity type with BAD_REQUEST', async () => {
    mockGridResponses({}, []);

    await expect(
      makeCaller().gridSummary({ entityType: 'nonexistent' as any }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  // ── Viewer allowed (gridSummary uses protectedProcedure, no role assertion) ──

  it('allows viewer role (protectedProcedure only checks authentication)', async () => {
    mockGridResponses(
      { cnt: 1, currency_total: 100 },
      [{ status: 'draft', count: 1 }],
    );
    const viewerCaller = makeCaller('viewer');

    const result = await viewerCaller.gridSummary({ entityType: 'purchaseOrder' });
    expect(result.entityType).toBe('purchaseOrder');
    expect(result.count).toBe(1);
  });

  // ── Tags filter ──

  it('injects a tags filter into the SQL', async () => {
    const spy = mockGridResponses(
      { cnt: 3, currency_total: 900 },
      [{ status: 'draft', count: 3 }],
    );

    await makeCaller().gridSummary({
      entityType: 'purchaseOrder',
      filters: { tags: ['vip', 'rush'] },
    });

    const sql = spy.mock.calls[0][0] as string;
    expect(sql.toLowerCase()).toContain('tags &&');
  });

  // ── Date range filter ──

  it('injects a date range filter into the SQL', async () => {
    const spy = mockGridResponses(
      { cnt: 4, currency_total: 1200 },
      [{ status: 'confirmed', count: 4 }],
    );

    await makeCaller().gridSummary({
      entityType: 'purchaseOrder',
      filters: {
        dateRange: {
          field: 'created_at',
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-06-01T00:00:00.000Z',
        },
      },
    });

    const sql = spy.mock.calls[0][0] as string;
    expect(sql.toLowerCase()).toContain('created_at >=');
    expect(sql.toLowerCase()).toContain('created_at <=');
  });

  // ── Text filter ──

  it('injects a text (ILIKE) filter into the SQL', async () => {
    const spy = mockGridResponses(
      { cnt: 1, currency_total: 300 },
      [{ status: 'draft', count: 1 }],
    );

    await makeCaller().gridSummary({
      entityType: 'purchaseOrder',
      filters: { text: 'acme' },
    });

    const sql = spy.mock.calls[0][0] as string;
    expect(sql.toLowerCase()).toContain('ilike');
  });

  // ── Exactly two SQL calls ──

  it('executes exactly two SQL statements (aggregate + status breakdown)', async () => {
    const spy = mockGridResponses(
      { cnt: 10, currency_total: 5000 },
      [{ status: 'open', count: 10 }],
    );

    await makeCaller().gridSummary({ entityType: 'purchaseOrder' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // ── Empty result set (no data) ──

  it('returns zero count and empty arrays when no rows match', async () => {
    mockGridResponses(
      { cnt: 0 },
      [], // no status rows
    );

    const result = await makeCaller().gridSummary({ entityType: 'batch' });

    expect(result.count).toBe(0);
    expect(result.summary.totalRows).toBe(0);
    expect(result.summary.statusCounts).toHaveLength(0);
  });
});
