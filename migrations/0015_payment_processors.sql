-- Migration 0015: Payment Processor System
-- Create payment_processors and processor_fees tables

CREATE TABLE payment_processors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  processor_type varchar(32) NOT NULL,
  fee_type varchar(16) NOT NULL DEFAULT 'hybrid',
  fee_percentage numeric(5, 2),
  fee_fixed_amount numeric(12, 2),
  default_user_split numeric(5, 2) NOT NULL,
  default_processor_split numeric(5, 2) NOT NULL,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_processors_type_idx ON payment_processors(processor_type);
CREATE INDEX payment_processors_active_idx ON payment_processors(active);

CREATE TABLE processor_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor_id uuid NOT NULL REFERENCES payment_processors(id) ON DELETE CASCADE,
  transaction_type varchar(32) NOT NULL,
  transaction_id uuid NOT NULL,
  transaction_no varchar(80) NOT NULL,
  transaction_amount numeric(12, 2) NOT NULL,
  processing_fee_total numeric(12, 2) NOT NULL,
  user_fee_share numeric(12, 2) NOT NULL,
  processor_fee_share numeric(12, 2) NOT NULL,
  user_fee_status varchar(16) NOT NULL DEFAULT 'collectible',
  user_fee_collected_at timestamptz,
  processor_fee_status varchar(16) NOT NULL DEFAULT 'paid',
  processor_fee_paid_at timestamptz,
  processor_fee_paid_via uuid,
  command_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX processor_fees_processor_idx ON processor_fees(processor_id);
CREATE INDEX processor_fees_transaction_idx ON processor_fees(transaction_type, transaction_id);
CREATE INDEX processor_fees_user_status_idx ON processor_fees(user_fee_status);
CREATE INDEX processor_fees_processor_status_idx ON processor_fees(processor_fee_status);
CREATE INDEX processor_fees_balance_calc_idx ON processor_fees(processor_id, user_fee_status, processor_fee_status);

-- Add processor references to payments
ALTER TABLE payments
  ADD COLUMN processor_id uuid REFERENCES payment_processors(id) ON DELETE SET NULL,
  ADD COLUMN processor_fee_id uuid REFERENCES processor_fees(id) ON DELETE SET NULL;

CREATE INDEX payments_processor_idx ON payments(processor_id);
CREATE INDEX payments_processor_fee_idx ON payments(processor_fee_id);

-- Add processor fee reference to vendor_payments
ALTER TABLE vendor_payments
  ADD COLUMN processor_fee_id uuid REFERENCES processor_fees(id) ON DELETE SET NULL;

CREATE INDEX vendor_payments_processor_fee_idx ON vendor_payments(processor_fee_id);

-- Insert transaction types
INSERT INTO transaction_types (slug, label, direction, allowed_entity_types, default_method, default_bucket, default_allocation_intent, requires_approval, is_system, is_active)
VALUES
  ('crypto_payment_in', 'Crypto payment (customer)', 'receiving', ARRAY['customer'], 'crypto', 'crypto-wallet', 'fifo', false, true, true),
  ('crypto_cashout', 'Crypto cashout (to customer)', 'paying', ARRAY['customer'], 'crypto', 'crypto-wallet', 'fifo', false, true, true),
  ('check_payment_in', 'Check payment (customer)', 'receiving', ARRAY['customer'], 'check', 'cash-file-a', 'fifo', false, true, true),
  ('processor_fee_settlement', 'Processor fee settlement', 'paying', ARRAY['processor'], 'cash', 'accounting', 'unapplied', true, true, true)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  direction = EXCLUDED.direction,
  allowed_entity_types = EXCLUDED.allowed_entity_types,
  default_method = EXCLUDED.default_method,
  default_bucket = EXCLUDED.default_bucket,
  default_allocation_intent = EXCLUDED.default_allocation_intent,
  requires_approval = EXCLUDED.requires_approval,
  is_system = true,
  is_active = true,
  updated_at = now();
