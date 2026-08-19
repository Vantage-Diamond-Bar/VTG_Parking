-- Backfill migration for resident_vehicles.last_reminded_at.
--
-- The column has existed in production since the renewal-reminder cron shipped
-- (2026-05-10) but was never written into schema.sql or any migration — it was
-- presumably added by hand in the dashboard. Anyone building a fresh database
-- from schema.sql got a schema without it, and /api/cron/remind-registration
-- would fail on the missing column. This closes that drift.
--
-- Idempotent: safe on production, where the column already exists.

ALTER TABLE resident_vehicles
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

COMMENT ON COLUMN resident_vehicles.last_reminded_at IS
  'When the annual renewal reminder was last emailed for this vehicle. Drives the reminder cadence in /api/cron/remind-registration (weekly in the 30 days before expiry, monthly after). NULL means never reminded.';

-- Partial index: the cron only ever looks at vehicles opted into email that are
-- at or near their 1-year mark, and that is a small slice of the table.
CREATE INDEX IF NOT EXISTS idx_resident_vehicles_reminder
  ON resident_vehicles (created_at, last_reminded_at)
  WHERE opt_in_email = true AND owner_email IS NOT NULL;
