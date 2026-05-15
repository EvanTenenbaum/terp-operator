-- Migration: 0004_referee_system.sql
-- Description: Add referee credit tracking system
-- Date: 2026-05-15

-- =============================================================================
-- PART 1: Create Referees Entity Table
-- =============================================================================

CREATE TABLE referees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(180) NOT NULL,
  email varchar(240),
  phone varchar(80),
  tax_id varchar(80),
  balance numeric(12,2) NOT NULL DEFAULT 0,
  lifetime_earned numeric(12,2) NOT NULL DEFAULT 0,
  payment_method varchar(32) DEFAULT 'check',
  payment_details text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT referees_balance_check CHECK (balance >= 0),
  CONSTRAINT referees_lifetime_check CHECK (lifetime_earned >= 0)
);

CREATE INDEX referees_active_idx ON referees(active);
CREATE INDEX referees_balance_idx ON referees(balance) WHERE balance > 0;
CREATE INDEX referees_name_idx ON referees(name);

COMMENT ON TABLE referees IS 'People or entities who refer customers/vendors and earn credits';
COMMENT ON COLUMN referees.balance IS 'Current unpaid credit balance';
COMMENT ON COLUMN referees.lifetime_earned IS 'Total credits earned all-time (including paid)';

-- =============================================================================
-- PART 2: Create Referee Relationships Table
-- =============================================================================

CREATE TABLE referee_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id uuid NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
  entity_type varchar(16) NOT NULL,
  entity_id uuid NOT NULL,

  -- Fee structure
  fee_type varchar(16) NOT NULL DEFAULT 'percentage',
  fee_percentage numeric(5,2),
  fee_fixed_amount numeric(12,2),

  -- Behavior
  apply_by_default boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,

  notes text,
  effective_from timestamp with time zone,
  effective_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT referee_relationships_entity_check CHECK (
    entity_type IN ('customer', 'vendor')
  ),
  CONSTRAINT referee_relationships_fee_type_check CHECK (
    fee_type IN ('percentage', 'fixed', 'hybrid')
  ),
  CONSTRAINT referee_relationships_fee_structure_check CHECK (
    (fee_type = 'percentage' AND fee_percentage IS NOT NULL AND fee_percentage > 0 AND fee_percentage <= 100) OR
    (fee_type = 'fixed' AND fee_fixed_amount IS NOT NULL AND fee_fixed_amount >= 0) OR
    (fee_type = 'hybrid' AND fee_percentage IS NOT NULL AND fee_fixed_amount IS NOT NULL)
  )
);

CREATE INDEX referee_relationships_referee_idx ON referee_relationships(referee_id);
CREATE INDEX referee_relationships_entity_idx ON referee_relationships(entity_type, entity_id);

-- Only one active relationship per referee+entity pair
CREATE UNIQUE INDEX referee_relationships_active_unique
  ON referee_relationships(referee_id, entity_type, entity_id)
  WHERE active = true;

COMMENT ON TABLE referee_relationships IS 'Links referees to customers/vendors with fee structure';
COMMENT ON COLUMN referee_relationships.entity_type IS 'customer or vendor';
COMMENT ON COLUMN referee_relationships.entity_id IS 'Polymorphic FK to customers.id or vendors.id';
COMMENT ON COLUMN referee_relationships.fee_type IS 'percentage | fixed | hybrid';
COMMENT ON COLUMN referee_relationships.apply_by_default IS 'Whether checkbox starts checked on new transactions';

-- =============================================================================
-- PART 3: Create Referee Credits Ledger
-- =============================================================================

