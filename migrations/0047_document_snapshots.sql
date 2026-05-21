-- Issue #113: Finalization Receipts — shared document_snapshots foundation.
-- See docs/roadmap/2026-finalization-receipts-roadmap.md §4.1.

CREATE TABLE IF NOT EXISTS document_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type varchar(32) NOT NULL,
  subject_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status varchar(16) NOT NULL DEFAULT 'finalized',
  internal_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  projection_version integer NOT NULL DEFAULT 1,
  generated_by_command_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_snapshots_status_chk
    CHECK (status IN ('draft', 'finalized', 'superseded', 'void')),
  CONSTRAINT document_snapshots_document_type_chk
    CHECK (document_type IN ('purchase_order', 'sales_order', 'customer_payment', 'vendor_payout'))
);

CREATE INDEX IF NOT EXISTS document_snapshots_type_subject_idx
  ON document_snapshots (document_type, subject_id);

CREATE INDEX IF NOT EXISTS document_snapshots_subject_version_idx
  ON document_snapshots (subject_id, version DESC);

CREATE INDEX IF NOT EXISTS document_snapshots_status_type_idx
  ON document_snapshots (status, document_type);

-- Unique index: (document_type, subject_id, version) must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS document_snapshots_type_subject_version_unique
  ON document_snapshots (document_type, subject_id, version);

-- Partial unique index: at most ONE active (draft|finalized) snapshot per
-- (document_type, subject_id). This is the structural enforcement of the
-- Tranche 1 "no draft+finalized coexistence" invariant.
CREATE UNIQUE INDEX IF NOT EXISTS document_snapshots_active_unique
  ON document_snapshots (document_type, subject_id)
  WHERE status IN ('draft', 'finalized');
