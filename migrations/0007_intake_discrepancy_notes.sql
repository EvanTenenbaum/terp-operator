ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS discrepancy_notes text;