CREATE TABLE referee_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id uuid NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
  referee_relationship_id uuid NOT NULL REFERENCES referee_relationships(id) ON DELETE CASCADE,

  -- Source transaction (polymorphic)
  transaction_type varchar(32) NOT NULL,
  transaction_id uuid NOT NULL,
  transaction_no varchar(80) NOT NULL,
  transaction_total numeric(12,2) NOT NULL,

  -- Credit calculation (snapshot at time of accrual)
  fee_type varchar(16) NOT NULL,
  fee_percentage numeric(5,2),
  fee_fixed_amount numeric(12,2),
  credit_amount numeric(12,2) NOT NULL,

  -- Payment tracking
  status varchar(32) NOT NULL DEFAULT 'accrued',
  paid_via_transaction_id uuid,
  paid_at timestamp with time zone,
  voided_at timestamp with time zone,
  voided_reason text,

  command_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT referee_credits_transaction_type_check CHECK (
    transaction_type IN ('purchase_order', 'sales_order')
  ),
  CONSTRAINT referee_credits_status_check CHECK (
    status IN ('accrued', 'paid', 'voided')
  ),
  CONSTRAINT referee_credits_amount_check CHECK (credit_amount >= 0),
  CONSTRAINT referee_credits_paid_check CHECK (
    (status = 'paid' AND paid_via_transaction_id IS NOT NULL AND paid_at IS NOT NULL) OR
    (status != 'paid')
  ),
  CONSTRAINT referee_credits_voided_check CHECK (
    (status = 'voided' AND voided_at IS NOT NULL) OR
    (status != 'voided')
  )
);

CREATE INDEX referee_credits_referee_idx ON referee_credits(referee_id);
CREATE INDEX referee_credits_status_idx ON referee_credits(status);
CREATE INDEX referee_credits_transaction_idx ON referee_credits(transaction_type, transaction_id);
CREATE INDEX referee_credits_unpaid_idx ON referee_credits(referee_id, status) WHERE status = 'accrued';

-- Prevent duplicate credits for same transaction
CREATE UNIQUE INDEX referee_credits_transaction_unique
  ON referee_credits(transaction_type, transaction_id)
  WHERE status != 'voided';

COMMENT ON TABLE referee_credits IS 'Individual credit accruals from transactions';
COMMENT ON COLUMN referee_credits.transaction_type IS 'purchase_order or sales_order';
COMMENT ON COLUMN referee_credits.transaction_id IS 'Polymorphic FK to purchase_orders.id or sales_orders.id';
COMMENT ON COLUMN referee_credits.credit_amount IS 'Calculated credit amount (percentage or fixed)';
COMMENT ON COLUMN referee_credits.status IS 'accrued (unpaid) | paid | voided';

-- =============================================================================
-- PART 4: Modify Existing Tables
-- =============================================================================

-- Add referee tracking to sales_orders
ALTER TABLE sales_orders
  ADD COLUMN referee_relationship_id uuid REFERENCES referee_relationships(id) ON DELETE SET NULL,
  ADD COLUMN referee_credit_amount numeric(12,2);

CREATE INDEX sales_orders_referee_idx ON sales_orders(referee_relationship_id);

COMMENT ON COLUMN sales_orders.referee_relationship_id IS 'Referee relationship if credit logged for this sale';
COMMENT ON COLUMN sales_orders.referee_credit_amount IS 'Denormalized credit amount for quick display';

-- Add referee tracking to purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN referee_relationship_id uuid REFERENCES referee_relationships(id) ON DELETE SET NULL,
  ADD COLUMN referee_credit_amount numeric(12,2);

CREATE INDEX purchase_orders_referee_idx ON purchase_orders(referee_relationship_id);

COMMENT ON COLUMN purchase_orders.referee_relationship_id IS 'Referee relationship if credit logged for this PO';
COMMENT ON COLUMN purchase_orders.referee_credit_amount IS 'Denormalized credit amount for quick display';

-- =============================================================================
-- PART 5: Create Helper Functions
-- =============================================================================

