-- Add email to admin_users for OTP-based login verification.
-- After running this migration, set the email for each admin account manually.
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS email text;
