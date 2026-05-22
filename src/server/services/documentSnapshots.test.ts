import { describe, it, expect, vi } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';
import { TRPCError } from '@trpc/server';
import type { SessionUser } from '../../shared/types';
import {
  canonicalizeJson,
  hashSnapshot,
  createDraftSnapshot,
  updateDraftSnapshot,
  finalizeSnapshot,
  voidSnapshot,
  getExternalReceipt,
  getInternalReceipt,
  renderSignalText,
  renderPrintHtml
} from './documentSnapshots';
import type { ExternalReceiptProjection } from './projections/types';

describe('canonicalizeJson (RFC 8785 subset)', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicalizeJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
  it('preserves array order', () => {
    expect(canonicalizeJson([3, 1, 2])).toBe('[3,1,2]');
  });
  it('recurses into nested objects', () => {
    expect(canonicalizeJson({ z: { b: 1, a: 2 }, a: 1 })).toBe('{"a":1,"z":{"a":2,"b":1}}');
  });
  it('rejects undefined and functions to avoid silent drift', () => {
    expect(() => canonicalizeJson({ a: undefined as unknown as number })).toThrow(/undefined/);
  });
});

describe('hashSnapshot', () => {
  it('produces a 64-char lowercase hex sha256', () => {
    const h = hashSnapshot({ a: 1, b: 2 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is insensitive to key insertion order', () => {
    expect(hashSnapshot({ a: 1, b: 2 })).toBe(hashSnapshot({ b: 2, a: 1 }));
  });
});

/* ----------------------------------------------------------------------
 * Task 6 — mock helpers.
 *
 * The service is wired to the standard `pg` API: `pool.query` for
 * single-statement ops (createDraft, updateDraft, void), and
 * `pool.connect()` + `client.query` + `client.release()` for the
 * BEGIN/COMMIT transaction used by `finalizeSnapshot`. The mocks below
 * give us the smallest surface that lets us inspect query order, SQL
 * text, and parameter values.
 * ---------------------------------------------------------------------- */

interface MockPool {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
}

interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

function makePool(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockPool {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      rows: r.rows,
      rowCount: r.rowCount ?? r.rows.length
    } as unknown as QueryResult);
  }
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn, connect: vi.fn() };
}

function makeClient(responses: Array<{ rows: unknown[]; rowCount?: number }>): MockClient {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      rows: r.rows,
      rowCount: r.rowCount ?? r.rows.length
    } as unknown as QueryResult);
  }
  fn.mockResolvedValue({ rows: [], rowCount: 0 } as unknown as QueryResult);
  return { query: fn, release: vi.fn() };
}

function makePoolWithClient(
  client: MockClient,
  poolResponses: Array<{ rows: unknown[]; rowCount?: number }> = []
): MockPool {
  const pool = makePool(poolResponses);
  pool.connect.mockResolvedValue(client as unknown as PoolClient);
  return pool;
}

/* ----------------------------------------------------------------------
 * Task 6 — createDraftSnapshot
 * ---------------------------------------------------------------------- */

describe('createDraftSnapshot', () => {
  const baseInput = {
    kind: 'purchase_finalization' as const,
    sourceEntityType: 'purchase_order' as const,
    sourceEntityId: 'po-1',
    commandId: 'cmd-1',
    audience: 'external' as const,
    payload: { a: 1, b: 2 },
    projectionVersion: 1,
    createdBy: 'user-1'
  };

  it('inserts a row with status=draft and returns {id, contentHash}', async () => {
    const pool = makePool([{ rows: [{ id: 'snap-1' }] }]);
    const result = await createDraftSnapshot(pool as unknown as Pool, baseInput);

    expect(result.id).toBe('snap-1');
    expect(result.contentHash).toBe(hashSnapshot(baseInput.payload));

    const insertCalls = pool.query.mock.calls.filter((args) =>
      /INSERT\s+INTO\s+document_snapshots/i.test(String(args[0]))
    );
    expect(insertCalls).toHaveLength(1);
    const params = insertCalls[0][1] as unknown[];
    // status='draft' must be among the bound parameters.
    expect(params).toContain('draft');
    // commandId is threaded through.
    expect(params).toContain('cmd-1');
    // content_hash is threaded through.
    expect(params).toContain(result.contentHash);
  });

  it('rejects an empty commandId', async () => {
    const pool = makePool([]);
    await expect(
      createDraftSnapshot(pool as unknown as Pool, { ...baseInput, commandId: '' })
    ).rejects.toThrow(/commandId/i);
    // No INSERT was issued.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects supersedesId that points to a non-existent snapshot', async () => {
    const pool = makePool([
      { rows: [], rowCount: 0 }  // predecessor SELECT returns nothing
    ]);
    await expect(
      createDraftSnapshot(pool as unknown as Pool, {
        kind: 'purchase_finalization',
        sourceEntityType: 'purchase_order',
        sourceEntityId: 'po-1',
        commandId: 'cmd-1',
        audience: 'external',
        payload: {},
        projectionVersion: 1,
        createdBy: 'user-1',
        supersedesId: 'non-existent-id'
      })
    ).rejects.toThrow(/non-existent/i);
    // No INSERT was issued.
    const insertCalls = (pool.query.mock.calls as Array<unknown[]>)
      .filter(([sql]) => /INSERT\s+INTO\s+document_snapshots/i.test(String(sql)));
    expect(insertCalls).toHaveLength(0);
  });
});

