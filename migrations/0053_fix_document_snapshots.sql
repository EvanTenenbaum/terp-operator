-- Issue #113 fix — drop the stale document_snapshots table that predated
-- the Phase 1 schema and recreate with the correct Phase 1 schema.
--
-- The existing table was created by legacy code with a different column layout
-- (document_type, subject_id, internal_payload, external_payload, version,
-- generated_by_command_id) and was left untouched by the CREATE TABLE IF NOT
-- EXISTS in 0047_document_snapshots.sql.  The table has 0 rows in all
-- environments where this migration is needed, so the DROP is safe.

DROP TABLE IF EXISTS document_snapshots CASCADE;

CREATE TABLE document_snapshots (
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

CREATE INDEX document_snapshots_entity_idx
  ON document_snapshots (source_entity_type, source_entity_id, audience, status);

CREATE INDEX document_snapshots_command_idx
  ON document_snapshots (command_id);

CREATE INDEX document_snapshots_supersedes_idx
  ON document_snapshots (supersedes_id);

CREATE UNIQUE INDEX document_snapshots_finalized_content_unique
  ON document_snapshots (source_entity_type, source_entity_id, audience, content_hash)
  WHERE status = 'finalized';
