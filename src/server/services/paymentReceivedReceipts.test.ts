import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';

vi.mock('./documentSnapshots', () => ({
  createDraftSnapshot: vi.fn(async () => ({ id: 'snap-id', contentHash: 'hash' })),
  finalizeSnapshot: vi.fn(async () => ({ id: 'snap-id', status: 'finalized' as const, contentHash: 'hash' }))
}));

import { createDraftSnapshot, finalizeSnapshot } from './documentSnapshots';
import { createPaymentReceivedReceipts } from './paymentReceivedReceipts';
import { paymentReceived } from './projections/paymentReceived';

const PAY_ID = '11111111-1111-1111-1111-111111111111';
const CMD_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

interface MockPool { query: ReturnType<typeof vi.fn>; }
function makePool(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockPool {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce({ rows: r.rows, rowCount: r.rowCount ?? r.rows.length } as unknown as QueryResult);
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn };
}
function basePaymentRow(overrides = {}) {
  return { id: PAY_ID, amount: '500.00', reference: 'CHK-1234', method: 'check', notes: 'partial allocation — 2 open invoices', created_at: new Date('2026-05-22T12:00:00.000Z'), customer_name: 'Big Buyer Co', ...overrides };
}

beforeEach(() => { vi.mocked(createDraftSnapshot).mockClear(); vi.mocked(finalizeSnapshot).mockClear(); });

describe('createPaymentReceivedReceipts', () => {
  it('queries payment+customer JOIN and live snapshots per audience (3 SQL calls in fresh case)', async () => {
    const pool = makePool([{ rows: [basePaymentRow()] }, { rows: [] }, { rows: [] }]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    expect(pool.query).toHaveBeenCalledTimes(3);
    const sql = String(pool.query.mock.calls[0][0]);
    expect(sql).not.toMatch(/select\s+\*/i);
    expect(sql).toMatch(/p\.id/); expect(sql).toMatch(/p\.amount/); expect(sql).toMatch(/p\.reference/);
    expect(sql).toMatch(/p\.notes/); expect(sql).toMatch(/p\.created_at/); expect(sql).toMatch(/c\.name/);
    expect(sql).toMatch(/left join customers/i);
  });

  it('builds external projection with kind=payment_received, sourceEntityType=payment', async () => {
    const pool = makePool([{ rows: [basePaymentRow()] }, { rows: [] }, { rows: [] }]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    const firstCall = vi.mocked(createDraftSnapshot).mock.calls[0][1];
    expect(firstCall.kind).toBe('payment_received');
    expect(firstCall.sourceEntityType).toBe('payment');
    expect(firstCall.sourceEntityId).toBe(PAY_ID);
    expect(firstCall.audience).toBe('external');
    expect(firstCall.projectionVersion).toBe(paymentReceived.projectionVersion);
    expect(firstCall.supersedesId).toBeUndefined();
    const header = (firstCall.payload as { header: Record<string, unknown> }).header;
    expect(header.counterparty).toBe('Big Buyer Co');
    expect(header.documentNo).toBe('CHK-1234');
    expect(header.dateISO).toBe('2026-05-22T12:00:00.000Z');
    expect((firstCall.payload as { totals: Record<string, unknown> }).totals).toEqual({ subtotal: 500, total: 500 });
    expect(vi.mocked(finalizeSnapshot).mock.calls[0][1]).toEqual({ id: 'snap-id', finalizedBy: USER_ID });
  });

  it('LEAK GUARD — external payload omits internalNotes', async () => {
    const pool = makePool([{ rows: [basePaymentRow({ notes: 'INTERNAL: partial allocation' })] }, { rows: [] }, { rows: [] }]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    const payload = vi.mocked(createDraftSnapshot).mock.calls[0][1].payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('internalNotes');
    expect(JSON.stringify(payload)).not.toContain('INTERNAL:');
  });

  it('internal projection carries internalNotes from payments.notes', async () => {
    const pool = makePool([{ rows: [basePaymentRow({ notes: 'partial allocation — see ticket #42' })] }, { rows: [] }, { rows: [] }]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    const internalCall = vi.mocked(createDraftSnapshot).mock.calls[1][1];
    expect(internalCall.audience).toBe('internal');
    expect((internalCall.payload as { internalNotes?: string }).internalNotes).toBe('partial allocation — see ticket #42');
  });

  it('paymentRef falls back to payment.id and counterparty to "Unknown customer" when NULLs', async () => {
    const pool = makePool([{ rows: [basePaymentRow({ reference: null, customer_name: null })] }, { rows: [] }, { rows: [] }]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    const header = (vi.mocked(createDraftSnapshot).mock.calls[0][1].payload as { header: Record<string, unknown> }).header;
    expect(header.documentNo).toBe(PAY_ID);
    expect(header.counterparty).toBe('Unknown customer');
  });

  it('amends via supersedesId when prior live heads exist', async () => {
    const pool = makePool([{ rows: [basePaymentRow()] }, { rows: [{ id: 'prior-external-id' }] }, { rows: [{ id: 'prior-internal-id' }] }]);
    await createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID);
    expect(vi.mocked(createDraftSnapshot).mock.calls[0][1].supersedesId).toBe('prior-external-id');
    expect(vi.mocked(createDraftSnapshot).mock.calls[1][1].supersedesId).toBe('prior-internal-id');
  });

  it('best-effort: missing payment → warn + return, no snapshot', async () => {
    const pool = makePool([{ rows: [] }]);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    expect(vi.mocked(createDraftSnapshot)).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('best-effort: snapshot error is caught and logged', async () => {
    const pool = makePool([{ rows: [basePaymentRow()] }, { rows: [] }, { rows: [] }]);
    vi.mocked(createDraftSnapshot).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createPaymentReceivedReceipts(pool as unknown as Pool, PAY_ID, CMD_ID, USER_ID)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
