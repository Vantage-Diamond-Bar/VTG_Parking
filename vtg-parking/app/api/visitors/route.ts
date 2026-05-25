import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateAccessCode, getYearMonth, normalizedPlate, VISITOR_QUOTA_LIMIT } from '@/lib/utils';
import { getSessionFromRequest, verifyVerificationToken } from '@/lib/auth';
import { sendVisitorBookingEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    unit_id, visitor_name, visitor_phone, visitor_phone_country_code,
    license_plate, plate_state, make, model, color,
    start_datetime, end_datetime,
    verification_token,
  } = body;

  // Fix 3: Require a valid host-verification token signed by the server
  if (!verifyVerificationToken(verification_token, unit_id)) {
    return NextResponse.json({ error: 'Invalid or expired verification token' }, { status: 403 });
  }

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

  // 3. Generate unique access code
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

  // 4. Fix 4: Atomically check quota and insert via DB stored procedure.
  //    pg_advisory_xact_lock inside the function serializes concurrent requests for the same unit.
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('book_visitor_registration', {
    p_unit_id: unit_id,
    p_visitor_name: visitor_name ?? null,
    p_visitor_phone: visitor_phone ?? null,
    p_visitor_phone_country_code: visitor_phone_country_code ?? null,
    p_license_plate: plate,
    p_plate_state: plate_state,
    p_make: make ?? null,
    p_model: model ?? null,
    p_color: color ?? null,
    p_start_datetime: start_datetime,
    p_end_datetime: end_datetime,
    p_access_code: access_code,
    p_quota_limit: VISITOR_QUOTA_LIMIT,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  if (rpcResult?.error === 'quota_exceeded') {
    return NextResponse.json({ error: 'quota_exceeded' }, { status: 429 });
  }

  if (!rpcResult?.success) {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }

  // 5. Send booking confirmation email to host unit's registered email
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

  // 6. Check for abuse: same plate used by 2+ units this month
  const year_month = start_datetime ? start_datetime.slice(0, 7) : getYearMonth();
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
  // Require admin role — this endpoint returns all visitor PII
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
