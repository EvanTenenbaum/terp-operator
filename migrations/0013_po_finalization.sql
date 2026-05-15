-- Feature 5: PO Finalization Workflow
-- Add finalization tracking and separate internal/external notes

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_notes text;

ALTER TABLE purchase_order_lines
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS external_notes text;
