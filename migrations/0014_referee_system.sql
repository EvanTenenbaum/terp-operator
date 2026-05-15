-- Migration: 0014_referee_system.sql
-- Description: Add referee credit tracking system with blocker fixes
-- Date: 2026-05-15
-- Phase: 0 (Blocker Fixes) + Core Tables

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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT referees_balance_check CHECK (balance >= 0),
  CONSTRAINT referees_lifetime_check CHECK (lifetime_earned >= 0)
);

CREATE INDEX referees_active_idx ON referees(active);
CREATE INDEX referees_balance_idx ON referees(balance) WHERE balance > 0;
CREATE INDEX referees_name_idx ON referees(name);

COMMENT ON TABLE referees IS 'People or entities who refer customers/vendors and earn credits';
COMMENT ON COLUMN referees.balance IS 'Current unpaid credit balance (auto-calculated from credits)';
COMMENT ON COLUMN referees.lifetime_earned IS 'Total credits earned all-time (auto-calculated)';

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
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT referee_relationships_entity_check CHECK (
    entity_type IN ('customer', 'vendor')
  ),
  CONSTRAINT referee_relationships_fee_type_check CHECK (
    fee_type IN ('percentage', 'fixed', 'hybrid')
  ),
  CONSTRAINT referee_relationships_fee_structure_check CHECK (
    (fee_type = 'percentage' AND fee_percentage IS NOT NULL AND fee_percentage >= 0.01 AND fee_percentage <= 100.00) OR
    (fee_type = 'fixed' AND fee_fixed_amount IS NOT NULL AND fee_fixed_amount >= 0) OR
    (fee_type = 'hybrid' AND fee_percentage IS NOT NULL AND fee_percentage >= 0.01 AND fee_percentage <= 100.00 AND fee_fixed_amount IS NOT NULL AND fee_fixed_amount >= 0)
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

  -- Payment tracking (BLOCKER FIX B4: partial payments)
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  status varchar(32) NOT NULL DEFAULT 'accrued',
  paid_via_transaction_id uuid,
  paid_at timestamptz,
  voided_at timestamptz,
  voided_reason text,

  command_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT referee_credits_transaction_type_check CHECK (
    transaction_type IN ('purchase_order', 'sales_order')
  ),
  CONSTRAINT referee_credits_status_check CHECK (
    status IN ('accrued', 'partially_paid', 'paid', 'voided')
  ),
  CONSTRAINT referee_credits_amount_check CHECK (credit_amount >= 0),
  CONSTRAINT referee_credits_amount_paid_check CHECK (
    amount_paid >= 0 AND amount_paid <= credit_amount
  ),
  CONSTRAINT referee_credits_paid_check CHECK (
    (status = 'paid' AND amount_paid = credit_amount AND paid_via_transaction_id IS NOT NULL AND paid_at IS NOT NULL) OR
    (status = 'partially_paid' AND amount_paid > 0 AND amount_paid < credit_amount AND paid_via_transaction_id IS NOT NULL AND paid_at IS NOT NULL) OR
    (status = 'accrued' AND amount_paid = 0) OR
    (status = 'voided')
  ),
  CONSTRAINT referee_credits_voided_check CHECK (
    (status = 'voided' AND voided_at IS NOT NULL) OR
    (status != 'voided')
  )
);

CREATE INDEX referee_credits_referee_idx ON referee_credits(referee_id);
CREATE INDEX referee_credits_status_idx ON referee_credits(status);
CREATE INDEX referee_credits_transaction_idx ON referee_credits(transaction_type, transaction_id);
CREATE INDEX referee_credits_unpaid_idx ON referee_credits(referee_id, status) WHERE status IN ('accrued', 'partially_paid');
CREATE INDEX referee_credits_paid_at_idx ON referee_credits(paid_at) WHERE status IN ('paid', 'partially_paid');

-- BLOCKER FIX B1: Index for balance calculation performance
CREATE INDEX referee_credits_balance_calc_idx ON referee_credits(referee_id, status);

-- Prevent duplicate credits for same transaction
CREATE UNIQUE INDEX referee_credits_transaction_unique
  ON referee_credits(transaction_type, transaction_id)
  WHERE status != 'voided';

