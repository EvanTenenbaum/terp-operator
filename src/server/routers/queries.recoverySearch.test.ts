import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { queriesRouter } from './queries';
import { pool } from '../db';
import type { SessionUser } from '../../shared/types';

/**
 * Issue #35 — DYN-M3: recoverySearch only matched UUIDs (`affected_ids::text`),
 * never the human-readable text inside `result` (e.g. toast) or `reason`.
 * Searches like q="Harbor" returned [] even when "Harbor Wellness" appeared
 * in the seed data.
 *
 * These tests assert the SQL now includes the textual columns and that a
 * mocked pool returning a row whose `result.toast` contains the query string
 * is propagated out of the procedure.
 */

function makeUser(): SessionUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test',
    email: 't@x',
    role: 'operator',
    workLoop: null
  };
}

function makeCaller() {
  return queriesRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    io: {} as SocketServer,
    user: makeUser()
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recoverySearch — DYN-M3', () => {
  it("queries result->>'toast' ILIKE $1 (matches human-readable toast text)", async () => {
    const spy = vi
      .spyOn(pool, 'query')
      .mockImplementation(async () => ({ rows: [] }) as never);

    const caller = makeCaller();
    await caller.recoverySearch({ q: 'Harbor' });

    expect(spy).toHaveBeenCalledOnce();
    const sql = String(spy.mock.calls[0][0]);
    expect(sql).toMatch(/result\s*->>\s*'toast'\s+ilike\s+\$1/i);
  });

  it('queries reason ILIKE $1 (matches the operator-supplied reason text)', async () => {
    const spy = vi
      .spyOn(pool, 'query')
      .mockImplementation(async () => ({ rows: [] }) as never);

    const caller = makeCaller();
    await caller.recoverySearch({ q: 'Harbor' });

    const sql = String(spy.mock.calls[0][0]);
    expect(sql).toMatch(/reason\s+ilike\s+\$1/i);
  });

  it('uses parameterized query (no raw interpolation of user input)', async () => {
    const spy = vi
      .spyOn(pool, 'query')
      .mockImplementation(async () => ({ rows: [] }) as never);

    const caller = makeCaller();
    await caller.recoverySearch({ q: "Harbor'; drop table command_journal;--" });

    const call = spy.mock.calls[0];
    const sql = String(call[0]);
    const params = call[1] as unknown[];
    // Raw query string must NOT appear in the SQL itself.
    expect(sql).not.toContain('drop table');
    // It must appear (wrapped in % %) in the parameter array.
    expect(params).toBeDefined();
    expect(params[0]).toBe("%Harbor'; drop table command_journal;--%");
  });

  it('returns a row whose result.toast contains the search term', async () => {
    const fakeRow = {
      id: '11111111-1111-1111-1111-111111111111',
      commandName: 'logPayment',
      actorName: 'Op',
      status: 'ok',
      error: null,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      result: { toast: 'Logged $100 from Harbor Wellness against INV-001' },
      inputPayload: {},
      affectedIds: [],
      reversedByCommandId: null
    };
    vi.spyOn(pool, 'query').mockImplementation(
      async () => ({ rows: [fakeRow] }) as never
    );

    const caller = makeCaller();
    const out = await caller.recoverySearch({ q: 'Harbor' });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: fakeRow.id,
      result: { toast: expect.stringContaining('Harbor Wellness') }
    });
  });

  it('still matches by command name, actor name, id, and affected_ids', async () => {
    const spy = vi
      .spyOn(pool, 'query')
      .mockImplementation(async () => ({ rows: [] }) as never);

    const caller = makeCaller();
    await caller.recoverySearch({ q: 'logPayment' });

    const sql = String(spy.mock.calls[0][0]);
    expect(sql).toMatch(/id::text\s+ilike\s+\$1/i);
    expect(sql).toMatch(/command_name\s+ilike\s+\$1/i);
    expect(sql).toMatch(/actor_name\s+ilike\s+\$1/i);
    expect(sql).toMatch(/affected_ids::text\s+ilike\s+\$1/i);
  });
});
