import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

vi.mock('./documentSnapshots', () => ({
  createDraftSnapshot: vi.fn(async () => ({ id: 'snap-id', contentHash: 'hash' })),
  finalizeSnapshot: vi.fn(async () => ({ id: 'snap-id', status: 'finalized' as const, contentHash: 'hash' }))
}));

import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { createInvoiceReceipts } from './invoiceReceipts';
import { invoice } from './projections/invoice';
import { logger } from './logger';

const SO_ID = '11111111-1111-1111-1111-111111111111';
const INV_ID = '44444444-4444-4444-4444-444444444444';
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
  return { id: SO_ID, order_no: 'SO-2001', customer_id: 'c-1', customer_name: 'Acme Buyers', total: '300.00', notes: 'net 7' };
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

function baseInvoiceRow() {
  return {
    id: INV_ID, invoice_no: 'INV-9001', customer_id: 'c-1', order_id: SO_ID,
    total: '300.00', due_date: new Date('2026-05-28T00:00:00Z'), created_at: new Date('2026-05-21T12:00:00Z')
  };
}

beforeEach(() => {
  vi.mocked(createDraftSnapshot).mockClear();
  vi.mocked(finalizeSnapshot).mockClear();
});

describe('createInvoiceReceipts', () => {
  it('queries SO+customer, lines, invoice row, and live snapshots per audience (5 SQL calls in fresh case)', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [baseInvoiceRow()] }, { rows: [] }, { rows: [] }
    ]);
    await createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);
    expect(pool.query).toHaveBeenCalledTimes(5);
    const firstSql = String(pool.query.mock.calls[0][0]);
    expect(firstSql).not.toMatch(/select\s+\*/i);
    expect(firstSql).toMatch(/so\.order_no/);
    expect(firstSql).toMatch(/c\.name/);
    const linesSql = String(pool.query.mock.calls[1][0]);
    expect(linesSql).not.toMatch(/select\s+\*/i);
    expect(linesSql).toMatch(/item_name/);
    expect(linesSql).toMatch(/unit_price/);
    expect(linesSql).toMatch(/unit_cost/);
    const invoiceSql = String(pool.query.mock.calls[2][0]);
    expect(invoiceSql).not.toMatch(/select\s+\*/i);
    expect(invoiceSql).toMatch(/invoice_no/);
    expect(invoiceSql).toMatch(/due_date/);
    expect(invoiceSql).toMatch(/order_id\s*=\s*\$1/i);
    expect(invoiceSql).toMatch(/order\s+by\s+created_at\s+desc/i);
    expect(invoiceSql).toMatch(/limit\s+1/i);
  });

  it('builds external invoice projection (kind=invoice, sourceEntityType=invoice, sourceEntityId=invoice.id)', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [baseInvoiceRow()] }, { rows: [] }, { rows: [] }
    ]);
    await createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);
    const firstCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(firstCall.kind).toBe('invoice');
    expect(firstCall.sourceEntityType).toBe('invoice');
    expect(firstCall.sourceEntityId).toBe(INV_ID);
    expect(firstCall.audience).toBe('external');
    expect(firstCall.projectionVersion).toBe(invoice.projectionVersion);
    const payload = firstCall.payload as { header: { documentNo: string; dateISO: string }; footer?: { reference?: string } };
    expect(payload.header.documentNo).toBe('INV-9001');
    expect(payload.header.dateISO).toBe('2026-05-21T12:00:00.000Z');
    expect(payload.footer?.reference).toBe('2026-05-28T00:00:00.000Z');
    expect(vi.mocked(finalizeSnapshot).mock.calls[0][1]).toEqual({ id: 'snap-id', finalizedBy: USER_ID });
  });

  it('LEAK GUARD — external invoice payload has none of the 6 internal-only line keys', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [baseInvoiceRow()] }, { rows: [] }, { rows: [] }
    ]);
    await createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);
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

  it('internal invoice projection has cogs, margin, diagnostics anchored to invoice id', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [baseInvoiceRow()] }, { rows: [] }, { rows: [] }
    ]);
    await createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);
    expect(vi.mocked(createDraftSnapshot)).toHaveBeenCalledTimes(2);
    const secondCreate = vi.mocked(createDraftSnapshot).mock.calls[1][1];
    expect(secondCreate.audience).toBe('internal');
    expect(secondCreate.kind).toBe('invoice');
    expect(secondCreate.sourceEntityType).toBe('invoice');
    expect(secondCreate.sourceEntityId).toBe(INV_ID);
    const payload = secondCreate.payload as { cogs?: { total: number }; margin?: { total: number }; diagnostics?: { legacyMarkers?: string[] } };
    expect(payload.cogs?.total).toBe(130);
    expect(payload.margin?.total).toBe(170);
    expect(payload.diagnostics?.legacyMarkers).toEqual(['sheet:Q1']);
  });

  it('amends via supersedesId per audience (keyed by invoice id)', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [baseInvoiceRow()] },
      { rows: [{ id: 'prior-external-id' }] }, { rows: [{ id: 'prior-internal-id' }] }
    ]);
    await createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID);
    expect(vi.mocked(createDraftSnapshot).mock.calls[0][1].supersedesId).toBe('prior-external-id');
    expect(vi.mocked(createDraftSnapshot).mock.calls[1][1].supersedesId).toBe('prior-internal-id');
    const externalLookupParams = pool.query.mock.calls[3][1] as unknown[];
    expect(externalLookupParams[0]).toBe('invoice');
    expect(externalLookupParams[1]).toBe(INV_ID);
  });

  it('best-effort: missing SO row → warn + return, no snapshot', async () => {
    const pool = makePool([]);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await expect(createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: missing invoice row → warn + return, no snapshot', async () => {
    const pool = makePool([{ rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [] }]);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await expect(createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: thrown snapshot error is caught and logged', async () => {
    const pool = makePool([
      { rows: [baseSoRow()] }, { rows: baseLineRows() }, { rows: [baseInvoiceRow()] }, { rows: [] }, { rows: [] }
    ]);
    vi.mocked(createDraftSnapshot).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await expect(createInvoiceReceipts(pool as unknown as Pool, SO_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