/* ----------------------------------------------------------------------
 * Task 6 — updateDraftSnapshot
 * ---------------------------------------------------------------------- */

describe('updateDraftSnapshot', () => {
  it('UPDATEs WHERE status=draft and returns the new contentHash', async () => {
    const newPayload = { x: 9, y: 10 };
    const pool = makePool([
      { rows: [{ id: 'snap-1', status: 'draft' }], rowCount: 1 }, // SELECT for status check
      { rows: [{ id: 'snap-1' }], rowCount: 1 }                   // UPDATE
    ]);
    const result = await updateDraftSnapshot(pool as unknown as Pool, {
      id: 'snap-1',
      payload: newPayload
    });
    expect(result.id).toBe('snap-1');
    expect(result.contentHash).toBe(hashSnapshot(newPayload));

    const updateCalls = pool.query.mock.calls.filter((args) =>
      /UPDATE\s+document_snapshots/i.test(String(args[0]))
    );
    expect(updateCalls).toHaveLength(1);
    expect(String(updateCalls[0][0])).toMatch(/WHERE[\s\S]*status\s*=\s*'draft'/i);
  });
});

/* ----------------------------------------------------------------------
 * Task 6 — finalizeSnapshot happy path + advisory-lock ordering
 * ---------------------------------------------------------------------- */

