-- One-time email verification codes for host identity verification.
-- Each OTP is single-use and expires after 10 minutes.
--
-- Run this in the Supabase SQL Editor.

CREATE TABLE email_otps (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id    uuid        NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  email      text        NOT NULL,
  otp_hash   text        NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lookup index: finding valid (unexpired, unused) codes for a given unit+email
CREATE INDEX idx_email_otps_lookup
  ON email_otps(unit_id, email, expires_at)
  WHERE used_at IS NULL;
