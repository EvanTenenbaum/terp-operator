-- Staging-compat guard: if a pre-Phase-1 document_snapshots table already
-- exists (from migration 0050 which used an old schema without source_entity_type),
-- drop it first so this migration can create the Phase 1 schema cleanly.
-- The table has 0 rows in all environments at this point.
DROP TABLE IF EXISTS document_snapshots CASCADE;

-- Issue #113 Phase 1 — Finalization receipts shared snapshot foundation.
--
-- Audience-projected, immutable, audit-trailed rendered artifacts of
-- finalization records. One row per (source_entity, audience, finalize)
-- combination. snapshot_json is already audience-projected at write time —
-- an `external` row never contains internal-only fields on disk.
--
-- Live-head uniqueness (at most one finalized + not-voided + not-superseded
-- row per (source_entity_type, source_entity_id, audience)) is enforced
-- by the service layer inside `finalizeSnapshot` (spec §7 Option B). Two
-- locks combine inside that transaction to serialize the invariant:
--   * A transaction-scoped pg_advisory_xact_lock advisory lock keyed on
--       hashtextextended(source_entity_type || ':' || source_entity_id::text
--                        || ':' || audience, 0)
--     is taken BEFORE the live-head SELECT. This is the load-bearing
--     serializer for the ABSENT-ROW case: the first finalize for an
--     (entity, audience) pair, where there is no predecessor row to lock.
--     All finalize attempts for the same (entity, audience) contend for
--     the identical advisory-lock key. The lock auto-releases on
--     COMMIT / ROLLBACK.
--   * FOR UPDATE on the predecessor row (when the draft has supersedes_id)
--     covers amendment ROW STABILITY only — it stops the predecessor row
--     state from drifting between the live-head SELECT and the finalize
--     UPDATE. The predecessor FOR UPDATE alone does NOT cover the
--     first-finalize race; the advisory lock is required for that path.
--
-- This migration deliberately does NOT create a DB-level partial unique
-- index on the live-head shape, because "not superseded" cannot be
-- expressed cleanly against the same table from a partial-index WHERE
-- clause, and a finalized-and-not-voided-only index would incorrectly
-- reject legitimate amendments where the predecessor is still finalized
-- at finalize time.

CREATE TABLE IF NOT EXISTS document_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(32) NOT NULL,
  source_entity_type VARCHAR(32) NOT NULL,
  source_entity_id UUID NOT NULL,
  command_id UUID NOT NULL REFERENCES command_journal(id),
  status VARCHAR(16) NOT NULL,
  audience VARCHAR(16) NOT NULL,
  snapshot_json JSONB NOT NULL,
  projection_version INTEGER NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  supersedes_id UUID REFERENCES document_snapshots(id),
  created_by UUID REFERENCES users(id),
  finalized_by UUID REFERENCES users(id),
  voided_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  CONSTRAINT document_snapshots_kind_check CHECK (kind IN (
    'purchase_finalization','sales_confirmation','invoice',
    'payment_received','vendor_payout'
  )),
  CONSTRAINT document_snapshots_audience_check CHECK (audience IN ('external','internal')),
  CONSTRAINT document_snapshots_status_check CHECK (status IN ('draft','finalized','voided')),
  CONSTRAINT document_snapshots_source_entity_type_check CHECK (source_entity_type IN (
    'purchase_order','sales_order','invoice','payment','vendor_payment'
  )),
  CONSTRAINT document_snapshots_finalized_actor_check CHECK (
    (status <> 'finalized') OR (finalized_by IS NOT NULL AND finalized_at IS NOT NULL)
  ),
  CONSTRAINT document_snapshots_voided_actor_check CHECK (
    (status <> 'voided') OR (voided_by IS NOT NULL AND voided_at IS NOT NULL)
  )
);

-- Read path: "give me the (external|internal) snapshot for this entity".
CREATE INDEX IF NOT EXISTS document_snapshots_entity_idx
  ON document_snapshots (source_entity_type, source_entity_id, audience, status);

-- Walk back to the journaled command.
CREATE INDEX IF NOT EXISTS document_snapshots_command_idx
  ON document_snapshots (command_id);

-- Amendment chain navigation.
CREATE INDEX IF NOT EXISTS document_snapshots_supersedes_idx
  ON document_snapshots (supersedes_id);

-- De-dupe by content_hash *within* an entity+audience scope, for finalized
-- rows only. Cross-entity collisions are deliberately allowed (different POs
-- can legitimately hash to identical external payloads if the content is
-- identical). This is the only partial unique index in the schema — the
-- live-head invariant is service-enforced (see header comment + Task 6).
CREATE UNIQUE INDEX IF NOT EXISTS document_snapshots_finalized_content_unique
  ON document_snapshots (source_entity_type, source_entity_id, audience, content_hash)
  WHERE status = 'finalized';
