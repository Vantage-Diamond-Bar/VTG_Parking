-- 20260527_schema_catch_up.sql
--
-- Brings the live database in sync with all current application code.
-- Every statement uses IF NOT EXISTS / DO$$ exception blocks so it is safe
-- to run on databases where some migrations have already been applied.
--
-- Run this in the Supabase SQL Editor.

-- ─── 1. vacation_parking_requests ────────────────────────────────────────────
-- Referenced throughout the codebase but never defined in schema.sql.
-- This is the primary cause of the broken vacation sidebar page.
CREATE TABLE IF NOT EXISTS vacation_parking_requests (
  id                           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id                      uuid        NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  status                       text        NOT NULL DEFAULT 'pending',
  registrant_type              text,
  first_name                   text        NOT NULL,
  last_name                    text        NOT NULL,
  phone                        text        NOT NULL,
  phone_country_code           text,
  email                        text,
  reason                       text,
  emergency_first_name         text,
  emergency_last_name          text,
  emergency_phone              text,
  emergency_phone_country_code text,
  year                         integer,
  make                         text,
  model                        text,
  color                        text,
  license_plate                text        NOT NULL,
  plate_state                  text,
  is_registered_vehicle        boolean     NOT NULL DEFAULT false,
  is_eligible                  boolean     NOT NULL DEFAULT false,
  admin_notes                  text,
  rejection_reason             text,
  access_code                  text,
  reviewed_at                  timestamptz,
  reviewed_by                  text,
  submitted_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                   timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE vacation_parking_requests
    ADD CONSTRAINT vacation_parking_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_vacation_unit      ON vacation_parking_requests(unit_id);
CREATE INDEX IF NOT EXISTS idx_vacation_status    ON vacation_parking_requests(status);
CREATE INDEX IF NOT EXISTS idx_vacation_plate     ON vacation_parking_requests(upper(license_plate));
CREATE INDEX IF NOT EXISTS idx_vacation_submitted ON vacation_parking_requests(submitted_at);

ALTER TABLE vacation_parking_requests ENABLE ROW LEVEL SECURITY;

-- ─── 2. violation_reports — admin workflow columns ────────────────────────────
-- The violations route reads/writes status, resolution_type, admin_notes,
-- unit_address, processed_at, call_hearing, and final_* fields that are absent
-- from schema.sql, causing the violations sidebar page to error.
ALTER TABLE violation_reports
  ADD COLUMN IF NOT EXISTS status               text        NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS resolution_type      text,
  ADD COLUMN IF NOT EXISTS admin_notes          text,
  ADD COLUMN IF NOT EXISTS unit_address         text,
  ADD COLUMN IF NOT EXISTS processed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS call_hearing         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_license_plate  text,
  ADD COLUMN IF NOT EXISTS final_violation_type text,
  ADD COLUMN IF NOT EXISTS final_location       text;

DO $$ BEGIN
  ALTER TABLE violation_reports
    ADD CONSTRAINT violation_reports_status_check
    CHECK (status IN ('new', 'in_review', 'resolved', 'no_action'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_violation_status       ON violation_reports(status);
CREATE INDEX IF NOT EXISTS idx_violation_unit_address ON violation_reports(unit_address);

-- ─── 3. resident_vehicles — missing columns ───────────────────────────────────
-- is_oversized, vehicle_type, registrant_type present in all INSERT paths but
-- absent from schema.sql.  approval_status and its siblings are idempotent with
-- 20260525_merge_oversized_into_residents.sql.
ALTER TABLE resident_vehicles
  ADD COLUMN IF NOT EXISTS is_oversized             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vehicle_type             text,
  ADD COLUMN IF NOT EXISTS registrant_type          text    NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS owner_phone_country_code text,
  ADD COLUMN IF NOT EXISTS approval_status          text    NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS admin_notes              text,
  ADD COLUMN IF NOT EXISTS reviewed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by              text;

DO $$ BEGIN
  ALTER TABLE resident_vehicles
    ADD CONSTRAINT resident_vehicles_approval_status_check
    CHECK (approval_status IN ('approved', 'pending', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_resident_vehicles_approval
  ON resident_vehicles(unit_id, approval_status)
  WHERE approval_status != 'approved';

-- ─── 4. visitor_registrations — phone columns ────────────────────────────────
-- book_visitor_registration() inserts visitor_phone and visitor_phone_country_code;
-- the stored procedure will error if these columns are absent.
ALTER TABLE visitor_registrations
  ADD COLUMN IF NOT EXISTS visitor_phone              text,
  ADD COLUMN IF NOT EXISTS visitor_phone_country_code text;

-- ─── 5. abuse_alerts — unique constraint for upsert ──────────────────────────
-- The visitor booking route calls .upsert(..., { onConflict: 'license_plate,year_month' })
-- which requires this constraint to exist.
DO $$ BEGIN
  ALTER TABLE abuse_alerts
    ADD CONSTRAINT abuse_alerts_plate_month_key UNIQUE (license_plate, year_month);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 6. violation_type enum — 96-hour variant ────────────────────────────────
-- The UI sends 'Vehicle Parked for Over 96 Hours Without Movement'; the enum
-- only defined the 72-hour string.  ADD VALUE IF NOT EXISTS is a no-op if the
-- value is already present.
ALTER TYPE violation_type ADD VALUE IF NOT EXISTS 'Vehicle Parked for Over 96 Hours Without Movement';

-- ─── 7. admin_users — email column for OTP login ─────────────────────────────
-- Idempotent with 20260525_admin_email.sql.
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS email text;

-- ─── 8. email_otps table ─────────────────────────────────────────────────────
-- Idempotent with 20260525_email_otps.sql and 20260525_otp_attempt_count.sql.
CREATE TABLE IF NOT EXISTS email_otps (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id       uuid        NOT NULL,  -- no FK: admin login passes admin UUIDs, not unit UUIDs
  email         text        NOT NULL,
  otp_hash      text        NOT NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  attempt_count integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Drop the units FK if it was created before 20260525_admin_email.sql ran
ALTER TABLE email_otps DROP CONSTRAINT IF EXISTS email_otps_unit_id_fkey;

ALTER TABLE email_otps
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_email_otps_lookup
  ON email_otps(unit_id, email, expires_at)
  WHERE used_at IS NULL;

ALTER TABLE email_otps ENABLE ROW LEVEL SECURITY;

-- ─── 9. Drop visitor_monthly_quota ───────────────────────────────────────────
-- Idempotent with 20260525_drop_visitor_monthly_quota.sql.
-- The table was a write-only cache; all quota logic reads visitor_registrations directly.
DROP TABLE IF EXISTS visitor_monthly_quota;

-- ─── 10. oversized_applications — legacy stub ────────────────────────────────
-- This table is referenced by 20260525_merge_oversized_into_residents.sql when
-- running migrations on a fresh database.  On a live database the table already
-- exists; CREATE TABLE IF NOT EXISTS is a no-op in both cases.
CREATE TABLE IF NOT EXISTS oversized_applications (
  id                       uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id                  uuid        NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  status                   text        NOT NULL DEFAULT 'pending',
  registrant_type          text,
  owner_name               text        NOT NULL,
  owner_phone              text,
  owner_phone_country_code text,
  owner_email              text,
  year                     integer,
  make                     text        NOT NULL,
  model                    text        NOT NULL,
  color                    text        NOT NULL,
  license_plate            text        NOT NULL,
  plate_state              text,
  registration_doc_url     text,
  is_oversized             boolean     NOT NULL DEFAULT true,
  vehicle_type             text,
  admin_notes              text,
  reviewed_at              timestamptz,
  reviewed_by              text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE oversized_applications ENABLE ROW LEVEL SECURITY;
