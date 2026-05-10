-- VTG Parking Management System - Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── UNITS (门牌号) ───────────────────────────────────────────────────────────
create table units (
  id uuid primary key default uuid_generate_v4(),
  unit_number text not null unique,
  address text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── RESIDENT VEHICLES (住户车辆) ─────────────────────────────────────────────
create table resident_vehicles (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid not null references units(id) on delete cascade,
  year integer not null,
  make text not null,
  model text not null,
  color text not null,
  license_plate text not null,
  plate_state text not null,
  owner_name text not null,
  owner_phone text,
  owner_email text,
  opt_in_sms boolean not null default false,
  opt_in_email boolean not null default false,
  registration_doc_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_resident_vehicles_plate on resident_vehicles(upper(license_plate));
create index idx_resident_vehicles_unit on resident_vehicles(unit_id);

-- ─── VISITOR REGISTRATIONS (访客停车登记) ─────────────────────────────────────
create table visitor_registrations (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid not null references units(id) on delete cascade,
  access_code text not null unique,
  visitor_name text,
  license_plate text not null,
  plate_state text not null,
  make text,
  model text,
  color text,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_visitor_plate on visitor_registrations(upper(license_plate));
create index idx_visitor_access_code on visitor_registrations(access_code);
create index idx_visitor_unit on visitor_registrations(unit_id);
create index idx_visitor_dates on visitor_registrations(start_datetime, end_datetime);

-- ─── VISITOR MONTHLY QUOTA (访客月度额度) ─────────────────────────────────────
create table visitor_monthly_quota (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid not null references units(id) on delete cascade,
  year_month text not null,   -- format: "2026-05"
  nights_used integer not null default 0,
  unique(unit_id, year_month)
);

-- ─── ABUSE ALERTS (滥用警示) ──────────────────────────────────────────────────
create table abuse_alerts (
  id uuid primary key default uuid_generate_v4(),
  license_plate text not null,
  plate_state text not null,
  year_month text not null,
  unit_ids text[] not null,        -- array of unit numbers involved
  registration_count integer not null,
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_note text,
  created_at timestamptz not null default now()
);

create index idx_abuse_alerts_resolved on abuse_alerts(is_resolved);

-- ─── VIOLATION REPORTS (违章举报) ─────────────────────────────────────────────
create type violation_location as enum (
  'Terrace Ln E',
  'Terrace Ln W',
  'Sunset Pl',
  'Main Gate / Fountain Roundabout / Clubhouse / Vantage Dr',
  'Other'
);

create type violation_type as enum (
  'Parking in Yellow-Curb Trash Bin Area on Sundays',
  'Vehicle Parked for Over 72 Hours Without Movement',
  'Opposite Direction of Traffic',
  'Parking Outside Designated Spaces',
  'Parking in Red-Curb Zone',
  'Unauthorized Commercial Vehicle',
  'Parking in Handicap Space Without Permit',
  'Safety Concern (Suspicious Person/Vehicle)',
  'Other'
);

create table violation_reports (
  id uuid primary key default uuid_generate_v4(),
  location violation_location not null,
  violation_type violation_type not null,
  description text,
  photo_urls text[] not null default '{}',
  license_plate text,
  reporter_email text,
  submitted_at timestamptz not null default now()
);

-- ─── ADMIN USERS (管理员 & 巡逻员) ───────────────────────────────────────────
create type user_role as enum ('admin', 'patrol');

create table admin_users (
  id uuid primary key default uuid_generate_v4(),
  username text not null unique,
  password_hash text not null,
  role user_role not null default 'patrol',
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login timestamptz
);

-- ─── NOTIFICATION EMAILS (举报邮件收件人) ─────────────────────────────────────
create table notification_emails (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- Public: allow insert on visitor_registrations, violation_reports, resident_vehicles
-- All reads go through API routes (service role key), so we lock down direct access.

alter table units enable row level security;
alter table resident_vehicles enable row level security;
alter table visitor_registrations enable row level security;
alter table visitor_monthly_quota enable row level security;
alter table abuse_alerts enable row level security;
alter table violation_reports enable row level security;
alter table admin_users enable row level security;
alter table notification_emails enable row level security;

-- Allow anonymous reads on units (needed for dropdowns)
create policy "units_public_read" on units for select using (active = true);

-- All other access via service_role key in API routes (bypasses RLS)

-- ─── SEED: default admin user ─────────────────────────────────────────────────
-- Password: Admin@2026  (change after first login!)
-- bcrypt hash generated for 'Admin@2026' with cost factor 10
insert into admin_users (username, password_hash, role, display_name)
values (
  'admin',
  '$2a$10$rQnCMaB5p.m7l1kJxDc0/.JnKqPjE3YaI1AW3jLFBpMCcJXkBjrDm',
  'admin',
  'System Administrator'
);

-- ─── HELPER FUNCTION: update updated_at ───────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger resident_vehicles_updated_at
  before update on resident_vehicles
  for each row execute function update_updated_at();