describe('finalizeSnapshot', () => {
  const baseDraftRow = {
    id: 'snap-1',
    kind: 'purchase_finalization',
    source_entity_type: 'purchase_order',
    source_entity_id: 'po-1',
    audience: 'external',
    supersedes_id: null,
    status: 'draft',
    content_hash: 'a'.repeat(64)
  };

  function happyPathResponses() {
    return [
      { rows: [] }, // BEGIN
      { rows: [baseDraftRow] }, // SELECT draft FOR UPDATE
      { rows: [{ pg_advisory_xact_lock: '' }] }, // advisory lock
      { rows: [] }, // SELECT live-head FOR UPDATE (no row → first finalize)
      { rows: [{ id: 'snap-1' }], rowCount: 1 }, // UPDATE finalize
      { rows: [] } // COMMIT
    ];
  }

  it('finalizes a draft inside a BEGIN/COMMIT transaction and returns {id, status, contentHash}', async () => {
    const client = makeClient(happyPathResponses());
    const pool = makePoolWithClient(client);

    const result = await finalizeSnapshot(pool as unknown as Pool, {
      id: 'snap-1',
      finalizedBy: 'user-1'
    });

    expect(result).toEqual({
      id: 'snap-1',
      status: 'finalized',
      contentHash: baseDraftRow.content_hash
    });

    // Borrowed a client and released it.
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);

    // First statement on the client is BEGIN; last is COMMIT.
    const allCalls = client.query.mock.calls.map((args) => String(args[0]).trim());
    expect(allCalls[0]).toMatch(/^BEGIN/i);
    expect(allCalls[allCalls.length - 1]).toMatch(/^COMMIT/i);

    // The finalize UPDATE sets status='finalized', finalized_by, finalized_at,
    // and is scoped WHERE status='draft'.
    const finalizeUpdate = client.query.mock.calls.find((args) =>
      /UPDATE\s+document_snapshots[\s\S]+status\s*=\s*'finalized'/i.test(String(args[0]))
    );
    expect(finalizeUpdate).toBeDefined();
    const finalizeSql = String(finalizeUpdate![0]);
    expect(finalizeSql).toMatch(/finalized_by/i);
    expect(finalizeSql).toMatch(/finalized_at/i);
    expect(finalizeSql).toMatch(/now\s*\(\s*\)/i);
    expect(finalizeSql).toMatch(/WHERE[\s\S]*status\s*=\s*'draft'/i);
    const finalizeParams = finalizeUpdate![1] as unknown[];
    expect(finalizeParams).toContain('user-1');
    expect(finalizeParams).toContain('snap-1');
  });

  it('dispatches the pg_advisory_xact_lock AFTER the draft SELECT FOR UPDATE and BEFORE the live-head SELECT and finalize UPDATE', async () => {
    const client = makeClient(happyPathResponses());
    const pool = makePoolWithClient(client);

    await finalizeSnapshot(pool as unknown as Pool, {
      id: 'snap-1',
      finalizedBy: 'user-1'
    });

    const calls = client.query.mock.calls.map((args) => String(args[0]));

    const draftSelectIdx = calls.findIndex(
      (sql) =>
        /SELECT[\s\S]+FROM\s+document_snapshots[\s\S]+WHERE\s+id\s*=\s*\$1[\s\S]+FOR\s+UPDATE/i.test(
          sql
        )
    );
    const advisoryIdx = calls.findIndex((sql) => /pg_advisory_xact_lock/i.test(sql));
    const liveHeadIdx = calls.findIndex(
      (sql) =>
        /SELECT[\s\S]+FROM\s+document_snapshots/i.test(sql) &&
        /source_entity_type/i.test(sql) &&
        /audience/i.test(sql) &&
        /FOR\s+UPDATE/i.test(sql) &&
        !/WHERE\s+id\s*=\s*\$1/i.test(sql)
    );
    const updateIdx = calls.findIndex((sql) =>
      /UPDATE\s+document_snapshots[\s\S]+status\s*=\s*'finalized'/i.test(sql)
    );

    expect(draftSelectIdx).toBeGreaterThanOrEqual(0);
    expect(advisoryIdx).toBeGreaterThanOrEqual(0);
    expect(liveHeadIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThanOrEqual(0);

    expect(draftSelectIdx).toBeLessThan(advisoryIdx);
    expect(advisoryIdx).toBeLessThan(liveHeadIdx);
    expect(liveHeadIdx).toBeLessThan(updateIdx);
  });

  it('threads the draft row (source_entity_type, source_entity_id, audience) into the advisory-lock key via hashtextextended', async () => {
    const client = makeClient(happyPathResponses());
    const pool = makePoolWithClient(client);

    await finalizeSnapshot(pool as unknown as Pool, {
      id: 'snap-1',
      finalizedBy: 'user-1'
    });

    const advisoryCall = client.query.mock.calls.find((args) =>
      /pg_advisory_xact_lock/i.test(String(args[0]))
    );
    expect(advisoryCall).toBeDefined();

    const advisorySql = String(advisoryCall![0]);
    expect(advisorySql).toMatch(/pg_advisory_xact_lock/i);
    expect(advisorySql).toMatch(/hashtextextended/i);

    // Lock-key inputs come from the draft row's (entity_type, entity_id, audience).
    const params = (advisoryCall![1] as unknown[]) ?? [];
    expect(params).toContain('purchase_order');
    expect(params).toContain('po-1');
    expect(params).toContain('external');
  });

  it('rolls back the transaction and rethrows when the live-head recheck fails (no supersedesId + live head present)', async () => {
    const client = makeClient([
      { rows: [] }, // BEGIN
      { rows: [baseDraftRow] }, // SELECT draft FOR UPDATE (no supersedes_id)
      { rows: [{ pg_advisory_xact_lock: '' }] }, // advisory lock
      { rows: [{ id: 'other-live-head' }] }, // live-head SELECT FOR UPDATE returns a competing head
      { rows: [] } // ROLLBACK
    ]);
    const pool = makePoolWithClient(client);

    await expect(
      finalizeSnapshot(pool as unknown as Pool, { id: 'snap-1', finalizedBy: 'user-1' })
    ).rejects.toThrow(/live snapshot already exists/i);

    const allCalls = client.query.mock.calls.map((args) => String(args[0]).trim());
    // No finalize UPDATE was dispatched.
    expect(
      allCalls.some((sql) => /UPDATE\s+document_snapshots[\s\S]+status\s*=\s*'finalized'/i.test(sql))
    ).toBe(false);
    // ROLLBACK was issued.
    expect(allCalls.some((sql) => /^ROLLBACK/i.test(sql))).toBe(true);
    // Client released even on error.
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('maps a 23505 content-hash unique violation to a clear error message', async () => {
    const draftRow = {
      id: 'snap-1',
      kind: 'purchase_finalization',
      source_entity_type: 'purchase_order',
      source_entity_id: 'po-1',
      audience: 'external',
      supersedes_id: null,
      status: 'draft',
      content_hash: 'a'.repeat(64)
    };

    const uniqueViolationError = Object.assign(new Error('unique violation'), {
      code: '23505',
      constraint: 'document_snapshots_finalized_content_unique'
    });

    // The client mock: BEGIN, SELECT draft, advisory lock, live-head (none), then UPDATE throws 23505.
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })                    // BEGIN
        .mockResolvedValueOnce({ rows: [draftRow], rowCount: 1 })           // SELECT draft FOR UPDATE
        .mockResolvedValueOnce({ rows: [{}], rowCount: 1 })                 // advisory lock
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })                   // live-head SELECT (none)
        .mockRejectedValueOnce(uniqueViolationError)                        // UPDATE throws 23505
        .mockResolvedValue({ rows: [], rowCount: 0 }),                      // ROLLBACK
      release: vi.fn()
    };
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: vi.fn().mockResolvedValue(client as unknown as PoolClient)
    };

    await expect(
      finalizeSnapshot(pool as unknown as Pool, { id: 'snap-1', finalizedBy: 'user-1' })
    ).rejects.toThrow(/identical content has already been finalized/i);
  });
});

/* ----------------------------------------------------------------------
 * Task 7 — read-path loaders: getExternalReceipt / getInternalReceipt
 * ---------------------------------------------------------------------- */

const minimalExternalSnapshotJson = {
  kind: 'purchase_finalization',
  header: { title: 'Purchase Order', counterparty: 'Vendor A', dateISO: '2026-05-20', documentNo: 'PO-1' },
  lines: [],
  totals: { subtotal: 100, total: 100 },
  projectionVersion: 1
};

const minimalInternalSnapshotJson = {
  kind: 'purchase_finalization',
  header: { title: 'Purchase Order', counterparty: 'Vendor A', dateISO: '2026-05-20', documentNo: 'PO-1' },
  lines: [],
  totals: { subtotal: 100, total: 100 },
  projectionVersion: 1,
  internalNotes: 'INTERNAL'
};

