-- Add oversized_rejected_at to track vehicles whose oversized application was denied
-- (they are converted to regular registered vehicles, but history is preserved)
ALTER TABLE resident_vehicles
  ADD COLUMN IF NOT EXISTS oversized_rejected_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_resident_vehicles_oversized_rejected
  ON resident_vehicles(oversized_rejected_at)
  WHERE oversized_rejected_at IS NOT NULL;
