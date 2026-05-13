CREATE TABLE IF NOT EXISTS oversized_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id),
  owner_name TEXT NOT NULL,
  owner_phone TEXT,
  owner_email TEXT,
  registrant_type TEXT DEFAULT 'owner',
  vehicle_type TEXT,
  year INTEGER,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  color TEXT NOT NULL,
  license_plate TEXT NOT NULL,
  plate_state TEXT,
  registration_doc_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_oversized_applications_unit_id ON oversized_applications(unit_id);
CREATE INDEX IF NOT EXISTS idx_oversized_applications_status ON oversized_applications(status);
CREATE INDEX IF NOT EXISTS idx_oversized_applications_plate ON oversized_applications(license_plate);
