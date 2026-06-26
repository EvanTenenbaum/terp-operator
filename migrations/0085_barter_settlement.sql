-- Migration 0085: Product as a Monetary Instrument (Barter Settlement)
-- Phase 0 — Schema tables, enum/column additions, CHECK constraints
BEGIN;

-- ── 1. New tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS barter_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_no VARCHAR(80) NOT NULL UNIQUE,
  direction VARCHAR(16) NOT NULL,
  counterparty_type VARCHAR(16) NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  settlement_amount NUMERIC(12,2) NOT NULL,
  cost_basis NUMERIC(12,2) NOT NULL,
  gain_loss NUMERIC(12,2) NOT NULL DEFAULT 0,
  value_overridden BOOLEAN NOT NULL DEFAULT false,
  override_reason TEXT,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  purchase_receipt_id UUID REFERENCES purchase_receipts(id) ON DELETE SET NULL,
  vendor_bill_id UUID REFERENCES vendor_bills(id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'posted',
  command_id UUID,
  note TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS barter_settlement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES barter_settlements(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
  product_name VARCHAR(180) NOT NULL,
  qty NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  line_settlement_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS barter_settlement_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES barter_settlements(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  vendor_bill_id UUID REFERENCES vendor_bills(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- ── 2. CHECK constraints ──────────────────────────────────────────────────

ALTER TABLE barter_settlements ADD CONSTRAINT barter_settlements_amounts_chk
  CHECK (settlement_amount >= 0 AND cost_basis >= 0) NOT VALID;

ALTER TABLE barter_settlement_lines ADD CONSTRAINT barter_settlement_lines_qty_chk
  CHECK (qty > 0 AND unit_cost >= 0) NOT VALID;

ALTER TABLE barter_settlement_allocations ADD CONSTRAINT barter_settlement_allocations_amount_chk
  CHECK (amount > 0) NOT VALID;

-- ── 3. Column additions to existing tables ─────────────────────────────────

ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS method_product_guard BOOLEAN DEFAULT false;
-- method column is varchar — 'product' is a new valid value documented here

ALTER TABLE correction_journal_entries ADD COLUMN IF NOT EXISTS source_type VARCHAR(32);
ALTER TABLE correction_journal_entries ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE correction_journal_entries ADD COLUMN IF NOT EXISTS command_id UUID;

-- ── 4. Indexes for common lookup patterns ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_barter_settlements_customer ON barter_settlements(customer_id);
CREATE INDEX IF NOT EXISTS idx_barter_settlements_vendor ON barter_settlements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_barter_settlement_lines_settlement ON barter_settlement_lines(settlement_id);

COMMIT;
