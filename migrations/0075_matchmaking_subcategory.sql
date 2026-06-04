-- TER-1663: Add subcategory field to matchmaking need and supply tables
ALTER TABLE customer_needs ADD COLUMN IF NOT EXISTS subcategory varchar(120);
ALTER TABLE vendor_supply ADD COLUMN IF NOT EXISTS subcategory varchar(120);
