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

    // 1. Parallel: resident vehicles + non-expired approved vacation
    const [residentRes, vacationRes] = await Promise.all([
      supabaseAdmin
        .from('resident_vehicles')
        .select('*, units(address)')
        .ilike('license_plate', plate)
        // approved (any) OR pending oversized (awaiting admin review)
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

    // 2. Only check visitor if no resident/vacation match (a resident plate
    //    can never be registered as visitor — plate_conflict blocks it)
    if (results.length === 0) {
      const { data: visitors } = await supabaseAdmin
        .from('visitor_registrations')
        .select('*, units(address)')
        .ilike('license_plate', plate)
        .order('start_datetime', { ascending: false })
        .limit(1);

      if (visitors && visitors.length > 0) {
        const reg = visitors[0];
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
          status: determineStatus(reg.start_datetime, reg.end_datetime),
        });
      }
    }

    // 3. Unit context: other vehicles + current/future visitors for the same unit
    const unit_id: string | null =
      residentRes.data?.unit_id ??
      vacationRes.data?.[0]?.unit_id ??
      null;

    let unit_vehicles: object[] = [];
    let unit_visitors: object[] = [];

    if (unit_id) {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [otherVehiclesRes, unitVisitorsRes] = await Promise.all([
        supabaseAdmin
          .from('resident_vehicles')
          .select('owner_name, year, make, model, color, license_plate, plate_state, is_oversized, vehicle_type')
          .eq('unit_id', unit_id)
          .eq('approval_status', 'approved')
          .not('license_plate', 'ilike', plate),
        supabaseAdmin
          .from('visitor_registrations')
          .select('visitor_name, license_plate, plate_state, make, model, color, start_datetime, end_datetime')
          .eq('unit_id', unit_id)
          .gte('end_datetime', monthStart)
          .order('start_datetime', { ascending: true })
          .limit(20),
      ]);

      unit_vehicles = (otherVehiclesRes.data ?? []).map((v) => ({
        owner_name: v.owner_name,
        year: v.year,
        make: v.make,
        model: v.model,
        color: v.color,
        plate: v.license_plate,
        state: v.plate_state,
        is_oversized: v.is_oversized,
        vehicle_type: v.vehicle_type,
      }));

      unit_visitors = (unitVisitorsRes.data ?? []).map((v) => ({
        guest_name: v.visitor_name ?? null,
        plate: v.license_plate,
        state: v.plate_state,
        make: v.make,
        model: v.model,
        color: v.color,
        valid_from: v.start_datetime,
        valid_until: v.end_datetime,
        status: determineStatus(v.start_datetime, v.end_datetime),
      }));
    }

    return NextResponse.json({ found: results.length > 0, results, unit_vehicles, unit_visitors });
  }

  /* ── Lookup by access code ── */
  // Access codes are unique — a code belongs to either a visitor reg or a vacation req, never both
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

  // Fetch unit context (other vehicles + current/upcoming visitors) for the same unit
  const unit_id: string | null =
    visitorRes.data?.unit_id ?? vacationByCodeRes.data?.unit_id ?? null;

  let unit_vehicles: object[] = [];
  let unit_visitors: object[] = [];

  if (unit_id) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const primaryPlate: string | null =
      visitorRes.data?.license_plate ?? vacationByCodeRes.data?.license_plate ?? null;

    let otherVehiclesQuery = supabaseAdmin
      .from('resident_vehicles')
      .select('owner_name, year, make, model, color, license_plate, plate_state, is_oversized, vehicle_type')
      .eq('unit_id', unit_id)
      .eq('approval_status', 'approved');
    if (primaryPlate) {
      otherVehiclesQuery = otherVehiclesQuery.not('license_plate', 'ilike', primaryPlate);
    }

    const [otherVehiclesRes, unitVisitorsRes] = await Promise.all([
      otherVehiclesQuery,
      supabaseAdmin
        .from('visitor_registrations')
        .select('visitor_name, license_plate, plate_state, make, model, color, start_datetime, end_datetime')
        .eq('unit_id', unit_id)
        .gte('end_datetime', monthStart)
        .order('start_datetime', { ascending: true })
        .limit(20),
    ]);

    unit_vehicles = (otherVehiclesRes.data ?? []).map((v) => ({
      owner_name: v.owner_name,
      year: v.year,
      make: v.make,
      model: v.model,
      color: v.color,
      plate: v.license_plate,
      state: v.plate_state,
      is_oversized: v.is_oversized,
      vehicle_type: v.vehicle_type,
    }));

    unit_visitors = (unitVisitorsRes.data ?? []).map((v) => ({
      guest_name: v.visitor_name ?? null,
      plate: v.license_plate,
      state: v.plate_state,
      make: v.make,
      model: v.model,
      color: v.color,
      valid_from: v.start_datetime,
      valid_until: v.end_datetime,
      status: determineStatus(v.start_datetime, v.end_datetime),
    }));
  }

  return NextResponse.json({ found: results.length > 0, results, unit_vehicles, unit_visitors });
}