function makeLiveRow(snapshotJson: unknown) {
  return {
    id: 'snap-live',
    kind: 'purchase_finalization',
    source_entity_type: 'purchase_order',
    source_entity_id: 'po-1',
    command_id: 'cmd-1',
    status: 'finalized',
    audience: 'external',
    snapshot_json: snapshotJson,
    projection_version: 1,
    content_hash: 'a'.repeat(64),
    supersedes_id: null,
    created_by: 'user-1',
    finalized_by: 'user-1',
    voided_by: null,
    created_at: new Date().toISOString(),
    finalized_at: new Date().toISOString(),
    voided_at: null
  };
}

describe('getExternalReceipt', () => {
  it('returns null when selectLiveRow returns no row', async () => {
    const pool = makePool([{ rows: [], rowCount: 0 }]);

    const result = await getExternalReceipt(
      pool as unknown as Pool,
      'purchase_order',
      'po-1'
    );

    expect(result).toBeNull();
    // Only one query should have fired (the live-row SELECT), no fallback to purchaseOrders
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('returns ExternalReceiptProjection with __EXTERNAL_PROJECTED__: true applied in memory when a row exists', async () => {
    const pool = makePool([{ rows: [makeLiveRow(minimalExternalSnapshotJson)], rowCount: 1 }]);

    const result = await getExternalReceipt(
      pool as unknown as Pool,
      'purchase_order',
      'po-1'
    );

    expect(result).not.toBeNull();
    expect(result!.__EXTERNAL_PROJECTED__).toBe(true);
    // Must not have the internal witness key
    expect((result as unknown as Record<string, unknown>).__INTERNAL_ONLY__).toBeUndefined();

    // The witness key must NOT appear in the pool.query call parameters
    const allParams = pool.query.mock.calls.flatMap((args) =>
      Array.isArray(args[1]) ? args[1] : []
    );
    const paramsStr = JSON.stringify(allParams);
    expect(paramsStr).not.toContain('__EXTERNAL_PROJECTED__');
  });

  it('throws when snapshot_json contains a banned witness key __EXTERNAL_PROJECTED__', async () => {
    const poisonedJson = { ...minimalExternalSnapshotJson, __EXTERNAL_PROJECTED__: true };
    const pool = makePool([{ rows: [makeLiveRow(poisonedJson)], rowCount: 1 }]);

    await expect(
      getExternalReceipt(pool as unknown as Pool, 'purchase_order', 'po-1')
    ).rejects.toThrow(/witness/i);
  });

  it('throws when snapshot_json contains the other banned witness key __INTERNAL_ONLY__', async () => {
    const poisoned = {
      kind: 'purchase_finalization',
      header: { title: 'Purchase Order', counterparty: 'Vendor A', dateISO: '2026-05-20', documentNo: 'PO-1' },
      lines: [],
      totals: { subtotal: 100, total: 100 },
      projectionVersion: 1,
      __INTERNAL_ONLY__: true  // banned — must not be on disk
    };
    const pool = makePool([{
      rows: [{
        id: 'snap-1', kind: 'purchase_finalization',
        source_entity_type: 'purchase_order', source_entity_id: 'po-1',
        command_id: 'cmd-1', status: 'finalized', audience: 'external',
        snapshot_json: poisoned, projection_version: 1,
        content_hash: 'a'.repeat(64), supersedes_id: null,
        created_by: 'user-1', finalized_by: 'user-1', voided_by: null,
        created_at: new Date().toISOString(), finalized_at: new Date().toISOString(),
        voided_at: null
      }]
    }]);
    await expect(
      getExternalReceipt(pool as unknown as Pool, 'purchase_order', 'po-1')
    ).rejects.toThrow(/witness/i);
  });
});

describe('getInternalReceipt', () => {
  it('throws UNAUTHORIZED (TRPCError code=UNAUTHORIZED) when user is null, without touching the DB', async () => {
    const pool = makePool([]);

    await expect(
      getInternalReceipt(pool as unknown as Pool, null, 'purchase_order', 'po-1')
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof TRPCError && err.code === 'UNAUTHORIZED';
    });

    // assertRole must fire before any DB read
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('throws FORBIDDEN when user has role operator (below manager), without touching the DB', async () => {
    const pool = makePool([]);
    const operatorUser = { id: 'u1', name: 'Op', email: 'op@x.com', role: 'operator', workLoop: null } as SessionUser;

    await expect(
      getInternalReceipt(pool as unknown as Pool, operatorUser, 'purchase_order', 'po-1')
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof TRPCError && err.code === 'FORBIDDEN';
    });

    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns null when no live row exists for an authorized manager', async () => {
    const pool = makePool([{ rows: [], rowCount: 0 }]);
    const managerUser = { id: 'u2', name: 'Mgr', email: 'mgr@x.com', role: 'manager', workLoop: null } as SessionUser;

    const result = await getInternalReceipt(
      pool as unknown as Pool,
      managerUser,
      'purchase_order',
      'po-1'
    );

    expect(result).toBeNull();
  });

  it('returns InternalReceiptProjection with __INTERNAL_ONLY__: true for authorized manager', async () => {
    const pool = makePool([{ rows: [makeLiveRow(minimalInternalSnapshotJson)], rowCount: 1 }]);
    const managerUser = { id: 'u2', name: 'Mgr', email: 'mgr@x.com', role: 'manager', workLoop: null } as SessionUser;

    const result = await getInternalReceipt(
      pool as unknown as Pool,
      managerUser,
      'purchase_order',
      'po-1'
    );

    expect(result).not.toBeNull();
    expect(result!.__INTERNAL_ONLY__).toBe(true);
    // Must not carry the external witness key
    expect((result as unknown as Record<string, unknown>).__EXTERNAL_PROJECTED__).toBeUndefined();
  });

  it('throws when snapshot_json contains a banned witness key (__INTERNAL_ONLY__ on disk)', async () => {
    const managerUser = { id: 'u-manager', role: 'manager' } as unknown as import('../../shared/types').SessionUser;
    const poisoned = {
      kind: 'purchase_finalization',
      header: { title: 'Purchase Order', counterparty: 'Vendor A', dateISO: '2026-05-20', documentNo: 'PO-1' },
      lines: [],
      totals: { subtotal: 100, total: 100 },
      projectionVersion: 1,
      internalNotes: 'INTERNAL',
      __INTERNAL_ONLY__: true  // banned — must not be on disk
    };
    const pool = makePool([{
      rows: [{
        id: 'snap-1', kind: 'purchase_finalization',
        source_entity_type: 'purchase_order', source_entity_id: 'po-1',
        command_id: 'cmd-1', status: 'finalized', audience: 'internal',
        snapshot_json: poisoned, projection_version: 1,
        content_hash: 'a'.repeat(64), supersedes_id: null,
        created_by: 'user-1', finalized_by: 'user-1', voided_by: null,
        created_at: new Date().toISOString(), finalized_at: new Date().toISOString(),
        voided_at: null
      }]
    }]);
    await expect(
      getInternalReceipt(pool as unknown as Pool, managerUser, 'purchase_order', 'po-1')
    ).rejects.toThrow(/witness/i);
  });
});

// ===== Task 14 tests =====

describe('updateDraftSnapshot — immutability of finalized rows', () => {
  it('rejects a finalized row and does not issue any UPDATE', async () => {
    // Pool returns a SELECT result showing the row is finalized.
    // (The current updateDraftSnapshot uses WHERE status='draft', so a
    // finalized row causes rowCount=0. Task 14 Step 2 must convert this
    // to a SELECT-then-throw flow so the error is specific.)
    const pool = makePool([
      { rows: [{ id: 'snap-1', status: 'finalized' }], rowCount: 1 }, // SELECT
      { rows: [], rowCount: 0 }  // UPDATE (should not be called)
    ]);
    await expect(
      updateDraftSnapshot(pool as unknown as Pool, { id: 'snap-1', payload: { tampered: true } })
    ).rejects.toThrow(/finalized/i);
    // Assert NO UPDATE query was issued after the SELECT:
    const updateCalls = (pool.query.mock.calls as Array<unknown[]>)
      .filter(([sql]) => /UPDATE\s+document_snapshots/i.test(String(sql)));
    expect(updateCalls).toHaveLength(0);
  });
});

// ===== Task 15 tests =====

describe('amendment chain (supersedesId)', () => {
  const prevRow = {
    id: 'snap-prev',
    source_entity_type: 'purchase_order',
    source_entity_id: 'po-1',
    audience: 'external',
    status: 'finalized'
  };
  void prevRow; // referenced in comments above

  it('createDraftSnapshot rejects supersedesId pointing to different entity', async () => {
    const pool = makePool([
      // SELECT for supersedesId predecessor check
      { rows: [{
        id: 'snap-other', source_entity_type: 'purchase_order',
        source_entity_id: 'po-DIFFERENT', audience: 'external'
      }], rowCount: 1 }
    ]);
    await expect(
      createDraftSnapshot(pool as unknown as Pool, {
        kind: 'purchase_finalization',
        sourceEntityType: 'purchase_order',
        sourceEntityId: 'po-1',
        commandId: 'cmd-1',
        audience: 'external',
        payload: {},
        projectionVersion: 1,
        createdBy: 'user-1',
        supersedesId: 'snap-other'
      })
    ).rejects.toThrow(/same entity and audience/i);
  });

  it('createDraftSnapshot rejects supersedesId pointing to different audience', async () => {
    const pool = makePool([
      { rows: [{
        id: 'snap-int', source_entity_type: 'purchase_order',
        source_entity_id: 'po-1', audience: 'internal'  // different audience
      }], rowCount: 1 }
    ]);
    await expect(
      createDraftSnapshot(pool as unknown as Pool, {
        kind: 'purchase_finalization',
        sourceEntityType: 'purchase_order',
        sourceEntityId: 'po-1',
        commandId: 'cmd-1',
        audience: 'external',
        payload: {},
        projectionVersion: 1,
        createdBy: 'user-1',
        supersedesId: 'snap-int'
      })
    ).rejects.toThrow(/same entity and audience/i);
  });

  it('finalizeSnapshot rejects when no supersedesId but live head already exists', async () => {
    const draftRow = {
      id: 'snap-1',
      kind: 'purchase_finalization',
      source_entity_type: 'purchase_order',
      source_entity_id: 'po-1',
      audience: 'external',
      supersedes_id: null,   // no supersedesId
      status: 'draft',
      content_hash: 'b'.repeat(64)
    };
    const client = makeClient([
      { rows: [] }, // BEGIN
      { rows: [draftRow] }, // SELECT draft FOR UPDATE
      { rows: [{ pg_advisory_xact_lock: '' }] }, // advisory lock
      { rows: [{ id: 'other-live-head' }] }, // live-head SELECT → competing head exists
      { rows: [] } // ROLLBACK
    ]);
    const pool = makePoolWithClient(client);
    await expect(
      finalizeSnapshot(pool as unknown as Pool, { id: 'snap-1', finalizedBy: 'user-1' })
    ).rejects.toThrow(/live snapshot already exists/i);
  });

  it('finalizeSnapshot rejects when supersedesId is stale (live head has changed)', async () => {
    const draftRow = {
      id: 'snap-new',
      kind: 'purchase_finalization',
      source_entity_type: 'purchase_order',
      source_entity_id: 'po-1',
      audience: 'external',
      supersedes_id: 'snap-prev',  // points to predecessor
      status: 'draft',
      content_hash: 'c'.repeat(64)
    };
    const client = makeClient([
      { rows: [] }, // BEGIN
      { rows: [draftRow] }, // SELECT draft FOR UPDATE
      { rows: [{ pg_advisory_xact_lock: '' }] }, // advisory lock
      { rows: [{ id: 'snap-DIFFERENT-head' }] }, // live head is NOT snap-prev
      { rows: [] } // ROLLBACK
    ]);
    const pool = makePoolWithClient(client);
    await expect(
      finalizeSnapshot(pool as unknown as Pool, { id: 'snap-new', finalizedBy: 'user-1' })
    ).rejects.toThrow(/stale/i);
  });

  it('finalizeSnapshot succeeds as amendment when supersedesId matches current live head', async () => {
    const draftRow = {
      id: 'snap-new',
      kind: 'purchase_finalization',
      source_entity_type: 'purchase_order',
      source_entity_id: 'po-1',
      audience: 'external',
      supersedes_id: 'snap-prev',
      status: 'draft',
      content_hash: 'd'.repeat(64)
    };
    const client = makeClient([
      { rows: [] }, // BEGIN
      { rows: [draftRow] }, // SELECT draft FOR UPDATE
      { rows: [{ pg_advisory_xact_lock: '' }] }, // advisory lock
      { rows: [{ id: 'snap-prev' }] }, // live head = snap-prev ✓
      { rows: [{ id: 'snap-new' }], rowCount: 1 }, // UPDATE finalize
      { rows: [] } // COMMIT
    ]);
    const pool = makePoolWithClient(client);
    const result = await finalizeSnapshot(pool as unknown as Pool, { id: 'snap-new', finalizedBy: 'user-1' });
    expect(result.status).toBe('finalized');
    expect(result.id).toBe('snap-new');
  });
});

// ===== Task 16 tests =====

describe('live-head invariant (concurrent finalize simulation)', () => {
  it('two racing finalize attempts for the same entity+audience use IDENTICAL advisory-lock key inputs', async () => {
    // Both finalizers try to finalize a draft for the same (entity, audience).
    // One wins (live head absent), the other loses (live head present after advisory lock).
    const winnerDraft = {
      id: 'snap-winner',
      kind: 'purchase_finalization',
      source_entity_type: 'purchase_order',
      source_entity_id: 'po-1',
      audience: 'external',
      supersedes_id: null,
      status: 'draft',
      content_hash: 'e'.repeat(64)
    };
    const loserDraft = {
      ...winnerDraft,
      id: 'snap-loser',
      content_hash: 'f'.repeat(64)
    };

    const winnerClient = makeClient([
      { rows: [] }, // BEGIN
      { rows: [winnerDraft] }, // SELECT draft FOR UPDATE
      { rows: [{ pg_advisory_xact_lock: '' }] }, // advisory lock
      { rows: [] }, // live-head SELECT: no head → first finalize, proceeds
      { rows: [{ id: 'snap-winner' }], rowCount: 1 }, // UPDATE finalize
      { rows: [] } // COMMIT
    ]);
    const loserClient = makeClient([
      { rows: [] }, // BEGIN
      { rows: [loserDraft] }, // SELECT draft FOR UPDATE
      { rows: [{ pg_advisory_xact_lock: '' }] }, // advisory lock
      { rows: [{ id: 'snap-winner' }] }, // live-head SELECT: winner is now live → loser fails
      { rows: [] } // ROLLBACK
    ]);

    const winnerPool = makePoolWithClient(winnerClient);
    const loserPool = makePoolWithClient(loserClient);

    // Run both in parallel (deterministic mock, no real concurrency).
    const [winnerResult, loserResult] = await Promise.allSettled([
      finalizeSnapshot(winnerPool as unknown as Pool, { id: 'snap-winner', finalizedBy: 'user-1' }),
      finalizeSnapshot(loserPool as unknown as Pool, { id: 'snap-loser', finalizedBy: 'user-1' })
    ]);

    expect(winnerResult.status).toBe('fulfilled');
    expect(loserResult.status).toBe('rejected');
    if (loserResult.status === 'rejected') {
      expect(loserResult.reason.message).toMatch(/live snapshot already exists/i);
    }

    // Both advisory-lock calls use the SAME (source_entity_type, source_entity_id, audience) triple.
    const winnerAdvisory = winnerClient.query.mock.calls.find(([sql]) =>
      /pg_advisory_xact_lock/i.test(String(sql))
    );
    const loserAdvisory = loserClient.query.mock.calls.find(([sql]) =>
      /pg_advisory_xact_lock/i.test(String(sql))
    );
    expect(winnerAdvisory).toBeDefined();
    expect(loserAdvisory).toBeDefined();

    const winnerParams = winnerAdvisory![1] as unknown[];
    const loserParams = loserAdvisory![1] as unknown[];
    // Both use the same entity/audience inputs.
    expect(winnerParams).toContain('purchase_order');
    expect(winnerParams).toContain('po-1');
    expect(winnerParams).toContain('external');
    expect(loserParams).toContain('purchase_order');
    expect(loserParams).toContain('po-1');
    expect(loserParams).toContain('external');
  });

  it('different entity+audience pairs use DIFFERENT advisory-lock key inputs', async () => {
    const draftA = {
      id: 'snap-a',
      kind: 'purchase_finalization',
      source_entity_type: 'purchase_order',
      source_entity_id: 'po-1',
      audience: 'external',
      supersedes_id: null,
      status: 'draft',
      content_hash: 'a'.repeat(64)
    };
    const draftB = {
      ...draftA,
      id: 'snap-b',
      source_entity_id: 'po-2', // different entity
      content_hash: 'b'.repeat(64)
    };

    const clientA = makeClient([
      { rows: [] }, { rows: [draftA] }, { rows: [{ pg_advisory_xact_lock: '' }] },
      { rows: [] }, { rows: [{ id: 'snap-a' }], rowCount: 1 }, { rows: [] }
    ]);
    const clientB = makeClient([
      { rows: [] }, { rows: [draftB] }, { rows: [{ pg_advisory_xact_lock: '' }] },
      { rows: [] }, { rows: [{ id: 'snap-b' }], rowCount: 1 }, { rows: [] }
    ]);
    const poolA = makePoolWithClient(clientA);
    const poolB = makePoolWithClient(clientB);

    await Promise.all([
      finalizeSnapshot(poolA as unknown as Pool, { id: 'snap-a', finalizedBy: 'user-1' }),
      finalizeSnapshot(poolB as unknown as Pool, { id: 'snap-b', finalizedBy: 'user-1' })
    ]);

    const advisoryA = clientA.query.mock.calls.find(([sql]) => /pg_advisory_xact_lock/i.test(String(sql)));
    const advisoryB = clientB.query.mock.calls.find(([sql]) => /pg_advisory_xact_lock/i.test(String(sql)));

    const paramsA = advisoryA![1] as unknown[];
    const paramsB = advisoryB![1] as unknown[];

    // Different entity ids: lock inputs differ.
    expect(paramsA).toContain('po-1');
    expect(paramsB).toContain('po-2');
    // They must NOT both contain the same source_entity_id.
    expect(paramsA.every((p) => paramsB.includes(p))).toBe(false);
  });
});

// ===== Task 17 tests =====

describe('voidSnapshot — lifecycle and idempotency', () => {
  it('voids a draft row with reason abandoned', async () => {
    const pool = makePool([
      { rows: [{ id: 'snap-1', status: 'draft' }] }, // SELECT for precondition
      { rows: [{ id: 'snap-1' }], rowCount: 1 }       // UPDATE
    ]);
    const result = await voidSnapshot(pool as unknown as Pool, {
      id: 'snap-1', voidedBy: 'user-1', reason: 'abandoned'
    });
    expect(result.status).toBe('voided');
    const updateCalls = (pool.query.mock.calls as Array<unknown[]>)
      .filter(([sql]) => /UPDATE\s+document_snapshots[\s\S]+status\s*=\s*'voided'/i.test(String(sql)));
    expect(updateCalls).toHaveLength(1);
  });

  it('voids a finalized row', async () => {
    const pool = makePool([
      { rows: [{ id: 'snap-1', status: 'finalized' }] }, // SELECT
      { rows: [{ id: 'snap-1' }], rowCount: 1 }           // UPDATE
    ]);
    const result = await voidSnapshot(pool as unknown as Pool, {
      id: 'snap-1', voidedBy: 'user-1', reason: 'error'
    });
    expect(result.status).toBe('voided');
  });

  it('throws a loud error on second void (not a silent no-op)', async () => {
    const pool = makePool([
      { rows: [{ id: 'snap-1', status: 'voided' }] }, // SELECT: already voided
    ]);
    await expect(
      voidSnapshot(pool as unknown as Pool, { id: 'snap-1', voidedBy: 'user-1', reason: 'retry' })
    ).rejects.toThrow(/already voided/i);
    // No UPDATE was issued.
    const updateCalls = (pool.query.mock.calls as Array<unknown[]>)
      .filter(([sql]) => /UPDATE\s+document_snapshots[\s\S]+status\s*=\s*'voided'/i.test(String(sql)));
    expect(updateCalls).toHaveLength(0);
  });

  it('throws a clear error when snapshot is not found', async () => {
    const pool = makePool([
      { rows: [], rowCount: 0 }  // SELECT returns nothing
    ]);
    await expect(
      voidSnapshot(pool as unknown as Pool, { id: 'non-existent', voidedBy: 'user-1', reason: 'cleanup' })
    ).rejects.toThrow(/not found/i);
    // No UPDATE issued.
    const updateCalls = (pool.query.mock.calls as Array<unknown[]>)
      .filter(([sql]) => /UPDATE\s+document_snapshots[\s\S]+status\s*=\s*'voided'/i.test(String(sql)));
    expect(updateCalls).toHaveLength(0);
  });
});

// ===== Task 18 tests =====

describe('no-backfill behavior', () => {
  it('getExternalReceipt returns null with no fallback query when no snapshot exists', async () => {
    const pool = makePool([
      { rows: [], rowCount: 0 } // document_snapshots SELECT returns nothing
    ]);
    const result = await getExternalReceipt(pool as unknown as Pool, 'purchase_order', 'po-missing');
    expect(result).toBeNull();
    // Only ONE query was issued (no fallback to purchase_orders table).
    expect(pool.query).toHaveBeenCalledTimes(1);
    const sql = String((pool.query.mock.calls[0] as unknown[])[0]);
    expect(sql).toMatch(/document_snapshots/i);
    expect(sql).not.toMatch(/purchase_orders/i);
  });

  it('getInternalReceipt returns null with no fallback query when no snapshot exists', async () => {
    const managerUser = { id: 'u-manager', role: 'manager' } as unknown as import('../../shared/types').SessionUser;
    const pool = makePool([
      { rows: [], rowCount: 0 }
    ]);
    const result = await getInternalReceipt(pool as unknown as Pool, managerUser, 'purchase_order', 'po-missing');
    expect(result).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
    const sql = String((pool.query.mock.calls[0] as unknown[])[0]);
    expect(sql).toMatch(/document_snapshots/i);
    expect(sql).not.toMatch(/purchase_orders/i);
  });
});

// ===== Task 11 tests =====

describe('renderSignalText', () => {
  const extFixture: ExternalReceiptProjection = {
    kind: 'purchase_finalization',
    header: { title: 'Purchase Order', counterparty: 'Vendor A', dateISO: '2026-05-20', documentNo: 'PO-1' },
    lines: [{ name: 'Widget', qty: 10, unitPrice: 5, subtotal: 50, notes: 'Grade A' }],
    totals: { subtotal: 50, total: 50 },
    footer: { terms: 'Net 30' },
    projectionVersion: 1,
    __EXTERNAL_PROJECTED__: true
  };

  it('returns a non-empty plain-text string', () => {
    const out = renderSignalText(extFixture);
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/<[^>]+>/);
    expect(out).not.toMatch(/<script|<style|on\w+=/i);
  });

  it('is deterministic across repeated invocations (byte-stable)', () => {
    const a = renderSignalText(extFixture);
    const b = renderSignalText(extFixture);
    expect(a).toBe(b);
  });

  it('does not call any banned non-deterministic or locale-sensitive API', () => {
    const dateNow = vi.spyOn(Date, 'now');
    const mathRandom = vi.spyOn(Math, 'random');
    const numberFmt = vi.spyOn(Intl, 'NumberFormat');
    const dateTimeFmt = vi.spyOn(Intl, 'DateTimeFormat');
    const numToLocale = vi.spyOn(Number.prototype, 'toLocaleString');
    const dateToLocale = vi.spyOn(Date.prototype, 'toLocaleString');

    renderSignalText(extFixture);

    expect(dateNow).not.toHaveBeenCalled();
    expect(mathRandom).not.toHaveBeenCalled();
    expect(numberFmt).not.toHaveBeenCalled();
    expect(dateTimeFmt).not.toHaveBeenCalled();
    expect(numToLocale).not.toHaveBeenCalled();
    expect(dateToLocale).not.toHaveBeenCalled();
  });

  it('is a pure function of its argument (no ambient input)', () => {
    const fixA = JSON.parse(JSON.stringify(extFixture)) as ExternalReceiptProjection & { __EXTERNAL_PROJECTED__: true };
    const fixB = JSON.parse(JSON.stringify(extFixture)) as ExternalReceiptProjection & { __EXTERNAL_PROJECTED__: true };
    expect(renderSignalText(fixA)).toBe(renderSignalText(fixB));
  });
});

// ===== Task 12 tests =====

describe('renderPrintHtml', () => {
  const extFixture: ExternalReceiptProjection = {
    kind: 'purchase_finalization',
    header: { title: 'Purchase Order', counterparty: 'Vendor A', dateISO: '2026-05-20', documentNo: 'PO-1' },
    lines: [{ name: 'Widget', qty: 10, unitPrice: 5, subtotal: 50, notes: 'Grade A' }],
    totals: { subtotal: 50, total: 50 },
    projectionVersion: 1,
    __EXTERNAL_PROJECTED__: true
  };

  it('emits a well-formed document fragment', () => {
    const html = renderPrintHtml(extFixture);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('</html>');
  });

  it('escapes <, >, &, ", \' in user-supplied notes', () => {
    const fixture = { ...extFixture, lines: [{ name: 'Widget', qty: 1, subtotal: 50,
      notes: `<script>alert('x')</script> & "evil"` }] };
    const html = renderPrintHtml(fixture);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/on\w+=/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&#39;');
  });
});
