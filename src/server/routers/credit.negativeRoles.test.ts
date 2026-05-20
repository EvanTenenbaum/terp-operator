import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server as SocketServer } from 'socket.io';
import type { Request, Response } from 'express';
import { creditRouter } from './credit';
import { pool } from '../db';
import type { Role, SessionUser } from '../../shared/types';

/**
 * Phase 7 — CI gate hardening (issue #68).
 *
 * Iterate over EVERY procedure on `creditRouter` and assert that callers below
 * the required role are rejected with `FORBIDDEN` (or `UNAUTHORIZED` for an
 * anonymous caller). This test is intentionally programmatic: adding a new
 * procedure to `creditRouter` without a role gate will fail this test in CI.
 */

function makeUser(role: Role): SessionUser {
  return { id: '00000000-0000-0000-0000-000000000001', name: 'Test', email: 't@x', role };
}

function makeCaller(role: Role | null) {
  const user = role === null ? null : makeUser(role);
  return creditRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    io: {} as SocketServer,
    user
  });
}

interface RouterDef {
  _def: {
    procedures: Record<string, unknown>;
  };
}

function buildStandInInput(): Record<string, unknown> {
  return {
    customerId: '11111111-1111-1111-1111-111111111111',
    limit: 20,
    offset: 0,
    sort: 'days_since_review',
    filterTab: 'stale_manual'
  };
}

const procedures = (creditRouter as unknown as RouterDef)._def.procedures;
const procedureNames = Object.keys(procedures).sort();

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('credit router — negative role gate matrix', () => {
  it('has at least one procedure (sanity check)', () => {
    expect(procedureNames.length).toBeGreaterThan(0);
  });

  describe.each(procedureNames)('procedure %s', (procName) => {
    it('rejects viewer with FORBIDDEN', async () => {
      const dbSentinel = new Error('credit router negative-role test: db query reached');
      const spy = vi.spyOn(pool, 'query').mockImplementation(() => {
        throw dbSentinel;
      });

      const caller = makeCaller('viewer') as unknown as Record<
        string,
        (input?: unknown) => Promise<unknown>
      >;
      const fn = caller[procName];
      expect(typeof fn).toBe('function');

      let err: unknown = null;
      try {
        await fn(buildStandInInput());
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect(err).not.toBe(dbSentinel);
      expect(err).toMatchObject({ code: 'FORBIDDEN' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('rejects operator with FORBIDDEN', async () => {
      const dbSentinel = new Error('credit router negative-role test: db query reached');
      const spy = vi.spyOn(pool, 'query').mockImplementation(() => {
        throw dbSentinel;
      });

      const caller = makeCaller('operator') as unknown as Record<
        string,
        (input?: unknown) => Promise<unknown>
      >;
      const fn = caller[procName];
      expect(typeof fn).toBe('function');

      let err: unknown = null;
      try {
        await fn(buildStandInInput());
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect(err).not.toBe(dbSentinel);
      expect(err).toMatchObject({ code: 'FORBIDDEN' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('rejects anonymous caller with UNAUTHORIZED', async () => {
      const dbSentinel = new Error('credit router negative-role test: db query reached');
      const spy = vi.spyOn(pool, 'query').mockImplementation(() => {
        throw dbSentinel;
      });

      const caller = makeCaller(null) as unknown as Record<
        string,
        (input?: unknown) => Promise<unknown>
      >;
      const fn = caller[procName];
      expect(typeof fn).toBe('function');

      let err: unknown = null;
      try {
        await fn(buildStandInInput());
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect(err).not.toBe(dbSentinel);
      expect(err).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
