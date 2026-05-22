import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

vi.mock('./documentSnapshots', () => ({
  createDraftSnapshot: vi.fn(async () => ({ id: 'snap-id', contentHash: 'hash' })),
  finalizeSnapshot: vi.fn(async () => ({ id: 'snap-id', status: 'finalized' as const, contentHash: 'hash' }))
}));

import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { createPoFinalizationReceipts } from './poFinalizationReceipts';
import { purchaseFinalization } from './projections/purchaseFinalization';

const PO_ID = '11111111-1111-1111-1111-111111111111';
const CMD_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

interface MockPool { query: ReturnType<typeof vi.fn>; }

function makePool(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockPool {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      rows: r.rows,
      rowCount: r.rowCount ?? r.rows.length
    } as unknown as QueryResult);
  }
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn };
}

function basePoRow() {
  return {
    id: PO_ID,
    po_no: 'PO-1001',
    vendor_id: 'v-1',
    vendor_name: 'Acme Farms',
    finalized_at: new Date('2026-05-21T12:00:00Z'),
    total: '120.50',
    internal_notes: 'paid in cash',
    external_notes: 'net 14'
  };
}

function baseLineRows() {
  return [
    {
      id: 'l-1',
      product_name: 'Sunset OG',
      qty: '2',
      unit_cost: '50.25',
      external_notes: 'Tier A',
      internal_notes: 'leftover from prior week',
      legacy_marker: null
    },
    {
      id: 'l-2',
      product_name: 'Blue Dream',
      qty: '1',
      unit_cost: '20.00',
      external_notes: null,
      internal_notes: null,
      legacy_marker: 'sheet:Q1'
    }
  ];
}

beforeEach(() => {
  vi.mocked(createDraftSnapshot).mockClear();
  vi.mocked(finalizeSnapshot).mockClear();
});

describe('createPoFinalizationReceipts', () => {
  it('queries the PO+vendor row, the lines, and the existing live snapshots per audience (4 SQL calls in fresh case)', async () => {
    const pool = makePool([
      { rows: [basePoRow()] },          // PO+vendor JOIN
      { rows: baseLineRows() },         // lines
      { rows: [] },                     // existing external live snapshot id (none)
      { rows: [] }                      // existing internal live snapshot id (none)
    ]);

    await createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID);

    expect(pool.query).toHaveBeenCalledTimes(4);
    const firstSql = String(pool.query.mock.calls[0][0]);
    // Spec §6 rule 3: NO SELECT *, anywhere on external projection paths,
    // including raw SQL. The PO+vendor query enumerates columns explicitly.
    expect(firstSql).not.toMatch(/select\s+\*/i);
    expect(firstSql).toMatch(/po\.po_no/);
    expect(firstSql).toMatch(/v\.name/);
    const linesSql = String(pool.query.mock.calls[1][0]);
    expect(linesSql).not.toMatch(/select\s+\*/i);
    expect(linesSql).toMatch(/product_name/);
    expect(linesSql).toMatch(/external_notes/);
    expect(linesSql).toMatch(/internal_notes/);
    expect(linesSql).toMatch(/legacy_marker/);
  });

  it('builds the external projection from PurchaseFinalizationInput and creates+finalizes one external snapshot', async () => {
    const pool = makePool([
      { rows: [basePoRow()] },
      { rows: baseLineRows() },
      { rows: [] }, // no live external
      { rows: [] }  // no live internal
    ]);

    await createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID);

    // First snapshot created should be the EXTERNAL audience.
    const firstCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(firstCall.kind).toBe('purchase_finalization');
    expect(firstCall.sourceEntityType).toBe('purchase_order');
    expect(firstCall.sourceEntityId).toBe(PO_ID);
    expect(firstCall.audience).toBe('external');
    expect(firstCall.commandId).toBe(CMD_ID);
    expect(firstCall.createdBy).toBe(USER_ID);
    expect(firstCall.projectionVersion).toBe(purchaseFinalization.projectionVersion);
    expect(firstCall.supersedesId).toBeUndefined();
    // Payload is the external projection — no internal_notes, no diagnostics,
    // no cogs, no margin. The projector enforces this; the helper just feeds it.
    expect(firstCall.payload).toEqual(
      purchaseFinalization.external({
        vendorName: 'Acme Farms',
        poNo: 'PO-1001',
        dateISO: '2026-05-21T12:00:00.000Z',
        externalNotes: 'net 14',
        internalNotes: 'paid in cash',
        subtotal: 120.5,
        total: 120.5,
        lines: [
          { productName: 'Sunset OG', qty: 2, unitPrice: 50.25, subtotal: 100.5, externalNotes: 'Tier A', internalNotes: 'leftover from prior week' },
          { productName: 'Blue Dream', qty: 1, unitPrice: 20, subtotal: 20, externalNotes: undefined, internalNotes: undefined, diagnostics: { legacyMarkers: ['sheet:Q1'] } }
        ]
      })
    );
    expect(vi.mocked(finalizeSnapshot).mock.calls[0][1]).toEqual({
      id: 'snap-id',
      finalizedBy: USER_ID
    });
  });

  it('creates+finalizes the INTERNAL snapshot as the second pair of calls', async () => {
    const pool = makePool([
      { rows: [basePoRow()] },
      { rows: baseLineRows() },
      { rows: [] },
      { rows: [] }
    ]);

    await createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID);

    expect(vi.mocked(createDraftSnapshot)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(finalizeSnapshot)).toHaveBeenCalledTimes(2);
    const secondCreate = vi.mocked(createDraftSnapshot).mock.calls[1][1];
    expect(secondCreate.audience).toBe('internal');
    // Internal projection MUST carry internalNotes and diagnostics.legacyMarkers
    const payload = secondCreate.payload as Record<string, unknown>;
    expect(payload.internalNotes).toBe('paid in cash');
    expect((payload.diagnostics as { legacyMarkers?: string[] })?.legacyMarkers).toContain('sheet:Q1');
  });

  it('amends an existing live snapshot via supersedesId on unfinalize→re-finalize', async () => {
    const pool = makePool([
      { rows: [basePoRow()] },
      { rows: baseLineRows() },
      { rows: [{ id: 'prior-external-id' }] }, // live external head exists
      { rows: [{ id: 'prior-internal-id' }] }  // live internal head exists
    ]);

    await createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID);

    expect(vi.mocked(createDraftSnapshot).mock.calls[0][1].supersedesId).toBe('prior-external-id');
    expect(vi.mocked(createDraftSnapshot).mock.calls[1][1].supersedesId).toBe('prior-internal-id');
  });

  it('best-effort: swallows errors and never throws into the caller', async () => {
    const pool = makePool([]);
    // No queued responses — pool.query default returns empty rows, so PO lookup
    // returns zero rows. The helper detects "PO not found" and logs+returns.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID)
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: a thrown error from the snapshot service is caught and logged, not propagated', async () => {
    const pool = makePool([
      { rows: [basePoRow()] },
      { rows: baseLineRows() },
      { rows: [] },
      { rows: [] }
    ]);
    vi.mocked(createDraftSnapshot).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      createPoFinalizationReceipts(pool as unknown as Pool, PO_ID, CMD_ID, USER_ID)
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
