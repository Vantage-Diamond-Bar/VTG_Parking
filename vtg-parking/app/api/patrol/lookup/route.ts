import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
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
  const session = await getSession();
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
      .select('*, units(unit_number, address)')
      .ilike('license_plate', plate)
      .maybeSingle();

    if (resident) {
      return NextResponse.json({ type: 'resident', vehicle: resident });
    }

    // Check visitor registrations - most recent
    const { data: visitors } = await supabaseAdmin
      .from('visitor_registrations')
      .select('*, units(unit_number, address)')
      .ilike('license_plate', plate)
      .order('start_datetime', { ascending: false })
      .limit(1);

    if (visitors && visitors.length > 0) {
      const reg = visitors[0];
      const status = determineStatus(reg.start_datetime, reg.end_datetime);
      return NextResponse.json({ type: 'visitor', registration: reg, status });
    }

    return NextResponse.json({ type: 'not_found' });
  }

  // Lookup by access code
  const { data: registration } = await supabaseAdmin
    .from('visitor_registrations')
    .select('*, units(unit_number, address)')
    .eq('access_code', code!.toUpperCase())
    .maybeSingle();

  if (!registration) {
    return NextResponse.json({ type: 'not_found' });
  }

  const status = determineStatus(registration.start_datetime, registration.end_datetime);
  return NextResponse.json({ type: 'visitor', registration, status });
}
