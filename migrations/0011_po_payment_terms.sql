-- Feature 3: Payment Terms Dropdown
-- Add payment_terms field to purchase_orders with standard options

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS payment_terms varchar(32) NOT NULL DEFAULT 'vendor_terms';
