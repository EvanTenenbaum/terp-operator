-- TER-1585 (CMD-VENDOR auto-brand wiring, Wave 2C)
-- Adds a nullable vendor_id FK to brands so the command bus can track which
-- vendor a brand was auto-created for and look up the default brand for a
-- given vendor during intake (createBatch).
--
-- ON DELETE SET NULL: deleting a vendor does not cascade-delete its brand;
-- the brand becomes "unlinked" (orphaned) so historical batch records that
-- reference it are preserved.

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS brands_vendor_id_idx ON brands(vendor_id) WHERE vendor_id IS NOT NULL;
