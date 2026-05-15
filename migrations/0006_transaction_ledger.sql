ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vendor_bills_purchase_order_idx ON vendor_bills(purchase_order_id);

CREATE TABLE IF NOT EXISTS transaction_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL UNIQUE,
  label varchar(140) NOT NULL,
  direction varchar(24) NOT NULL DEFAULT 'receiving',
  allowed_entity_types text[] NOT NULL DEFAULT '{}'::text[],
  default_method varchar(32) NOT NULL DEFAULT 'cash',
  default_bucket varchar(120) NOT NULL DEFAULT 'cash-file-a',
  default_allocation_intent varchar(80) NOT NULL DEFAULT 'fifo',
  requires_approval boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_types_direction_idx ON transaction_types(direction);
CREATE INDEX IF NOT EXISTS transaction_types_active_idx ON transaction_types(is_active);

INSERT INTO transaction_types (slug, label, direction, allowed_entity_types, default_method, default_bucket, default_allocation_intent, is_system)
VALUES
  ('client_payment', 'Client payment', 'receiving', ARRAY['customer'], 'cash', 'cash-file-a', 'fifo', true),
  ('buyer_credit', 'Buyer credit / down payment', 'receiving', ARRAY['customer'], 'cash', 'cash-file-a', 'unapplied', true),
  ('vendor_product_payment', 'Product payment', 'paying', ARRAY['vendor'], 'cash', 'accounting', 'po_fifo', true),
  ('vendor_down_payment', 'Vendor down payment', 'paying', ARRAY['vendor'], 'cash', 'accounting', 'po_fifo', true),
  ('vendor_loan', 'Vendor loan', 'paying', ARRAY['vendor'], 'wire', 'accounting', 'unapplied', true),
  ('vendor_payout', 'General vendor payout', 'paying', ARRAY['vendor'], 'cash', 'accounting', 'selected_bill', true),
  ('staff_payment', 'Staff payment', 'paying', ARRAY['staff'], 'cash', 'office', 'unapplied', true),
  ('other_receipt', 'Other receipt', 'receiving', ARRAY['other', 'vendor', 'staff'], 'cash', 'cash-file-a', 'unapplied', true),
  ('other_payment', 'Other payment', 'paying', ARRAY['other', 'staff'], 'cash', 'office', 'unapplied', true)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  direction = EXCLUDED.direction,
  allowed_entity_types = EXCLUDED.allowed_entity_types,
  default_method = EXCLUDED.default_method,
  default_bucket = EXCLUDED.default_bucket,
  default_allocation_intent = EXCLUDED.default_allocation_intent,
  is_system = true,
  is_active = true,
  updated_at = now();
