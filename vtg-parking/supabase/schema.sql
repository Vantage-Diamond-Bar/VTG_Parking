-- Vantage Parking Management System - Database Schema (canonical current state)
-- Last updated: 2026-05-27 — reflects all migrations through 20260527_schema_catch_up.sql.
--
-- Use this file to set up a fresh database.
-- For an existing database, run 20260527_schema_catch_up.sql instead.

create extension if not exists "uuid-ossp";

-- ─── ENUMS ────────────────────────────────────────────────────────────────────
create type user_role as enum ('admin', 'patrol');

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
  'Vehicle Parked for Over 96 Hours Without Movement',
  'Opposite Direction of Traffic',
  'Parking Outside Designated Spaces',
  'Parking in Red-Curb Zone',
  'Unauthorized Commercial Vehicle',
  'Parking in Handicap Space Without Permit',
  'Safety Concern (Suspicious Person/Vehicle)',
  'Other'
);

-- ─── UNITS (门牌号) ───────────────────────────────────────────────────────────
create table units (
  id          uuid    primary key default uuid_generate_v4(),
  unit_number text    not null unique,
  address     text    not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── ADMIN USERS (管理员 & 巡逻员) ───────────────────────────────────────────
create table admin_users (
  id            uuid      primary key default uuid_generate_v4(),
  username      text      not null unique,
  password_hash text      not null,
  role          user_role not null default 'patrol',
  display_name  text,
  email         text,
  active        boolean   not null default true,
  created_at    timestamptz not null default now(),
  last_login    timestamptz
);

-- ─── EMAIL OTPs ───────────────────────────────────────────────────────────────
-- Used for both host identity verification (unit_id = units.id) and admin MFA
-- (unit_id = admin_users.id — no FK enforced so admin UUIDs are accepted).
create table email_otps (
  id            uuid        primary key default uuid_generate_v4(),
  unit_id       uuid        not null,
  email         text        not null,
  otp_hash      text        not null,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  attempt_count integer     not null default 0,
  created_at    timestamptz not null default now()
);

create index idx_email_otps_lookup
  on email_otps(unit_id, email, expires_at)
  where used_at is null;

-- ─── RESIDENT VEHICLES (住户车辆) ─────────────────────────────────────────────
create table resident_vehicles (
  id                       uuid    primary key default uuid_generate_v4(),
  unit_id                  uuid    not null references units(id) on delete cascade,
  year                     integer not null,
  make                     text    not null,
  model                    text    not null,
  color                    text    not null,
  license_plate            text    not null,
  plate_state              text    not null,
  owner_name               text    not null,
  owner_phone              text,
  owner_phone_country_code text,
  owner_email              text,
  opt_in_sms               boolean not null default false,
  opt_in_email             boolean not null default false,
  registration_doc_url     text,
  registrant_type          text    not null default 'owner',
  is_oversized             boolean not null default false,
  vehicle_type             text,
  approval_status          text    not null default 'approved',
  admin_notes              text,
  reviewed_at              timestamptz,
  reviewed_by              text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint resident_vehicles_approval_status_check
    check (approval_status in ('approved', 'pending', 'rejected'))
);

create index idx_resident_vehicles_plate    on resident_vehicles(upper(license_plate));
create index idx_resident_vehicles_unit     on resident_vehicles(unit_id);
create index idx_resident_vehicles_approval on resident_vehicles(unit_id, approval_status)
  where approval_status != 'approved';

-- ─── VISITOR REGISTRATIONS (访客停车登记) ─────────────────────────────────────
create table visitor_registrations (
  id                          uuid        primary key default uuid_generate_v4(),
  unit_id                     uuid        not null references units(id) on delete cascade,
  access_code                 text        not null unique,
  visitor_name                text,
  visitor_phone               text,
  visitor_phone_country_code  text,
  license_plate               text        not null,
  plate_state                 text        not null,
  make                        text,
  model                       text,
  color                       text,
  start_datetime              timestamptz not null,
  end_datetime                timestamptz not null,
  created_at                  timestamptz not null default now()
);

create index idx_visitor_plate       on visitor_registrations(upper(license_plate));
create index idx_visitor_access_code on visitor_registrations(access_code);
create index idx_visitor_unit        on visitor_registrations(unit_id);
create index idx_visitor_dates       on visitor_registrations(start_datetime, end_datetime);

-- ─── VACATION PARKING REQUESTS (假期停车申请) ─────────────────────────────────
create table vacation_parking_requests (
  id                           uuid        primary key default uuid_generate_v4(),
  unit_id                      uuid        not null references units(id) on delete cascade,
  status                       text        not null default 'pending',
  registrant_type              text,
  first_name                   text        not null,
  last_name                    text        not null,
  phone                        text        not null,
  phone_country_code           text,
  email                        text,
  reason                       text,
  emergency_first_name         text,
  emergency_last_name          text,
  emergency_phone              text,
  emergency_phone_country_code text,
  year                         integer,
  make                         text,
  model                        text,
  color                        text,
  license_plate                text        not null,
  plate_state                  text,
  is_registered_vehicle        boolean     not null default false,
  is_eligible                  boolean     not null default false,
  admin_notes                  text,
  rejection_reason             text,
  access_code                  text,
  reviewed_at                  timestamptz,
  reviewed_by                  text,
  submitted_at                 timestamptz not null default now(),
  created_at                   timestamptz not null default now(),
  constraint vacation_parking_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create index idx_vacation_unit      on vacation_parking_requests(unit_id);
create index idx_vacation_status    on vacation_parking_requests(status);
create index idx_vacation_plate     on vacation_parking_requests(upper(license_plate));
create index idx_vacation_submitted on vacation_parking_requests(submitted_at);

-- ─── ABUSE ALERTS (滥用警示) ──────────────────────────────────────────────────
create table abuse_alerts (
  id                 uuid    primary key default uuid_generate_v4(),
  license_plate      text    not null,
  plate_state        text    not null,
  year_month         text    not null,
  unit_ids           text[]  not null,
  registration_count integer not null,
  is_resolved        boolean not null default false,
  resolved_at        timestamptz,
  resolved_note      text,
  created_at         timestamptz not null default now(),
  unique (license_plate, year_month)
);

create index idx_abuse_alerts_resolved on abuse_alerts(is_resolved);

-- ─── VIOLATION REPORTS (违章举报) ─────────────────────────────────────────────
create table violation_reports (
  id                   uuid               primary key default uuid_generate_v4(),
  location             violation_location not null,
  violation_type       violation_type     not null,
  description          text,
  photo_urls           text[]             not null default '{}',
  license_plate        text,
  reporter_email       text,
  status               text               not null default 'new',
  resolution_type      text,
  admin_notes          text,
  unit_address         text,
  processed_at         timestamptz,
  call_hearing         boolean            not null default false,
  final_license_plate  text,
  final_violation_type text,
  final_location       text,
  submitted_at         timestamptz        not null default now(),
  constraint violation_reports_status_check
    check (status in ('new', 'in_review', 'resolved', 'no_action'))
);

create index idx_violation_status       on violation_reports(status);
create index idx_violation_unit_address on violation_reports(unit_address);

-- ─── OVERSIZED APPLICATIONS (legacy — data migrated into resident_vehicles) ───
-- Kept so 20260525_merge_oversized_into_residents.sql can run on a fresh database.
create table oversized_applications (
  id                       uuid        primary key default uuid_generate_v4(),
  unit_id                  uuid        not null references units(id) on delete cascade,
  status                   text        not null default 'pending',
  registrant_type          text,
  owner_name               text        not null,
  owner_phone              text,
  owner_phone_country_code text,
  owner_email              text,
  year                     integer,
  make                     text        not null,
  model                    text        not null,
  color                    text        not null,
  license_plate            text        not null,
  plate_state              text,
  registration_doc_url     text,
  is_oversized             boolean     not null default true,
  vehicle_type             text,
  admin_notes              text,
  reviewed_at              timestamptz,
  reviewed_by              text,
  created_at               timestamptz not null default now()
);

-- ─── NOTIFICATION EMAILS (举报邮件收件人) ─────────────────────────────────────
create table notification_emails (
  id         uuid    primary key default uuid_generate_v4(),
  email      text    not null unique,
  label      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table units                     enable row level security;
alter table admin_users               enable row level security;
alter table email_otps                enable row level security;
alter table resident_vehicles         enable row level security;
alter table visitor_registrations     enable row level security;
alter table vacation_parking_requests enable row level security;
alter table abuse_alerts              enable row level security;
alter table violation_reports         enable row level security;
alter table oversized_applications    enable row level security;
alter table notification_emails       enable row level security;

-- Allow anonymous reads on units (needed for address dropdowns on public forms)
create policy "units_public_read" on units for select using (active = true);

-- All other access goes through API routes using the service_role key (bypasses RLS).

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────
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

-- ─── STORED PROCEDURE: book_visitor_registration ──────────────────────────────
-- Atomic quota check + insert using an advisory lock to eliminate race conditions.
-- See 20260525_visitor_booking_lock.sql for implementation notes.
create or replace function book_visitor_registration(
  p_unit_id                    uuid,
  p_visitor_name               text,
  p_visitor_phone              text,
  p_visitor_phone_country_code text,
  p_license_plate              text,
  p_plate_state                text,
  p_make                       text,
  p_model                      text,
  p_color                      text,
  p_start_datetime             timestamptz,
  p_end_datetime               timestamptz,
  p_access_code                text,
  p_quota_limit                integer default 10
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_month_start_ts  timestamptz;
  v_month_end_ts    timestamptz;
  v_used_nights     integer;
  v_new_nights      integer;
  v_reg_id          uuid;
  v_iter_month      date;
  v_start_month     date;
  v_end_month       date;
begin
  perform pg_advisory_xact_lock(hashtext(p_unit_id::text)::bigint);

  v_start_month := date_trunc('month', p_start_datetime)::date;
  v_end_month   := date_trunc('month', p_end_datetime)::date;
  v_iter_month  := v_start_month;

  while v_iter_month <= v_end_month loop
    v_month_start_ts := v_iter_month::timestamp at time zone 'UTC';
    v_month_end_ts   := (v_iter_month + interval '1 month')::timestamp at time zone 'UTC';

    select coalesce(sum(
      ((least(r.end_datetime, v_month_end_ts)   at time zone 'America/Los_Angeles')::date -
       (greatest(r.start_datetime, v_month_start_ts) at time zone 'America/Los_Angeles')::date
      )::integer
    ), 0)
    into v_used_nights
    from visitor_registrations r
    where r.unit_id = p_unit_id
      and r.start_datetime < v_month_end_ts
      and r.end_datetime   > v_month_start_ts;

    v_new_nights := greatest(0, (
      (least(p_end_datetime, v_month_end_ts)     at time zone 'America/Los_Angeles')::date -
      (greatest(p_start_datetime, v_month_start_ts) at time zone 'America/Los_Angeles')::date
    )::integer);

    if v_new_nights > 0 and (v_used_nights + v_new_nights) > p_quota_limit then
      return jsonb_build_object('error', 'quota_exceeded');
    end if;

    v_iter_month := v_iter_month + interval '1 month';
  end loop;

  insert into visitor_registrations (
    unit_id, visitor_name, visitor_phone, visitor_phone_country_code,
    license_plate, plate_state, make, model, color,
    start_datetime, end_datetime, access_code
  ) values (
    p_unit_id, p_visitor_name, p_visitor_phone, p_visitor_phone_country_code,
    p_license_plate, p_plate_state, p_make, p_model, p_color,
    p_start_datetime, p_end_datetime, p_access_code
  )
  returning id into v_reg_id;

  return jsonb_build_object('success', true, 'id', v_reg_id::text);
end;
$$;

-- ─── SEED: initial admin user ─────────────────────────────────────────────────
-- DO NOT insert a default password here. Generate a bcrypt hash and insert manually:
--
--   node -e "require('bcryptjs').hash('<your-password>', 10).then(console.log)"
--
--   INSERT INTO admin_users (username, password_hash, role, display_name, email)
--   VALUES ('admin', '<hash>', 'admin', 'System Administrator', 'admin@example.com');
--
-- Store the password in your team's password manager immediately.
