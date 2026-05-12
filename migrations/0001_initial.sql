CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  email varchar(240) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role varchar(32) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  terms_days integer NOT NULL DEFAULT 14,
  consignment_default boolean NOT NULL DEFAULT false,
  contact text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  credit_limit numeric(12, 2) NOT NULL DEFAULT 0,
  balance numeric(12, 2) NOT NULL DEFAULT 0,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku varchar(80) NOT NULL UNIQUE,
  name varchar(180) NOT NULL,
  category varchar(80) NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  pricing_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  batch_code varchar(80) NOT NULL UNIQUE,
  shorthand varchar(120),
  name varchar(180) NOT NULL,
  category varchar(80) NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  intake_qty numeric(12, 3) NOT NULL DEFAULT 0,
  available_qty numeric(12, 3) NOT NULL DEFAULT 0,
  reserved_qty numeric(12, 3) NOT NULL DEFAULT 0,
  uom varchar(24) NOT NULL DEFAULT 'lb',
  unit_cost numeric(12, 2) NOT NULL DEFAULT 0,
  unit_price numeric(12, 2) NOT NULL DEFAULT 0,
  location varchar(120) NOT NULL DEFAULT 'vault',
  lot_code varchar(120),
  expiration_date timestamptz,
  ownership_status varchar(16) NOT NULL DEFAULT 'UNKNOWN',
  arrival_confirmed boolean NOT NULL DEFAULT false,
  status varchar(32) NOT NULL DEFAULT 'draft',
  photo_url text,
  posted_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS batches_status_idx ON batches(status);
CREATE INDEX IF NOT EXISTS batches_vendor_idx ON batches(vendor_id);
CREATE INDEX IF NOT EXISTS batches_category_idx ON batches(category);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  command_id uuid,
  kind varchar(48) NOT NULL,
  qty_delta numeric(12, 3) NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no varchar(80) NOT NULL UNIQUE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  status varchar(32) NOT NULL DEFAULT 'posted',
  total numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  qty numeric(12, 3) NOT NULL,
  unit_cost numeric(12, 2) NOT NULL,
  subtotal numeric(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no varchar(80) NOT NULL UNIQUE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  status varchar(32) NOT NULL DEFAULT 'draft',
  pricing_strategy varchar(80) NOT NULL DEFAULT 'standard',
  internal_margin numeric(12, 2) NOT NULL DEFAULT 0,
  total numeric(12, 2) NOT NULL DEFAULT 0,
  delivery_window text,
  posted_at timestamptz,
  fulfilled_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES batches(id) ON DELETE SET NULL,
  item_name varchar(180) NOT NULL,
  qty numeric(12, 3) NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  unit_cost numeric(12, 2) NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no varchar(80) NOT NULL UNIQUE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL,
  status varchar(32) NOT NULL DEFAULT 'open',
  total numeric(12, 2) NOT NULL,
  amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  due_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  method varchar(32) NOT NULL,
  amount numeric(12, 2) NOT NULL,
  unapplied_amount numeric(12, 2) NOT NULL DEFAULT 0,
  reference varchar(180),
  status varchar(32) NOT NULL DEFAULT 'posted',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  purchase_receipt_id uuid REFERENCES purchase_receipts(id) ON DELETE SET NULL,
  bill_no varchar(80) NOT NULL UNIQUE,
  amount numeric(12, 2) NOT NULL,
  amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  due_date timestamptz NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'open',
  scheduled_for timestamptz,
  terms_days integer NOT NULL DEFAULT 14,
  consignment_triggered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_bill_id uuid NOT NULL REFERENCES vendor_bills(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  method varchar(32) NOT NULL DEFAULT 'cash',
  reference varchar(180),
  status varchar(32) NOT NULL DEFAULT 'posted',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pick_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_no varchar(80) NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  status varchar(32) NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  label_format varchar(16) NOT NULL DEFAULT '4x6',
  labels_printed boolean NOT NULL DEFAULT false,
  manifest_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fulfillment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_list_id uuid NOT NULL REFERENCES pick_lists(id) ON DELETE CASCADE,
  order_line_id uuid NOT NULL REFERENCES sales_order_lines(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES batches(id) ON DELETE SET NULL,
  expected_qty numeric(12, 3) NOT NULL,
  actual_qty numeric(12, 3) NOT NULL DEFAULT 0,
  actual_weight numeric(12, 3) NOT NULL DEFAULT 0,
  bag_code varchar(80),
  status varchar(32) NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connector_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source varchar(80) NOT NULL,
  request_type varchar(80) NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'open',
  routed_to varchar(80),
  review_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  status varchar(32) NOT NULL DEFAULT 'open',
  reason text NOT NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  kind varchar(48) NOT NULL,
  amount numeric(12, 2) NOT NULL,
  balance_after numeric(12, 2) NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS correction_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period varchar(7) NOT NULL,
  amount numeric(12, 2) NOT NULL,
  memo text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'posted',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period varchar(7) NOT NULL UNIQUE,
  status varchar(32) NOT NULL DEFAULT 'locked',
  locked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  locked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archive_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period varchar(7) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'archived',
  control_totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  csv_path text NOT NULL,
  jsonl_path text NOT NULL,
  pdf_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photography_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  status varchar(32) NOT NULL DEFAULT 'open',
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label varchar(180) NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_name varchar(80) NOT NULL,
  idempotency_key varchar(180) NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name varchar(180) NOT NULL,
  actor_role varchar(32) NOT NULL,
  reason text,
  status varchar(32) NOT NULL,
  affected_ids text[] NOT NULL DEFAULT '{}'::text[],
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  reversed_by_command_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS command_journal_idempotency_idx ON command_journal(idempotency_key);
CREATE INDEX IF NOT EXISTS command_journal_command_idx ON command_journal(command_name);
CREATE INDEX IF NOT EXISTS command_journal_actor_idx ON command_journal(actor_id);

CREATE TABLE IF NOT EXISTS session (
  sid varchar(255) PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);
