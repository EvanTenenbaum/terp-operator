-- Feature 4: Partial Upfront Payments
-- Add prepayment tracking to purchase_orders and link vendor_payments to POs

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS prepayment_amount numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE vendor_payments
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES purchase_orders(id);

CREATE INDEX IF NOT EXISTS vendor_payments_po_idx
  ON vendor_payments(purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;
