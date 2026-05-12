import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateAccessCode, getYearMonth, normalizedPlate, VISITOR_QUOTA_LIMIT, countNights, monthBounds } from '@/lib/utils';
import { getSessionFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { unit_id, visitor_name, visitor_phone, license_plate, plate_state, make, model, color, start_datetime, end_datetime } = body;

  // 1. Normalize plate
  const plate = normalizedPlate(license_plate);

  // 2. Check plate not in resident_vehicles
  const { data: resident } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id')
    .ilike('license_plate', plate)
    .maybeSingle();

  if (resident) {
    return NextResponse.json({ error: 'plate_conflict' }, { status: 409 });
  }

  // 3. Check quota — compute live from visitor_registrations (never trust cached table)
  const year_month = getYearMonth();
  const { start: monthStart, end: monthEnd } = monthBounds(year_month);

  const { data: existingRegs } = await supabaseAdmin
    .from('visitor_registrations')
    .select('start_datetime, end_datetime')
    .eq('unit_id', unit_id)
    .gte('start_datetime', monthStart)
    .lt('start_datetime', monthEnd);

  const currentNightsUsed = (existingRegs ?? []).reduce(
    (sum, r) => sum + countNights(r.start_datetime, r.end_datetime),
    0
  );
  const newNights = countNights(start_datetime, end_datetime);

  if (currentNightsUsed + newNights > VISITOR_QUOTA_LIMIT) {
    return NextResponse.json({ error: 'quota_exceeded' }, { status: 429 });
  }

  // 4. Generate unique access code
  let access_code = '';
  for (let i = 0; i < 5; i++) {
    const candidate = generateAccessCode();
    const { data: collision } = await supabaseAdmin
      .from('visitor_registrations')
      .select('id')
      .eq('access_code', candidate)
      .maybeSingle();

    if (!collision) {
      access_code = candidate;
      break;
    }
  }

  if (!access_code) {
    return NextResponse.json({ error: 'Failed to generate unique access code' }, { status: 500 });
  }

  // 5. Insert visitor registration
  const { data: registration, error: insertError } = await supabaseAdmin
    .from('visitor_registrations')
    .insert({
      unit_id,
      visitor_name,
      visitor_phone: visitor_phone ?? null,
      license_plate: plate,
      plate_state,
      make,
      model,
      color,
      start_datetime,
      end_datetime,
      access_code,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // 6. Upsert visitor monthly quota with actual night count
  await supabaseAdmin
    .from('visitor_monthly_quota')
    .upsert(
      { unit_id, year_month, nights_used: currentNightsUsed + newNights },
      { onConflict: 'unit_id,year_month' }
    );

  // 7. Check for abuse: same plate used by 2+ units this month
  const abuseMonthStart = `${year_month}-01`;
  const { data: sameplateLogs } = await supabaseAdmin
    .from('visitor_registrations')
    .select('unit_id')
    .ilike('license_plate', plate)
    .gte('created_at', abuseMonthStart);

  if (sameplateLogs) {
    const uniqueUnits = new Set(sameplateLogs.map((r: any) => r.unit_id));
    if (uniqueUnits.size >= 2) {
      await supabaseAdmin
        .from('abuse_alerts')
        .upsert(
          {
            license_plate: plate,
            year_month,
            unit_ids: Array.from(uniqueUnits),
            is_resolved: false,
          },
          { onConflict: 'license_plate,year_month' }
        );
    }
  }

  return NextResponse.json({ success: true, access_code, end_datetime });
}

export async function GET(req: NextRequest) {
  // Page is protected by admin layout; no per-route auth needed here
  const { searchParams } = new URL(req.url);
  const unit_id = searchParams.get('unit_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const page = parseInt(searchParams.get('page') || '0', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = page * limit;

  let query = supabaseAdmin
    .from('visitor_registrations')
    .select('*, units(address)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (unit_id) query = query.eq('unit_id', unit_id);
  if (from) query = query.gte('start_datetime', from);
  if (to) query = query.lte('end_datetime', to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, total: count, page, limit });
}
