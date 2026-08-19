-- Merge oversized_applications into resident_vehicles.
-- Adds approval workflow columns and migrates all pending oversized records.

-- 1. Add approval workflow columns (idempotent via IF NOT EXISTS / exception handling)
ALTER TABLE resident_vehicles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS admin_notes     text,
  ADD COLUMN IF NOT EXISTS reviewed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by    text;

-- 2. Check constraint (skip if already exists)
DO $$ BEGIN
  ALTER TABLE resident_vehicles
    ADD CONSTRAINT resident_vehicles_approval_status_check
    CHECK (approval_status IN ('approved', 'pending', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Partial index for fast pending/rejected lookups
CREATE INDEX IF NOT EXISTS idx_resident_vehicles_approval
  ON resident_vehicles(unit_id, approval_status)
  WHERE approval_status != 'approved';

-- 4. Migrate pending oversized_applications → resident_vehicles
--    Skip any plate already present in resident_vehicles (safety net).
--
--    COMPATIBILITY SHIM (added 2026-08, behaviour unchanged): the destination
--    column was renamed registration_doc_url → registration_doc_path by
--    20260819_private_registration_docs.sql. A fresh database built from
--    schema.sql already has the new name, so a hardcoded INSERT here would fail
--    on replay. The target column is resolved at run time; oversized_applications
--    keeps its original column name because that table is frozen legacy.
DO $$
DECLARE
  v_target_col text;
  v_source_expr text;
BEGIN
  -- Both columns coexist between the expand and contract steps of
  -- 20260819_private_registration_docs.sql, so prefer the new one explicitly
  -- rather than letting the row order decide.
  SELECT column_name INTO v_target_col
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'resident_vehicles'
    AND column_name IN ('registration_doc_url', 'registration_doc_path')
  ORDER BY CASE column_name WHEN 'registration_doc_path' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_target_col IS NULL THEN
    RAISE EXCEPTION 'resident_vehicles has neither registration_doc_url nor registration_doc_path';
  END IF;

  -- oversized_applications is frozen legacy and still stores public URLs, so
  -- strip the prefix when the destination is the path column.
  v_source_expr := CASE v_target_col
    WHEN 'registration_doc_path'
      THEN $expr$regexp_replace(oa.registration_doc_url, '^.*/storage/v1/object/public/registration-docs/', '')$expr$
    ELSE 'oa.registration_doc_url'
  END;

  EXECUTE format($sql$
    INSERT INTO resident_vehicles (
      unit_id, year, make, model, color,
      license_plate, plate_state,
      owner_name, owner_phone, owner_phone_country_code, owner_email,
      registrant_type, opt_in_sms, opt_in_email,
      %I, is_oversized, vehicle_type,
      approval_status, admin_notes, reviewed_at, reviewed_by,
      created_at
    )
    SELECT
      oa.unit_id,
      oa.year,
      oa.make,
      oa.model,
      oa.color,
      oa.license_plate,
      oa.plate_state,
      oa.owner_name,
      oa.owner_phone,
      oa.owner_phone_country_code,
      oa.owner_email,
      COALESCE(oa.registrant_type, 'owner'),
      false,  -- opt_in_sms
      true,   -- opt_in_email
      %s,
      true,   -- is_oversized
      oa.vehicle_type,
      'pending',
      oa.admin_notes,
      oa.reviewed_at,
      oa.reviewed_by,
      oa.created_at
    FROM oversized_applications oa
    WHERE oa.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM resident_vehicles rv
        WHERE UPPER(rv.license_plate) = UPPER(oa.license_plate)
      )
  $sql$, v_target_col, v_source_expr);
END $$;
