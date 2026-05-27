-- migrations/0071_default_inventory_views.sql
-- Idempotent upsert of 5 default inventory saved filter views.
-- Uses a system user_id sentinel ('00000000-0000-0000-0000-000000000001')
-- for global filters so they appear for every workspace user.
--
-- Schema note: migration 0069 dropped organizations table and organization_id
-- columns from users and saved_filters, so INSERT omits that column.
-- The system sentinel user is created if it does not exist so that the FK
-- on user_id / created_by / updated_by (→ users.id) is satisfied.
--
-- Safe to run multiple times — ON CONFLICT DO NOTHING.

DO $$
DECLARE
  system_user_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Ensure the system sentinel user exists (required by FK on saved_filters.user_id).
  -- ON CONFLICT handles repeated runs; the EXCEPTION block absorbs a unique_violation
  -- on the email column if that address is somehow taken by a real user.
  BEGIN
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (
      system_user_id,
      'System',
      'system@terp.internal',
      'system-no-login',
      'admin'
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  -- Upsert 5 default inventory saved filter views.
  INSERT INTO saved_filters (
    user_id, name, description, target_view, filter_definition,
    schema_version, is_global, created_by, updated_by
  )
  VALUES
    (system_user_id, 'Aging premium',
     'Aged inventory priced under $100 with qty available', 'inventory',
     '{"logic":"AND","conditions":[{"field":"ageDays","operator":"greater_than","value":30},{"field":"availableQty","operator":"greater_than","value":0},{"field":"unitPrice","operator":"less_than","value":100}]}'::jsonb,
     1, true, system_user_id, system_user_id),

    (system_user_id, 'Consignment risk',
     'Consignment-owned batches with qty available', 'inventory',
     '{"logic":"AND","conditions":[{"field":"ownershipStatus","operator":"equals","value":"C"},{"field":"availableQty","operator":"greater_than","value":0}]}'::jsonb,
     1, true, system_user_id, system_user_id),

    (system_user_id, 'Value buyers',
     'Lower-priced inventory', 'inventory',
     '{"logic":"AND","conditions":[{"field":"unitPrice","operator":"less_than","value":30}]}'::jsonb,
     1, true, system_user_id, system_user_id),

    (system_user_id, 'Low stock',
     'Batches with low available quantity', 'inventory',
     '{"logic":"AND","conditions":[{"field":"availableQty","operator":"greater_than","value":0},{"field":"availableQty","operator":"less_than","value":5}]}'::jsonb,
     1, true, system_user_id, system_user_id),

    (system_user_id, 'Office owned',
     'Office-owned batches', 'inventory',
     '{"logic":"AND","conditions":[{"field":"ownershipStatus","operator":"equals","value":"OFC"}]}'::jsonb,
     1, true, system_user_id, system_user_id)

  ON CONFLICT (user_id, name, target_view) DO NOTHING;
END $$;