COMMENT ON TABLE referee_credits IS 'Individual credit accruals from transactions';
COMMENT ON COLUMN referee_credits.transaction_type IS 'purchase_order or sales_order';
COMMENT ON COLUMN referee_credits.transaction_id IS 'Polymorphic FK to purchase_orders.id or sales_orders.id';
COMMENT ON COLUMN referee_credits.credit_amount IS 'Calculated credit amount (percentage or fixed)';
COMMENT ON COLUMN referee_credits.amount_paid IS 'Amount paid so far (supports partial payments)';
COMMENT ON COLUMN referee_credits.status IS 'accrued (unpaid) | partially_paid | paid | voided';

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
-- PART 5: BLOCKER FIX B1 - Auto-Calculate Balance from Credits
-- =============================================================================

-- Function to recalculate referee balance from credits
CREATE OR REPLACE FUNCTION recalculate_referee_balance(p_referee_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE referees
  SET
    balance = (
      SELECT COALESCE(SUM(credit_amount - amount_paid), 0)
      FROM referee_credits
      WHERE referee_id = p_referee_id
        AND status IN ('accrued', 'partially_paid')
    ),
    lifetime_earned = (
      SELECT COALESCE(SUM(credit_amount), 0)
      FROM referee_credits
      WHERE referee_id = p_referee_id
        AND status IN ('accrued', 'partially_paid', 'paid')
    ),
    updated_at = now()
  WHERE id = p_referee_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_referee_balance IS 'Recalculate balance and lifetime_earned from credits table (prevents race conditions)';

-- Trigger to sync balance on credit changes
CREATE OR REPLACE FUNCTION sync_referee_balance_on_credit_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recalculate_referee_balance(NEW.referee_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.referee_id != OLD.referee_id THEN
      -- Moved to different referee (rare edge case)
      PERFORM recalculate_referee_balance(OLD.referee_id);
      PERFORM recalculate_referee_balance(NEW.referee_id);
    ELSE
      PERFORM recalculate_referee_balance(NEW.referee_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recalculate_referee_balance(OLD.referee_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER maintain_referee_balance
  AFTER INSERT OR UPDATE OR DELETE ON referee_credits
  FOR EACH ROW
  EXECUTE FUNCTION sync_referee_balance_on_credit_change();

COMMENT ON TRIGGER maintain_referee_balance ON referee_credits IS 'Auto-sync referee balance on credit changes (BLOCKER FIX B1)';

-- =============================================================================
-- PART 6: BLOCKER FIX B2 - Polymorphic FK Validation
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_referee_relationship_entity()
RETURNS TRIGGER AS $$
DECLARE
  entity_exists boolean;
BEGIN
  -- Validate entity exists based on type
  IF NEW.entity_type = 'customer' THEN
    SELECT EXISTS(SELECT 1 FROM customers WHERE id = NEW.entity_id)
    INTO entity_exists;

    IF NOT entity_exists THEN
      RAISE EXCEPTION 'Customer with ID % does not exist', NEW.entity_id;
    END IF;

  ELSIF NEW.entity_type = 'vendor' THEN
    SELECT EXISTS(SELECT 1 FROM vendors WHERE id = NEW.entity_id)
    INTO entity_exists;

    IF NOT entity_exists THEN
      RAISE EXCEPTION 'Vendor with ID % does not exist', NEW.entity_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid entity_type: %. Must be customer or vendor.', NEW.entity_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_referee_relationship_entity_fk
  BEFORE INSERT OR UPDATE ON referee_relationships
  FOR EACH ROW
  EXECUTE FUNCTION validate_referee_relationship_entity();

COMMENT ON TRIGGER enforce_referee_relationship_entity_fk ON referee_relationships IS 'Validate polymorphic FK to customers/vendors (BLOCKER FIX B2)';

-- Prevent entity deletion with active relationships
CREATE OR REPLACE FUNCTION prevent_entity_delete_with_referee()
RETURNS TRIGGER AS $$
DECLARE
  relationship_count int;
BEGIN
  -- Check if entity has active referee relationships
  IF TG_TABLE_NAME = 'customers' THEN
    SELECT COUNT(*) INTO relationship_count
    FROM referee_relationships
    WHERE entity_type = 'customer'
      AND entity_id = OLD.id
      AND active = true;
  ELSIF TG_TABLE_NAME = 'vendors' THEN
    SELECT COUNT(*) INTO relationship_count
    FROM referee_relationships
    WHERE entity_type = 'vendor'
      AND entity_id = OLD.id
      AND active = true;
  END IF;

  IF relationship_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete % with active referee relationships. Deactivate relationships first.',
      TG_TABLE_NAME;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_customer_delete_with_referee
  BEFORE DELETE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_entity_delete_with_referee();

CREATE TRIGGER prevent_vendor_delete_with_referee
  BEFORE DELETE ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION prevent_entity_delete_with_referee();

COMMENT ON TRIGGER prevent_customer_delete_with_referee ON customers IS 'Prevent deletion with active referee relationships (BLOCKER FIX B2)';
COMMENT ON TRIGGER prevent_vendor_delete_with_referee ON vendors IS 'Prevent deletion with active referee relationships (BLOCKER FIX B2)';

-- =============================================================================
-- PART 7: BLOCKER FIX B5 - Cascade Delete Protection
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_referee_delete_with_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.balance > 0 THEN
    RAISE EXCEPTION 'Cannot delete referee "%" with unpaid balance $%. Pay out balance first.',
      OLD.name,
      OLD.balance;
  END IF;

  -- Double-check: prevent if has unpaid credits (in case balance is out of sync)
  IF EXISTS (
    SELECT 1 FROM referee_credits
    WHERE referee_id = OLD.id
      AND status IN ('accrued', 'partially_paid')
  ) THEN
    RAISE EXCEPTION 'Cannot delete referee "%" with unpaid credits. Pay out or void credits first.',
      OLD.name;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_referee_delete_protection
  BEFORE DELETE ON referees
  FOR EACH ROW
  EXECUTE FUNCTION prevent_referee_delete_with_balance();

COMMENT ON TRIGGER enforce_referee_delete_protection ON referees IS 'Prevent deletion with unpaid balance (BLOCKER FIX B5)';

-- =============================================================================
-- PART 8: Helper Functions
-- =============================================================================

-- Function to calculate referee credit
CREATE OR REPLACE FUNCTION calculate_referee_credit(
  p_transaction_total numeric,
  p_fee_type varchar,
  p_fee_percentage numeric,
  p_fee_fixed_amount numeric
) RETURNS numeric AS $$
BEGIN
  -- Validate non-negative total (MAJOR FIX M3)
  IF p_transaction_total < 0 THEN
    RAISE EXCEPTION 'Cannot calculate credit for negative transaction total: %', p_transaction_total;
  END IF;

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
-- PART 9: Seed Transaction Type
-- =============================================================================

-- MAJOR FIX M8: Seed referee_payout transaction type
INSERT INTO transaction_types (slug, label, direction, allowed_entity_types, default_method, default_bucket, default_allocation_intent, requires_approval, is_system, is_active)
VALUES (
  'referee_payout',
  'Referee Payout',
  'paying',
  '{referee}'::text[],
  'check',
  'accounting',
  'unapplied',
  true,
  true,
  true
)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- PART 10: Views for Queries
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
  COUNT(DISTINCT rc.id) FILTER (WHERE rc.status IN ('accrued', 'partially_paid')) as unpaid_credits,
  MAX(rc.paid_at) as last_payout_date,
  r.created_at,
  r.updated_at
FROM referees r
LEFT JOIN referee_relationships rr ON rr.referee_id = r.id
LEFT JOIN referee_credits rc ON rc.referee_id = r.id
GROUP BY r.id, r.name, r.email, r.phone, r.balance, r.lifetime_earned, r.payment_method, r.active, r.created_at, r.updated_at;

COMMENT ON VIEW referee_summary IS 'Summary view for referee grid display';

-- =============================================================================
-- PART 11: Seed Sample Data (Optional - for development)
-- =============================================================================

-- Uncomment below to seed sample data for development/testing

/*
-- Insert sample referees
INSERT INTO referees (name, email, phone, payment_method, notes, active) VALUES
  ('John Martinez', 'john@example.com', '555-0123', 'check', 'Active referrer since 2025', true),
  ('Sarah Chen', 'sarah@chen.com', '555-0456', 'wire', 'Refers high-value customers', true),
  ('Mike Thompson', 'mike@thompson.net', '555-0789', 'check', 'Vendor network referrals', true);
*/

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
