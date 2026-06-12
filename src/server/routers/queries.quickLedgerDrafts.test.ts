// UX-A04 / CAP-024 / Execution Decision 2 (docs/ux-audit-2026-06-12.md):
// server-side per-user Quick Ledger draft persistence. These tests stub
// pool.query, so they run without a live database.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import * as dbModule from '../db';
import { queriesRouter } from './queries';
import type { Role, SessionUser } from '../../shared/types';

const USER_ID = '00000000-0000-0000-0000-000000000001';

function makeUser(role: Role = 'manager'): SessionUser {
  return { id: USER_ID, name: 'Test', email: 't@x', role, workLoop: null };
}

function makeCaller(role: Role = 'manager') {
  return queriesRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    io: {} as SocketServer,
    user: makeUser(role)
  });
}

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    date: '2026-06-12',
    direction: 'receiving',
    entityType: 'customer',
    entityId: '11111111-1111-1111-1111-111111111111',
    entityName: '',
    transactionType: 'client_payment',
    allocationTargetType: 'fifo',
    allocationTargetId: '',
    amount: '250',
    method: 'cash',
    bucket: 'cash-file-a',
    reference: '',
    notes: 'partial for May',
    status: 'draft',
    ...overrides
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('quickLedgerDrafts (get)', () => {
  it('returns null drafts when the user has no saved row', async () => {
    const querySpy = vi.spyOn(dbModule.pool, 'query').mockResolvedValue({ rows: [] } as never);
    const result = await makeCaller('operator').quickLedgerDrafts();
    expect(result).toEqual({ drafts: null, updatedAt: null });
    // Scoped to the calling user and the quickLedger view key.
    expect(querySpy).toHaveBeenCalledWith(expect.stringContaining('from user_view_drafts'), [USER_ID, 'quickLedger']);
  });

  it('returns the stored draft array when a row exists', async () => {
    const drafts = [makeDraft()];
    const updatedAt = new Date('2026-06-12T10:00:00Z');
    vi.spyOn(dbModule.pool, 'query').mockResolvedValue({ rows: [{ drafts, updatedAt }] } as never);
    const result = await makeCaller('operator').quickLedgerDrafts();
    expect(result.drafts).toEqual(drafts);
    expect(result.updatedAt).toEqual(updatedAt);
  });

  it('returns null drafts when the stored value is not an array (defensive)', async () => {
    vi.spyOn(dbModule.pool, 'query').mockResolvedValue({ rows: [{ drafts: { bogus: true }, updatedAt: null }] } as never);
    const result = await makeCaller('operator').quickLedgerDrafts();
    expect(result.drafts).toBeNull();
  });
});

describe('saveQuickLedgerDrafts (put)', () => {
  it('upserts the draft set keyed to the calling user', async () => {
    const querySpy = vi.spyOn(dbModule.pool, 'query').mockResolvedValue({ rows: [] } as never);
    const drafts = [makeDraft()];
    const result = await makeCaller('operator').saveQuickLedgerDrafts({ drafts } as never);
    expect(result).toEqual({ ok: true });
    expect(querySpy).toHaveBeenCalledTimes(1);
    const [sql, params] = querySpy.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('insert into user_view_drafts');
    expect(sql).toContain("on conflict (user_id, view_key)");
    expect(params[0]).toBe(USER_ID);
    expect(JSON.parse(String(params[1]))).toEqual(drafts);
  });

  it('strips unknown keys from drafts before storing (forward compatibility)', async () => {
    const querySpy = vi.spyOn(dbModule.pool, 'query').mockResolvedValue({ rows: [] } as never);
    const drafts = [makeDraft({ rogueField: 'dropped' })];
    await makeCaller('operator').saveQuickLedgerDrafts({ drafts } as never);
    const [, params] = querySpy.mock.calls[0] as unknown as [string, unknown[]];
    const stored = JSON.parse(String(params[1]));
    expect(stored[0]).not.toHaveProperty('rogueField');
    expect(stored[0].amount).toBe('250');
  });

  it('rejects an invalid direction value', async () => {
    const querySpy = vi.spyOn(dbModule.pool, 'query').mockResolvedValue({ rows: [] } as never);
    await expect(
      makeCaller('operator').saveQuickLedgerDrafts({ drafts: [makeDraft({ direction: 'sideways' })] } as never)
    ).rejects.toThrow();
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('rejects more than 50 drafts', async () => {
    const querySpy = vi.spyOn(dbModule.pool, 'query').mockResolvedValue({ rows: [] } as never);
    const drafts = Array.from({ length: 51 }, (_, index) => makeDraft({ id: `draft-${index}` }));
    await expect(makeCaller('operator').saveQuickLedgerDrafts({ drafts } as never)).rejects.toThrow();
    expect(querySpy).not.toHaveBeenCalled();
  });
});
