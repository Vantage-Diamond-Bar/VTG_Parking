import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateAccessCode, getYearMonth, normalizedPlate, VISITOR_QUOTA_LIMIT, countNights, monthBounds } from '@/lib/utils';
import { getSessionFromRequest } from '@/lib/auth';
import { sendVisitorBookingEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { unit_id, visitor_name, visitor_phone, visitor_phone_country_code, license_plate, plate_state, make, model, color, start_datetime, end_datetime } = body;

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

  // 3. Check quota per month — cross-month bookings are split and checked against each month
  function spannedMonths(start: string, end: string): string[] {
    const months: string[] = [];
    let y = parseInt(start.slice(0, 4)), m = parseInt(start.slice(5, 7));
    const ey = parseInt(end.slice(0, 4)), em = parseInt(end.slice(5, 7));
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      if (++m > 12) { m = 1; y++; }
    }
    return months;
  }

  const year_month = start_datetime ? start_datetime.slice(0, 7) : getYearMonth();
  const months = spannedMonths(
    start_datetime ? start_datetime.slice(0, 7) : year_month,
    end_datetime   ? end_datetime.slice(0, 7)   : year_month
  );

  let currentNightsUsed = 0;
  let newNights = 0;

  for (const month of months) {
    const { start: mStart, end: mEnd } = monthBounds(month);
    const { data: mRegs } = await supabaseAdmin
      .from('visitor_registrations')
      .select('start_datetime, end_datetime')
      .eq('unit_id', unit_id)
      .lt('start_datetime', mEnd)
      .gt('end_datetime', mStart);

    const usedInMonth = (mRegs ?? []).reduce((sum, r) => {
      const cs = r.start_datetime > mStart ? r.start_datetime : mStart;
      const ce = r.end_datetime   < mEnd   ? r.end_datetime   : mEnd;
      return sum + countNights(cs, ce);
    }, 0);

    const cs = start_datetime > mStart ? start_datetime : mStart;
    const ce = end_datetime   < mEnd   ? end_datetime   : mEnd;
    const newInMonth = countNights(cs, ce);

    if (usedInMonth + newInMonth > VISITOR_QUOTA_LIMIT) {
      return NextResponse.json({ error: 'quota_exceeded' }, { status: 429 });
    }

    if (month === year_month) {
      currentNightsUsed = usedInMonth;
      newNights = newInMonth;
    }
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
      visitor_phone_country_code: visitor_phone_country_code ?? null,
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

  // 7. Send booking confirmation email to host unit's registered email
  try {
    const { data: hostVehicle } = await supabaseAdmin
      .from('resident_vehicles')
      .select('owner_email, owner_name')
      .eq('unit_id', unit_id)
      .maybeSingle()

    const { data: unitRow } = await supabaseAdmin
      .from('units')
      .select('address')
      .eq('id', unit_id)
      .maybeSingle()

    if (hostVehicle?.owner_email) {
      await sendVisitorBookingEmail({
        hostEmail: hostVehicle.owner_email,
        hostName: hostVehicle.owner_name ?? '',
        unitAddress: unitRow?.address ?? '',
        accessCode: access_code,
        visitorName: visitor_name,
        licensePlate: plate,
        make,
        model,
        color,
        startDatetime: start_datetime,
        endDatetime: end_datetime,
      })
    }
  } catch {}

  // 8. Check for abuse: same plate used by 2+ units this month
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
            plate_state: plate_state ?? '',
            year_month,
            unit_ids: Array.from(uniqueUnits),
            registration_count: sameplateLogs.length,
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
