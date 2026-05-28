import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionFromRequest } from '@/lib/auth';
import { normalizedPlate } from '@/lib/utils';

function determineStatus(start: string, end: string): 'active' | 'expired' | 'upcoming' {
  const now = new Date();
  if (now < new Date(start)) return 'upcoming';
  if (now > new Date(end)) return 'expired';
  return 'active';
}

/** First day of the previous calendar month (UTC midnight) */
function lastMonthStart(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Fetch all 3 unit-context sections for a given unit_id */
async function fetchUnitContext(unit_id: string) {
  const since = lastMonthStart();

  const [vehiclesRes, vacationsRes, visitorsRes] = await Promise.all([
    // All resident vehicles: approved OR pending oversized
    supabaseAdmin
      .from('resident_vehicles')
      .select('owner_name, year, make, model, color, license_plate, plate_state, is_oversized, approval_status, vehicle_type')
      .eq('unit_id', unit_id)
      .or('approval_status.eq.approved,and(approval_status.eq.pending,is_oversized.eq.true)'),
    // Approved vacation records from last month start onwards
    supabaseAdmin
      .from('vacation_parking_requests')
      .select('first_name, last_name, license_plate, plate_state, year, make, model, color, start_datetime, end_datetime, access_code')
      .eq('unit_id', unit_id)
      .eq('status', 'approved')
      .gte('end_datetime', since)
      .order('start_datetime', { ascending: true }),
    // Visitor registrations from last month start onwards
    supabaseAdmin
      .from('visitor_registrations')
      .select('visitor_name, license_plate, plate_state, make, model, color, start_datetime, end_datetime, access_code')
      .eq('unit_id', unit_id)
      .gte('end_datetime', since)
      .order('start_datetime', { ascending: true }),
  ]);

  const unit_vehicles = (vehiclesRes.data ?? []).map((v) => ({
    owner_name: v.owner_name,
    year: v.year,
    make: v.make,
    model: v.model,
    color: v.color,
    plate: v.license_plate,
    state: v.plate_state,
    is_oversized: v.is_oversized,
    approval_status: v.approval_status,
    vehicle_type: v.vehicle_type,
  }));

  const unit_vacations = (vacationsRes.data ?? []).map((v) => ({
    owner_name: `${v.first_name} ${v.last_name}`,
    plate: v.license_plate,
    state: v.plate_state,
    year: v.year,
    make: v.make,
    model: v.model,
    color: v.color,
    valid_from: v.start_datetime,
    valid_until: v.end_datetime,
    access_code: v.access_code,
    status: determineStatus(v.start_datetime, v.end_datetime),
  }));

  const unit_visitors = (visitorsRes.data ?? []).map((v) => ({
    guest_name: v.visitor_name ?? null,
    plate: v.license_plate,
    state: v.plate_state,
    make: v.make,
    model: v.model,
    color: v.color,
    valid_from: v.start_datetime,
    valid_until: v.end_datetime,
    access_code: v.access_code,
    status: determineStatus(v.start_datetime, v.end_datetime),
  }));

  return { unit_vehicles, unit_vacations, unit_visitors };
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin' && session.role !== 'patrol') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const rawPlate = searchParams.get('plate');
  const code = searchParams.get('code');

  if (!rawPlate && !code) {
    return NextResponse.json({ error: 'plate or code is required' }, { status: 400 });
  }

  /* ── Lookup by license plate ── */
  if (rawPlate) {
    const plate = normalizedPlate(rawPlate);
    const now = new Date().toISOString();
    const results: object[] = [];

    // Run all 3 checks in parallel — visitor is always checked so we can capture unit_id
    const [residentRes, vacationRes, visitorRes] = await Promise.all([
      supabaseAdmin
        .from('resident_vehicles')
        .select('*, units(address)')
        .ilike('license_plate', plate)
        .or('approval_status.eq.approved,and(approval_status.eq.pending,is_oversized.eq.true)')
        .maybeSingle(),
      supabaseAdmin
        .from('vacation_parking_requests')
        .select('*, units(address)')
        .ilike('license_plate', plate)
        .eq('status', 'approved')
        .gte('end_datetime', now)
        .order('start_datetime', { ascending: true })
        .limit(1),
      supabaseAdmin
        .from('visitor_registrations')
        .select('*, units(address)')
        .ilike('license_plate', plate)
        .order('start_datetime', { ascending: false })
        .limit(1),
    ]);

    if (residentRes.data) {
      const r = residentRes.data;
      results.push({
        type: 'resident',
        address: (r.units as any)?.address ?? null,
        owner_name: r.owner_name,
        year: r.year,
        make: r.make,
        model: r.model,
        color: r.color,
        plate: r.license_plate,
        state: r.plate_state,
        approval_status: r.approval_status,
        is_oversized: r.is_oversized,
      });
    }

    if (vacationRes.data && vacationRes.data.length > 0) {
      const v = vacationRes.data[0];
      results.push({
        type: 'vacation',
        address: (v.units as any)?.address ?? null,
        owner_name: `${v.first_name} ${v.last_name}`,
        plate: v.license_plate,
        state: v.plate_state,
        year: v.year,
        make: v.make,
        model: v.model,
        color: v.color,
        valid_from: v.start_datetime,
        valid_until: v.end_datetime,
        access_code: v.access_code,
        status: determineStatus(v.start_datetime, v.end_datetime),
      });
    }

    if (visitorRes.data && visitorRes.data.length > 0) {
      const reg = visitorRes.data[0];
      results.push({
        type: 'visitor',
        address: (reg.units as any)?.address ?? null,
        guest_name: reg.visitor_name ?? null,
        plate: reg.license_plate,
        state: reg.plate_state,
        make: reg.make,
        model: reg.model,
        color: reg.color,
        valid_from: reg.start_datetime,
        valid_until: reg.end_datetime,
        access_code: reg.access_code,
        status: determineStatus(reg.start_datetime, reg.end_datetime),
      });
    }

    // Determine unit_id from whichever match was found
    const unit_id: string | null =
      residentRes.data?.unit_id ??
      vacationRes.data?.[0]?.unit_id ??
      (visitorRes.data && visitorRes.data.length > 0 ? visitorRes.data[0].unit_id : null) ??
      null;

    let unit_vehicles: object[] = [];
    let unit_vacations: object[] = [];
    let unit_visitors: object[] = [];

    if (unit_id) {
      ({ unit_vehicles, unit_vacations, unit_visitors } = await fetchUnitContext(unit_id));
    }

    return NextResponse.json({ found: results.length > 0, results, unit_vehicles, unit_vacations, unit_visitors });
  }

  /* ── Lookup by access code ── */
  const [visitorRes, vacationByCodeRes] = await Promise.all([
    supabaseAdmin
      .from('visitor_registrations')
      .select('*, units(address)')
      .eq('access_code', code!.toUpperCase())
      .maybeSingle(),
    supabaseAdmin
      .from('vacation_parking_requests')
      .select('*, units(address)')
      .eq('access_code', code!.toUpperCase())
      .eq('status', 'approved')
      .maybeSingle(),
  ]);

  const results: object[] = [];

  if (visitorRes.data) {
    const reg = visitorRes.data;
    results.push({
      type: 'visitor',
      address: (reg.units as any)?.address ?? null,
      guest_name: reg.visitor_name ?? null,
      plate: reg.license_plate,
      state: reg.plate_state,
      make: reg.make,
      model: reg.model,
      color: reg.color,
      valid_from: reg.start_datetime,
      valid_until: reg.end_datetime,
      access_code: reg.access_code,
      status: determineStatus(reg.start_datetime, reg.end_datetime),
    });
  }

  if (vacationByCodeRes.data) {
    const v = vacationByCodeRes.data;
    results.push({
      type: 'vacation',
      address: (v.units as any)?.address ?? null,
      owner_name: `${v.first_name} ${v.last_name}`,
      plate: v.license_plate,
      state: v.plate_state,
      year: v.year,
      make: v.make,
      model: v.model,
      color: v.color,
      valid_from: v.start_datetime,
      valid_until: v.end_datetime,
      access_code: v.access_code,
      status: determineStatus(v.start_datetime, v.end_datetime),
    });
  }

  const unit_id: string | null =
    visitorRes.data?.unit_id ?? vacationByCodeRes.data?.unit_id ?? null;

  let unit_vehicles: object[] = [];
  let unit_vacations: object[] = [];
  let unit_visitors: object[] = [];

  if (unit_id) {
    ({ unit_vehicles, unit_vacations, unit_visitors } = await fetchUnitContext(unit_id));
  }

  return NextResponse.json({ found: results.length > 0, results, unit_vehicles, unit_vacations, unit_visitors });
}