-- Function to calculate referee credit
CREATE OR REPLACE FUNCTION calculate_referee_credit(
  p_transaction_total numeric,
  p_fee_type varchar,
  p_fee_percentage numeric,
  p_fee_fixed_amount numeric
) RETURNS numeric AS $$
BEGIN
  CASE p_fee_type
    WHEN 'percentage' THEN
      RETURN ROUND(p_transaction_total * (p_fee_percentage / 100), 2);
    WHEN 'fixed' THEN
      RETURN p_fee_fixed_amount;
    WHEN 'hybrid' THEN
      RETURN ROUND(p_transaction_total * (p_fee_percentage / 100), 2) + p_fee_fixed_amount;
    ELSE
      RAISE EXCEPTION 'Invalid fee_type: %', p_fee_type;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_referee_credit IS 'Calculate credit amount from transaction total and fee structure';

-- =============================================================================
-- PART 6: Seed Sample Data
-- =============================================================================

-- Insert sample referees
INSERT INTO referees (name, email, phone, payment_method, notes, active) VALUES
  ('John Martinez', 'john@example.com', '555-0123', 'check', 'Active referrer since 2025', true),
  ('Sarah Chen', 'sarah@chen.com', '555-0456', 'wire', 'Refers high-value customers', true),
  ('Mike Thompson', 'mike@thompson.net', '555-0789', 'check', 'Vendor network referrals', true);

-- Link referees to existing customers/vendors (assumes customer/vendor IDs exist)
-- NOTE: Replace these with actual IDs from your database after running the migration

-- Example: John Martinez refers Rich Star Foods (customer) at 5%
-- INSERT INTO referee_relationships (referee_id, entity_type, entity_id, fee_type, fee_percentage, apply_by_default, notes)
-- SELECT
--   r.id,
--   'customer',
--   c.id,
--   'percentage',
--   5.00,
--   true,
--   'Referral agreement May 2026'
-- FROM referees r
-- CROSS JOIN customers c
-- WHERE r.name = 'John Martinez' AND c.name = 'Rich Star Foods';

-- Example: John Martinez refers Green Valley Co. (vendor) at $50 per PO
-- INSERT INTO referee_relationships (referee_id, entity_type, entity_id, fee_type, fee_fixed_amount, apply_by_default, notes)
-- SELECT
--   r.id,
--   'vendor',
--   v.id,
--   'fixed',
--   50.00,
--   true,
--   'Fixed fee per purchase order'
-- FROM referees r
-- CROSS JOIN vendors v
-- WHERE r.name = 'John Martinez' AND v.name = 'Green Valley Co.';

-- =============================================================================
-- PART 7: Create Views for Queries
-- =============================================================================

-- View: Referee summary with current balance and relationship count
CREATE OR REPLACE VIEW referee_summary AS
SELECT
  r.id,
  r.name,
  r.email,
  r.phone,
  r.balance,
  r.lifetime_earned,
  r.payment_method,
  r.active,
  COUNT(DISTINCT rr.id) FILTER (WHERE rr.active = true) as active_relationships,
  COUNT(DISTINCT rc.id) FILTER (WHERE rc.status = 'accrued') as unpaid_credits,
  MAX(rc.paid_at) as last_payout_date
FROM referees r
LEFT JOIN referee_relationships rr ON rr.referee_id = r.id
LEFT JOIN referee_credits rc ON rc.referee_id = r.id
GROUP BY r.id, r.name, r.email, r.phone, r.balance, r.lifetime_earned, r.payment_method, r.active;

COMMENT ON VIEW referee_summary IS 'Summary view for referee grid display';

-- =============================================================================
-- PART 8: Rollback Instructions (for reference)
-- =============================================================================

/*
-- To rollback this migration:

DROP VIEW IF EXISTS referee_summary;
DROP FUNCTION IF EXISTS calculate_referee_credit;

ALTER TABLE sales_orders DROP COLUMN IF EXISTS referee_relationship_id;
ALTER TABLE sales_orders DROP COLUMN IF EXISTS referee_credit_amount;

ALTER TABLE purchase_orders DROP COLUMN IF EXISTS referee_relationship_id;
ALTER TABLE purchase_orders DROP COLUMN IF EXISTS referee_credit_amount;

DROP TABLE IF EXISTS referee_credits;
DROP TABLE IF EXISTS referee_relationships;
DROP TABLE IF EXISTS referees;
*/

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
