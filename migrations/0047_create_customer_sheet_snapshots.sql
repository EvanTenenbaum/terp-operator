-- Issue #62: persist customer sheet snapshots so operators can revisit prior
-- sent sheets from the Sales workspace and add items back to the current draft.
--
-- Snapshot rows are stored as JSONB sanitized by
-- src/shared/customerSheetSnapshot.ts. Customer-facing snapshots
-- (mode = 'catalog') must NEVER contain unitCost, estimatedMargin,
-- internalMargin, or other internal-only operator data — that rule is
-- enforced in app code and covered by the regression tests in
-- src/shared/customerSheetSnapshot.test.ts.

CREATE TABLE IF NOT EXISTS customer_sheet_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  mode varchar(16) NOT NULL CHECK (mode IN ('internal', 'catalog')),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name varchar(180),
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  rows_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_sheet_snapshots_rows_is_array CHECK (jsonb_typeof(rows_json) = 'array')
);

CREATE INDEX IF NOT EXISTS customer_sheet_snapshots_customer_created_idx
  ON customer_sheet_snapshots (customer_id, created_at DESC);

COMMENT ON TABLE customer_sheet_snapshots IS
  'Persisted customer-facing/internal sales sheet snapshots (#62). rows_json is sanitized client/server-side per src/shared/customerSheetSnapshot.ts.';
COMMENT ON COLUMN customer_sheet_snapshots.mode IS
  'internal = operator sheet (may include cost/margin); catalog = customer-facing (must NEVER include cost/margin).';
