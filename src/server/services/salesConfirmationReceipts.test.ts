import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

vi.mock('./documentSnapshots', () => ({
  createDraftSnapshot: vi.fn(async () => ({ id: 'snap-id', contentHash: 'hash' })),
  finalizeSnapshot: vi.fn(async () => ({ id: 'snap-id', status: 'finalized' as const, contentHash: 'hash' }))
}));

import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { createSalesConfirmationReceipts } from './salesConfirmationReceipts';
import { salesConfirmation } from './projections/salesConfirmation';

const SO_ID = '11111111-1111-1111-1111-111111111111';
const CMD_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

interface MockPool { query: ReturnType<typeof vi.fn>; }

function makePool(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockPool {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({ rows: r.rows, rowCount: r.rowCount ?? r.rows.length } as unknown as QueryResult);
  }
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn };
}

function baseSoRow() {
  return {
    id: SO_ID, order_no: 'SO-2001', customer_id: 'c-1',
    customer_name: 'Acme Buyers', total: '300.00', notes: 'deliver to dock 3'
  };
}

function baseLineRows() {
  return [
    { id: 'sl-1', item_name: 'Sunset OG', display_name: 'Sunset OG (Tier A)',
      qty: '2', unit_price: '100.00', unit_cost: '50.00', unit_cost_resolved: true,
      source_row_key: 'sheet:row-17', unresolved_source_text: null, legacy_status_marker: null },
    { id: 'sl-2', item_name: 'Blue Dream', display_name: null,
      qty: '1', unit_price: '100.00', unit_cost: '30.00', unit_cost_resolved: false,
      source_row_key: null, unresolved_source_text: 'q1-blue-dream-leftover', legacy_status_marker: 'sheet:Q1' }
  ];
}

beforeEach(() => {
  vi.mocked(createDraftSnapshot).mockClear();
  vi.mocked(finalizeSnapshot).mockClear();
});

describe('createSalesConfirmationReceipts', () => {
  it('queries SO+customer JOIN, lines, and live snapshots per audience (4 SQL calls in fresh case)', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [] }, { rows: [] }
    ]);
    await createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);
    expect(pool.query).toHaveBeenCalledTimes(4);
    const firstSql = String(pool.query.mock.calls[0][0]);
    expect(firstSql).not.toMatch(/select\s+\*/i);
    expect(firstSql).toMatch(/so\.order_no/);
    expect(firstSql).toMatch(/c\.name/);
    const linesSql = String(pool.query.mock.calls[1][0]);
    expect(linesSql).not.toMatch(/select\s+\*/i);
    expect(linesSql).toMatch(/item_name/);
    expect(linesSql).toMatch(/display_name/);
    expect(linesSql).toMatch(/unit_price/);
    expect(linesSql).toMatch(/unit_cost/);
    expect(linesSql).toMatch(/source_row_key/);
    expect(linesSql).toMatch(/unresolved_source_text/);
    expect(linesSql).toMatch(/legacy_status_marker/);
    expect(linesSql).toMatch(/unit_cost_resolved/);
  });

  it('builds external projection (kind=sales_confirmation, sourceEntityType=sales_order, audience=external)', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [] }, { rows: [] }
    ]);
    await createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);
    const firstCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(firstCall.kind).toBe('sales_confirmation');
    expect(firstCall.sourceEntityType).toBe('sales_order');
    expect(firstCall.sourceEntityId).toBe(SO_ID);
    expect(firstCall.audience).toBe('external');
    expect(firstCall.commandId).toBe(CMD_ID);
    expect(firstCall.createdBy).toBe(USER_ID);
    expect(firstCall.projectionVersion).toBe(salesConfirmation.projectionVersion);
    expect(firstCall.supersedesId).toBeUndefined();
    expect(vi.mocked(finalizeSnapshot).mock.calls[0][1]).toEqual({ id: 'snap-id', finalizedBy: USER_ID });
  });

  it('LEAK GUARD — external payload has none of internalMargin/unitCost/unitCostResolved/sourceRowKey/legacyMarker/candidateSourceText', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [] }, { rows: [] }
    ]);
    await createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);
    const externalCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(externalCall.audience).toBe('external');
    const payload = externalCall.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('internalNotes');
    expect(payload).not.toHaveProperty('cogs');
    expect(payload).not.toHaveProperty('margin');
    expect(payload).not.toHaveProperty('diagnostics');
    const serialized = JSON.stringify(payload);
    for (const forbidden of ['internalMargin','unitCost','unitCostResolved','sourceRowKey','legacyMarker','candidateSourceText']) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it('internal projection has cogs, margin, and diagnostics', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [] }, { rows: [] }
    ]);
    await createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);
    expect(vi.mocked(createDraftSnapshot)).toHaveBeenCalledTimes(2);
    const secondCreate = vi.mocked(createDraftSnapshot).mock.calls[1][1];
    expect(secondCreate.audience).toBe('internal');
    expect(secondCreate.kind).toBe('sales_confirmation');
    expect(secondCreate.sourceEntityType).toBe('sales_order');
    const payload = secondCreate.payload as {
      cogs?: { perLine: Array<{ name: string; unitCost?: number }>; total: number };
      margin?: { perLine: Array<{ name: string; marginAbs: number }>; total: number };
      diagnostics?: { unresolvedSources?: string[]; legacyMarkers?: string[] };
    };
    expect(payload.cogs?.total).toBe(130);
    expect(payload.cogs?.perLine.map((c) => c.unitCost)).toEqual([50, 30]);
    expect(payload.margin?.total).toBe(170);
    expect(payload.margin?.perLine.map((m) => m.marginAbs)).toEqual([100, 70]);
    expect(payload.diagnostics?.unresolvedSources ?? []).toEqual(expect.arrayContaining(['q1-blue-dream-leftover']));
    expect(payload.diagnostics?.legacyMarkers).toEqual(['sheet:Q1']);
  });

  it('amends via supersedesId when a prior live head exists per audience', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() },
      { rows: [{ id: 'prior-external-id' }] }, { rows: [{ id: 'prior-internal-id' }] }
    ]);
    await createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);
    expect(vi.mocked(createDraftSnapshot).mock.calls[0][1].supersedesId).toBe('prior-external-id');
    expect(vi.mocked(createDraftSnapshot).mock.calls[1][1].supersedesId).toBe('prior-internal-id');
  });

  it('best-effort: missing SO row → warn + return, no snapshot created', async () => {
    const pool = makePool([]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: thrown snapshot error is caught and logged, not propagated', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [] }, { rows: [] }
    ]);
    vi.mocked(createDraftSnapshot).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createSalesConfirmationReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
