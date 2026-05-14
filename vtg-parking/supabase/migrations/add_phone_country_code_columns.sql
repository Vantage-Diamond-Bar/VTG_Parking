-- Split phone fields into country code + local number columns
-- Run this in the Supabase SQL editor

ALTER TABLE resident_vehicles
  ADD COLUMN IF NOT EXISTS owner_phone_country_code text;

ALTER TABLE visitor_registrations
  ADD COLUMN IF NOT EXISTS visitor_phone_country_code text;

ALTER TABLE oversized_applications
  ADD COLUMN IF NOT EXISTS owner_phone_country_code text;

ALTER TABLE vacation_parking_requests
  ADD COLUMN IF NOT EXISTS phone_country_code text,
  ADD COLUMN IF NOT EXISTS emergency_phone_country_code text;
