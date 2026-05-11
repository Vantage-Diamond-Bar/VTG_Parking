import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionFromRequest } from '@/lib/auth';
import { normalizedPlate } from '@/lib/utils';

function determineStatus(start: string, end: string): 'active' | 'expired' | 'upcoming' {
  const now = new Date();
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (now < startDate) return 'upcoming';
  if (now > endDate) return 'expired';
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

  if (rawPlate) {
    const plate = normalizedPlate(rawPlate);

    // Check resident vehicles
    const { data: resident } = await supabaseAdmin
      .from('resident_vehicles')
      .select('*, units(address)')
      .ilike('license_plate', plate)
      .maybeSingle();

    if (resident) {
      return NextResponse.json({
        found: true,
        type: 'resident',
        address: (resident.units as any)?.address ?? null,
        owner_name: resident.owner_name,
        year: resident.year,
        make: resident.make,
        model: resident.model,
        color: resident.color,
        plate: resident.license_plate,
        state: resident.plate_state,
      });
    }

    // Check visitor registrations - most recent
    const { data: visitors } = await supabaseAdmin
      .from('visitor_registrations')
      .select('*, units(address)')
      .ilike('license_plate', plate)
      .order('start_datetime', { ascending: false })
      .limit(1);

    if (visitors && visitors.length > 0) {
      const reg = visitors[0];
      const status = determineStatus(reg.start_datetime, reg.end_datetime);
      return NextResponse.json({
        found: true,
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
        status,
      });
    }

    return NextResponse.json({ found: false, type: 'not_found' });
  }

  // Lookup by access code
  const { data: registration } = await supabaseAdmin
    .from('visitor_registrations')
    .select('*, units(address)')
    .eq('access_code', code!.toUpperCase())
    .maybeSingle();

  if (!registration) {
    return NextResponse.json({ found: false, type: 'not_found' });
  }

  const status = determineStatus(registration.start_datetime, registration.end_datetime);
  return NextResponse.json({
    found: true,
    type: 'visitor',
    address: (registration.units as any)?.address ?? null,
    guest_name: registration.visitor_name ?? null,
    plate: registration.license_plate,
    state: registration.plate_state,
    make: registration.make,
    model: registration.model,
    color: registration.color,
    valid_from: registration.start_datetime,
    valid_until: registration.end_datetime,
    status,
  });
}
