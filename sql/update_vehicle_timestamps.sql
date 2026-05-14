-- Update 35 randomly selected vehicles to have created_at timestamps
-- randomly distributed across 2025 Jan 1 – May 31.
-- Run in Supabase SQL Editor.

UPDATE resident_vehicles
SET created_at =
  TIMESTAMPTZ '2025-01-01 00:00:00 UTC'
  + (RANDOM() * (TIMESTAMPTZ '2025-05-31 23:59:59 UTC' - TIMESTAMPTZ '2025-01-01 00:00:00 UTC'))
WHERE id IN (
  SELECT id
  FROM resident_vehicles
  ORDER BY RANDOM()
  LIMIT 35
);
