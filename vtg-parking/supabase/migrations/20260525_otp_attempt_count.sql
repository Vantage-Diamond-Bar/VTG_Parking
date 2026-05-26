-- Add attempt tracking to email_otps for brute-force protection.
-- Max 5 wrong guesses before the code is invalidated server-side.
ALTER TABLE email_otps
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
