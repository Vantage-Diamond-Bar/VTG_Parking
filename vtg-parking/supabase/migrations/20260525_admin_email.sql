-- Add email to admin_users for OTP-based login verification.
-- After running this migration, set the email for each admin account manually.
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS email text;

-- Drop FK constraint on email_otps.unit_id so admin UUIDs (not in units table)
-- can be used as OTP keys for admin login flow.
ALTER TABLE email_otps
  DROP CONSTRAINT IF EXISTS email_otps_unit_id_fkey;
