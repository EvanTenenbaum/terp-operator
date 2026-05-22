import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

vi.mock('./documentSnapshots', () => ({
  createDraftSnapshot: vi.fn(async () => ({ id: 'snap-id', contentHash: 'hash' })),
  finalizeSnapshot: vi.fn(async () => ({ id: 'snap-id', status: 'finalized' as const, contentHash: 'hash' }))
}));

import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { createVendorPayoutReceipts } from './vendorPayoutReceipts';
import { vendorPayout } from './projections/vendorPayout';

const VP_ID = '44444444-4444-4444-4444-444444444444';
const CMD_ID = '55555555-5555-5555-5555-555555555555';
const USER_ID = '66666666-6666-6666-6666-666666666666';

interface MockPool { query: ReturnType<typeof vi.fn>; }
function makePool(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockPool {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce({ rows: r.rows, rowCount: r.rowCount ?? r.rows.length } as unknown as QueryResult);
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn };
}
function baseVendorPaymentRow(overrides = {}) {
  return { id: VP_ID, amount: '300.00', reference: 'WIRE-7788', method: 'wire', created_at: new Date('2026-05-22T15:30:00.000Z'), vendor_name: 'Acme Farms', discrepancy_notes: 'check stub mismatched by $0.50', ...overrides };
}

beforeEach(() => { vi.mocked(createDraftSnapshot).mockClear(); vi.mocked(finalizeSnapshot).mockClear(); });

describe('createVendorPayoutReceipts', () => {
  it('queries vendor_payment+vendor_bill+vendor JOIN and live snapshots (3 SQL calls)', async () => {
    const pool = makePool([{ rows: [baseVendorPaymentRow()] }, { rows: [] }, { rows: [] }]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    expect(pool.query).toHaveBeenCalledTimes(3);
    const sql = String(pool.query.mock.calls[0][0]);
    expect(sql).not.toMatch(/select\s+\*/i);
    expect(sql).toMatch(/vp\.id/); expect(sql).toMatch(/vp\.amount/); expect(sql).toMatch(/vp\.reference/);
    expect(sql).toMatch(/vp\.created_at/); expect(sql).toMatch(/v\.name/); expect(sql).toMatch(/vb\.discrepancy_notes/);
    expect(sql).toMatch(/left join vendor_bills/i); expect(sql).toMatch(/left join vendors/i);
  });

  it('builds external projection with kind=vendor_payout, sourceEntityType=vendor_payment', async () => {
    const pool = makePool([{ rows: [baseVendorPaymentRow()] }, { rows: [] }, { rows: [] }]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    const firstCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(firstCall.kind).toBe('vendor_payout');
    expect(firstCall.sourceEntityType).toBe('vendor_payment');
    expect(firstCall.sourceEntityId).toBe(VP_ID);
    expect(firstCall.audience).toBe('external');
    expect(firstCall.projectionVersion).toBe(vendorPayout.projectionVersion);
    const header = (firstCall.payload as { header: Record<string, unknown> }).header;
    expect(header.counterparty).toBe('Acme Farms');
    expect(header.documentNo).toBe('WIRE-7788');
    expect((firstCall.payload as { totals: Record<string, unknown> }).totals).toEqual({ subtotal: 300, total: 300 });
  });

  it('LEAK GUARD — external payload omits internalNotes', async () => {
    const pool = makePool([{ rows: [baseVendorPaymentRow({ discrepancy_notes: 'INTERNAL: underpaid $0.50' })] }, { rows: [] }, { rows: [] }]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    const payload = vi.mocked(createDraftSnapshot).mock.calls[0][1].payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('internalNotes');
    expect(JSON.stringify(payload)).not.toContain('INTERNAL:');
  });

  it('internal projection carries internalNotes from vendor_bills.discrepancy_notes', async () => {
    const pool = makePool([{ rows: [baseVendorPaymentRow({ discrepancy_notes: 'short by $1.50; called vendor' })] }, { rows: [] }, { rows: [] }]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    const internalCall = vi.mocked(createDraftSnapshot).mock.calls[1][1];
    expect(internalCall.audience).toBe('internal');
    expect((internalCall.payload as { internalNotes?: string }).internalNotes).toBe('short by $1.50; called vendor');
  });

  it('payoutRef falls back to vendor_payment.id and counterparty to "Unknown vendor" when NULLs', async () => {
    const pool = makePool([{ rows: [baseVendorPaymentRow({ reference: null, vendor_name: null })] }, { rows: [] }, { rows: [] }]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    const header = (vi.mocked(createDraftSnapshot).mock.calls[0][1].payload as { header: Record<string, unknown> }).header;
    expect(header.documentNo).toBe(VP_ID);
    expect(header.counterparty).toBe('Unknown vendor');
  });

  it('amends via supersedesId when prior live heads exist', async () => {
    const pool = makePool([{ rows: [baseVendorPaymentRow()] }, { rows: [{ id: 'prior-external-id' }] }, { rows: [{ id: 'prior-internal-id' }] }]);
    await createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID);
    expect(vi.mocked(createDraftSnapshot).mock.calls[0][1].supersedesId).toBe('prior-external-id');
    expect(vi.mocked(createDraftSnapshot).mock.calls[1][1].supersedesId).toBe('prior-internal-id');
  });

  it('best-effort: missing vendor_payment → warn + return, no snapshot', async () => {
    const pool = makePool([{ rows: [] }]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: snapshot error is caught and logged', async () => {
    const pool = makePool([{ rows: [baseVendorPaymentRow()] }, { rows: [] }, { rows: [] }]);
    vi.mocked(createDraftSnapshot).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createVendorPayoutReceipts(pool as unknown as Pool, VP_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
