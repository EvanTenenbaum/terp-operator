import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Audience, SnapshotKind, SourceEntityType } from './projections/types';
import type { ExternalReceiptProjection, InternalReceiptProjection } from './projections/types';
import { validateExternalShape, validateInternalShape } from './projections';
import { assertRole } from '../rbac';
import type { SessionUser } from '../../shared/types';

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(canonValue(value));
}

function canonValue(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value === 'undefined') {
    throw new Error('canonicalizeJson: undefined is not representable');
  }
  if (typeof value === 'function') {
    throw new Error('canonicalizeJson: functions are not representable');
  }
  if (Array.isArray(value)) return value.map(canonValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = canonValue((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function hashSnapshot(value: unknown): string {
  return createHash('sha256').update(canonicalizeJson(value)).digest('hex');
}

/* ----------------------------------------------------------------------
 * Task 6 — service lifecycle: draft → finalize → (void deferred to T17).
 *
 * Design notes (spec §5 / §7 Option B, plan Task 6):
 *
 *   • One row per (entity, audience) finalize. snapshot_json is already
 *     audience-projected on write — there is no "filter on read".
 *
 *   • createDraftSnapshot / updateDraftSnapshot run as single-statement
 *     ops via `pool.query`. updateDraftSnapshot is scoped WHERE
 *     status='draft' (the immutability guard for already-finalized rows
 *     lands in Task 14 with the SELECT-then-throw flow; Task 6 ships the
 *     load-bearing WHERE clause).
 *
 *   • finalizeSnapshot owns the live-head invariant. It uses ONE
 *     pg `PoolClient` for BEGIN/COMMIT and combines two locks:
 *
 *       0a. SELECT … FOR UPDATE on the draft. Locks the draft row AND
 *           sources the (source_entity_type, source_entity_id, audience)
 *           triple that keys the advisory lock in 0b. This MUST run
 *           before 0b because 0b consumes those values.
 *
 *       0b. pg_advisory_xact_lock keyed on
 *               hashtextextended(
 *                 source_entity_type || ':' || source_entity_id::text
 *                                    || ':' || audience,
 *                 0
 *               )
 *           This is the LOAD-BEARING serializer for the absent-row case
 *           (first finalize for an (entity, audience), where no
 *           predecessor exists to FOR UPDATE). Two concurrent first-
 *           finalize attempts for the same (entity, audience) take the
 *           identical lock-key inputs and serialize.
 *
 *       2.  SELECT … FOR UPDATE for the current live head ("finalized,
 *           not voided, not superseded").
 *
 *       3.  Service-level recheck. Two failure modes:
 *             a. supersedesId IS NULL and a live head exists →
 *                "a live snapshot already exists for this entity and
 *                 audience; finalize as an amendment (supersedesId)
 *                 instead."
 *             b. supersedesId IS NOT NULL and either no live head exists
 *                or it does not match supersedesId →
 *                "amendment predecessor is stale; refresh and retry."
 *
 *       4.  UPDATE the draft to status='finalized', set finalized_by /
 *           finalized_at = now(). The predecessor (if any) is NOT voided
 *           — it remains status='finalized' but ceases to be live because
 *           its id now appears in the set of supersedes_id values.
 *
 *     The transaction commits, releasing the advisory lock. On any error
 *     above, the transaction is rolled back and the error is rethrown.
 *
 *   • The DB still carries a partial unique index on (entity, audience,
 *     content_hash) for finalized rows. A 23505 from that index is a
 *     separate, legitimate guard against finalizing identical bytes and
 *     is mapped to its own clear message.
 * ---------------------------------------------------------------------- */

export interface CreateDraftInput {
  kind: SnapshotKind;
  sourceEntityType: SourceEntityType;
  sourceEntityId: string;
  commandId: string;
  audience: Audience;
  payload: Record<string, unknown>;
  projectionVersion: number;
  createdBy: string;
  supersedesId?: string;
}

interface DraftRow {
  id: string;
  kind: string;
  source_entity_type: string;
  source_entity_id: string;
  audience: string;
  supersedes_id: string | null;
  status: string;
  content_hash: string;
}

interface LiveHeadRow {
  id: string;
}

export async function createDraftSnapshot(
  pool: Pool,
  input: CreateDraftInput
): Promise<{ id: string; contentHash: string }> {
  if (!input.commandId) {
    throw new Error('createDraftSnapshot: commandId is required');
  }
  // Task 15: predecessor check — supersedesId must point to a snapshot with
  // the same (sourceEntityType, sourceEntityId, audience).
  if (input.supersedesId) {
    const predRes = await pool.query(
      `SELECT source_entity_type, source_entity_id, audience FROM document_snapshots WHERE id = $1`,
      [input.supersedesId]
    );
    const pred = predRes.rows[0] as {
      source_entity_type: string; source_entity_id: string; audience: string
    } | undefined;
    if (!pred) throw new Error('supersedesId points to a non-existent snapshot');
    if (
      pred.source_entity_type !== input.sourceEntityType ||
      pred.source_entity_id !== input.sourceEntityId ||
      pred.audience !== input.audience
    ) {
      throw new Error('supersedesId must point to a snapshot with the same entity and audience');
    }
  }
  const contentHash = hashSnapshot(input.payload);
  const res = await pool.query(
    `INSERT INTO document_snapshots (
       kind, source_entity_type, source_entity_id, command_id,
       status, audience, snapshot_json, projection_version,
       content_hash, supersedes_id, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      input.kind,
      input.sourceEntityType,
      input.sourceEntityId,
      input.commandId,
      'draft',
      input.audience,
      input.payload,
      input.projectionVersion,
      contentHash,
      input.supersedesId ?? null,
      input.createdBy
    ]
  );
  const id = (res.rows[0] as { id: string }).id;
  return { id, contentHash };
}

export async function updateDraftSnapshot(
  pool: Pool,
  input: { id: string; payload: Record<string, unknown> }
): Promise<{ id: string; contentHash: string }> {
  // Task 14: SELECT-then-throw: explicit status check before UPDATE.
  const checkRes = await pool.query(
    `SELECT id, status FROM document_snapshots WHERE id = $1`,
    [input.id]
  );
  const row = checkRes.rows[0] as { id: string; status: string } | undefined;
  if (!row) {
    throw new Error('updateDraftSnapshot: snapshot not found');
  }
  if (row.status !== 'draft') {
    throw new Error(`updateDraftSnapshot: cannot update a ${row.status} snapshot`);
  }
  const contentHash = hashSnapshot(input.payload);
  const updateRes = await pool.query(
    `UPDATE document_snapshots
        SET snapshot_json = $1, content_hash = $2
      WHERE id = $3 AND status = 'draft'`,
    [input.payload, contentHash, input.id]
  );
  if ((updateRes.rowCount ?? 0) === 0) {
    throw new Error('updateDraftSnapshot: concurrent state change — snapshot was modified between check and update');
  }
  return { id: input.id, contentHash };
}

export async function finalizeSnapshot(
  pool: Pool,
  input: { id: string; finalizedBy: string }
): Promise<{ id: string; status: 'finalized'; contentHash: string }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0a. Lock the draft row; verify status='draft'. The values of
    //     (source_entity_type, source_entity_id, audience) read here
    //     are the inputs to the advisory-lock key in step 0b.
    const draftRes = await client.query(
      `SELECT id,
              kind,
              source_entity_type,
              source_entity_id,
              audience,
              supersedes_id,
              status,
              content_hash
         FROM document_snapshots
        WHERE id = $1
        FOR UPDATE`,
      [input.id]
    );
    if (draftRes.rows.length === 0) {
      throw new Error('finalizeSnapshot: snapshot not found');
    }
    const draft = draftRes.rows[0] as DraftRow;
    if (draft.status !== 'draft') {
      throw new Error(
        `finalizeSnapshot: snapshot is not a draft (status=${draft.status})`
      );
    }

    // 0b. Per-(entity, audience) transaction-scoped advisory lock.
    //     This is the load-bearing serializer for the absent-row case.
    //     The lock releases on COMMIT / ROLLBACK.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended(
         $1::text || ':' || $2::text || ':' || $3::text,
         0
       ))`,
      [draft.source_entity_type, draft.source_entity_id, draft.audience]
    );

    // 2. Find current live head, locking it if present.
    const liveRes = await client.query(
      `SELECT id
         FROM document_snapshots
        WHERE source_entity_type = $1
          AND source_entity_id   = $2
          AND audience           = $3
          AND status = 'finalized'
          AND voided_at IS NULL
          AND id NOT IN (
            SELECT supersedes_id FROM document_snapshots
             WHERE supersedes_id IS NOT NULL
          )
        FOR UPDATE`,
      [draft.source_entity_type, draft.source_entity_id, draft.audience]
    );
    const liveHead = liveRes.rows[0] as LiveHeadRow | undefined;

    // 3. Recheck rules.
    if (!draft.supersedes_id && liveHead) {
      throw new Error(
        'a live snapshot already exists for this entity and audience; finalize as an amendment (supersedesId) instead.'
      );
    }
    if (draft.supersedes_id) {
      if (!liveHead || liveHead.id !== draft.supersedes_id) {
        throw new Error('amendment predecessor is stale; refresh and retry.');
      }
    }

    // 4. Finalize the draft. Predecessor (if any) stays status='finalized'
    //    and is no longer live because its id is now in the supersedes_id
    //    set excluded by the live-head SELECT.
    try {
      await client.query(
        `UPDATE document_snapshots
            SET status = 'finalized',
                finalized_by = $1,
                finalized_at = now()
          WHERE id = $2 AND status = 'draft'`,
        [input.finalizedBy, input.id]
      );
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string };
      if (
        e?.code === '23505' &&
        /document_snapshots_finalized_content_unique/.test(e?.constraint ?? '')
      ) {
        throw new Error(
          'A snapshot with identical content has already been finalized for this entity and audience.'
        );
      }
      throw err;
    }

    await client.query('COMMIT');
    return { id: input.id, status: 'finalized', contentHash: draft.content_hash };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* swallow secondary ROLLBACK error so the original failure surfaces */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Task 17: SELECT-then-throw lifecycle with distinct "not found" vs
 * "already voided" errors. Throws loudly on a second void attempt
 * (no silent no-op).
 */
export async function voidSnapshot(
  pool: Pool,
  input: { id: string; voidedBy: string; reason: string }
): Promise<{ id: string; status: 'voided' }> {
  // SELECT-then-throw: distinguish "not found" from "already voided".
  const checkRes = await pool.query(
    `SELECT id, status FROM document_snapshots WHERE id = $1`,
    [input.id]
  );
  const row = checkRes.rows[0] as { id: string; status: string } | undefined;
  if (!row) throw new Error('voidSnapshot: snapshot not found');
  if (row.status === 'voided') throw new Error('voidSnapshot: snapshot is already voided');
  // void input.reason — accepted for future use
  void input.reason;
  const updateRes = await pool.query(
    `UPDATE document_snapshots
        SET status = 'voided',
            voided_by = $1,
            voided_at = now()
      WHERE id = $2 AND status IN ('draft', 'finalized')`,
    [input.voidedBy, input.id]
  );
  if ((updateRes.rowCount ?? 0) === 0) {
    throw new Error('voidSnapshot: concurrent state change — snapshot was modified between check and update');
  }
  return { id: input.id, status: 'voided' };
}

/* ----------------------------------------------------------------------
 * Task 7 — read-path loaders for document snapshots.
 *
 * Design notes:
 *
 *   • selectLiveRow runs a single explicit-column SELECT to find the one
 *     live head for a (sourceEntityType, sourceEntityId, audience) triple.
 *     "Live head" = finalized, not voided, not superseded by another row.
 *
 *   • getExternalReceipt / getInternalReceipt are the public surface.
 *     They call selectLiveRow, validate the shape from disk (rejecting
 *     unknown or banned witness keys), and re-apply the in-memory
 *     witness brand (__EXTERNAL_PROJECTED__ / __INTERNAL_ONLY__) to the
 *     return value. The witness keys are never stored on disk.
 *
 *   • getInternalReceipt calls assertRole(user, 'manager') BEFORE any
 *     DB read so unauthorized users never cause a DB round-trip.
 * ---------------------------------------------------------------------- */

interface LiveSnapshotRow {
  id: string;
  kind: string;
  snapshot_json: unknown;
}

async function selectLiveRow(
  pool: Pool,
  sourceEntityType: SourceEntityType,
  sourceEntityId: string,
  audience: Audience
): Promise<LiveSnapshotRow | null> {
  const res = await pool.query(
    `SELECT id,
            kind,
            source_entity_type,
            source_entity_id,
            command_id,
            status,
            audience,
            snapshot_json,
            projection_version,
            content_hash,
            supersedes_id,
            created_by,
            finalized_by,
            voided_by,
            created_at,
            finalized_at,
            voided_at
       FROM document_snapshots
      WHERE source_entity_type = $1
        AND source_entity_id   = $2
        AND audience           = $3
        AND status = 'finalized'
        AND voided_at IS NULL
        AND id NOT IN (
          SELECT supersedes_id FROM document_snapshots
           WHERE supersedes_id IS NOT NULL
        )
      LIMIT 1`,
    [sourceEntityType, sourceEntityId, audience]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0] as LiveSnapshotRow;
}

export async function getExternalReceipt(
  pool: Pool,
  sourceEntityType: SourceEntityType,
  sourceEntityId: string
): Promise<ExternalReceiptProjection | null> {
  const row = await selectLiveRow(pool, sourceEntityType, sourceEntityId, 'external');
  if (!row) return null;
  validateExternalShape(row.snapshot_json, row.kind as SnapshotKind);
  return {
    ...(row.snapshot_json as Omit<ExternalReceiptProjection, '__EXTERNAL_PROJECTED__'>),
    __EXTERNAL_PROJECTED__: true as const
  };
}

export async function getInternalReceipt(
  pool: Pool,
  user: SessionUser | null,
  sourceEntityType: SourceEntityType,
  sourceEntityId: string
): Promise<InternalReceiptProjection | null> {
  assertRole(user, 'manager');
  const row = await selectLiveRow(pool, sourceEntityType, sourceEntityId, 'internal');
  if (!row) return null;
  validateInternalShape(row.snapshot_json, row.kind as SnapshotKind);
  return {
    ...(row.snapshot_json as Omit<InternalReceiptProjection, '__INTERNAL_ONLY__'>),
    __INTERNAL_ONLY__: true as const
  };
}

/* ----------------------------------------------------------------------
 * Task 11 — renderSignalText
 *
 * Renders an ExternalReceiptProjection to a plain-text signal string.
 * Pure function: no Date.now(), Math.random(), Intl, or toLocaleString.
 * ---------------------------------------------------------------------- */

export function renderSignalText(p: ExternalReceiptProjection): string {
  const lines: string[] = [];
  lines.push(`${p.header.title} ${p.header.documentNo}`);
  lines.push(`To: ${p.header.counterparty}`);
  lines.push(`Date: ${p.header.dateISO}`);
  lines.push('');
  for (const l of p.lines) {
    lines.push(`- ${l.name} x ${l.qty} @ ${l.unitPrice ?? '-'} = ${l.subtotal}`);
    if (l.notes) lines.push(`    ${l.notes}`);
  }
  lines.push('');
  lines.push(`Subtotal: ${p.totals.subtotal}`);
  if (p.totals.adjustments != null) lines.push(`Adjustments: ${p.totals.adjustments}`);
  lines.push(`Total: ${p.totals.total}`);
  if (p.footer?.terms) lines.push(`Terms: ${p.footer.terms}`);
  if (p.footer?.reference) lines.push(`Ref: ${p.footer.reference}`);
  return lines.join('\n');
}

/* ----------------------------------------------------------------------
 * Task 12 — renderPrintHtml
 *
 * Renders an ExternalReceiptProjection or InternalReceiptProjection to a
 * minimal but well-formed HTML document. All user-supplied strings are
 * HTML-escaped via esc() to prevent XSS.
 * ---------------------------------------------------------------------- */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderPrintHtml(
  p: ExternalReceiptProjection | InternalReceiptProjection
): string {
  const isInternal = '__INTERNAL_ONLY__' in p && p.__INTERNAL_ONLY__ === true;
  const watermark = isInternal
    ? `<div data-testid="watermark" style="position:fixed;top:40%;left:0;width:100%;text-align:center;font-size:3em;color:rgba(200,0,0,0.18);transform:rotate(-30deg);pointer-events:none;z-index:1000;font-weight:bold;letter-spacing:0.2em">INTERNAL — DO NOT SEND</div>`
    : '';
  const lineRows = p.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.name)}</td><td>${l.qty}</td><td>${l.subtotal}</td>` +
        `<td>${l.notes ? esc(l.notes) : ''}</td></tr>`
    )
    .join('');
  return (
    `<!doctype html><html><head><title>${esc(p.header.title)}</title></head>` +
    `<body>${watermark}<h1>${esc(p.header.title)} ${esc(p.header.documentNo)}</h1>` +
    `<p>To: ${esc(p.header.counterparty)} — ${esc(p.header.dateISO)}</p>` +
    `<table>${lineRows}</table>` +
    `<p>Total: ${p.totals.total}</p>` +
    `</body></html>`
  );
}
