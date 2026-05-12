ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS legacy_marker varchar(120),
  ADD COLUMN IF NOT EXISTS arrival_status varchar(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS media_status varchar(32) NOT NULL DEFAULT 'open';

UPDATE batches
SET
  legacy_marker = COALESCE(legacy_marker, NULLIF(ownership_status, 'UNKNOWN')),
  arrival_status = CASE WHEN arrival_confirmed THEN 'arrived' ELSE arrival_status END
WHERE legacy_marker IS NULL OR arrival_status = 'pending';

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS packed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inventory_posted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_followup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_status_markers varchar(180),
  ADD COLUMN IF NOT EXISTS validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE sales_order_lines
  ADD COLUMN IF NOT EXISTS unresolved_source_text varchar(180),
  ADD COLUMN IF NOT EXISTS legacy_status_marker varchar(80),
  ADD COLUMN IF NOT EXISTS packed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inventory_posted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_followup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE sales_order_lines
SET inventory_posted = true
WHERE status = 'posted';

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS direction varchar(32) NOT NULL DEFAULT 'money_in',
  ADD COLUMN IF NOT EXISTS category varchar(80) NOT NULL DEFAULT 'client_payment',
  ADD COLUMN IF NOT EXISTS allocation_intent varchar(80) NOT NULL DEFAULT 'fifo',
  ADD COLUMN IF NOT EXISTS impact_preview text;

ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS due_reason text;

UPDATE vendor_bills
SET due_reason = CASE
  WHEN consignment_triggered THEN 'Due because consigned inventory depleted'
  WHEN scheduled_for IS NOT NULL THEN 'Scheduled payment event exists'
  WHEN status = 'approved' THEN 'Approved vendor payable'
  WHEN status = 'partial' THEN 'Partially paid vendor payable'
  ELSE 'Net terms payable'
END
WHERE due_reason IS NULL;

ALTER TABLE connector_requests
  ADD COLUMN IF NOT EXISTS safety_note text NOT NULL DEFAULT 'No ledger change until an operator posts the routed row.';

ALTER TABLE photography_queue
  ADD COLUMN IF NOT EXISTS notes text;
