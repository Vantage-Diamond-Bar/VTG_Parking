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
INSERT INTO resident_vehicles (
  unit_id, year, make, model, color,
  license_plate, plate_state,
  owner_name, owner_phone, owner_phone_country_code, owner_email,
  registrant_type, opt_in_sms, opt_in_email,
  registration_doc_url, is_oversized, vehicle_type,
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
  oa.registration_doc_url,
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
  );
