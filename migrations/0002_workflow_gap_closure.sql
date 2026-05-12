ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS source_code varchar(120),
  ADD COLUMN IF NOT EXISTS intake_date timestamptz,
  ADD COLUMN IF NOT EXISTS ticket_cost numeric(12, 2),
  ADD COLUMN IF NOT EXISTS price_range varchar(120),
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE sales_order_lines
  ADD COLUMN IF NOT EXISTS source_row_key varchar(180);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS location_bucket varchar(120),
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE pick_lists
  ADD COLUMN IF NOT EXISTS units_per_bag integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tracking text;

ALTER TABLE connector_requests
  ADD COLUMN IF NOT EXISTS operator_notes text;

ALTER TABLE command_journal
  ADD COLUMN IF NOT EXISTS input_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
