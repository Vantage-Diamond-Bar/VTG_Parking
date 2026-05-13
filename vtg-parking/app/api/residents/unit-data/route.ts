import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getYearMonth, monthBounds, countNights, VISITOR_QUOTA_LIMIT } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const unit_id = searchParams.get('unit_id');
  const email = searchParams.get('email');

  if (!unit_id || !email) {
    return NextResponse.json({ error: 'unit_id and email are required' }, { status: 400 });
  }

  // Step 1: Fetch all resident_vehicles for unit_id
  const { data: vehicles, error: vehiclesError } = await supabaseAdmin
    .from('resident_vehicles')
    .select('*')
    .eq('unit_id', unit_id);

  if (vehiclesError) {
    return NextResponse.json({ error: 'Failed to fetch vehicles' }, { status: 500 });
  }

  // Step 2: Verify email matches at least one vehicle's owner_email (case-insensitive)
  const normalizedEmail = email.trim().toLowerCase();
  const emailMatches = (vehicles ?? []).some(
    (v) => v.owner_email?.trim().toLowerCase() === normalizedEmail
  );

  if (!emailMatches) {
    return NextResponse.json({ error: 'email_mismatch' }, { status: 403 });
  }

  // Step 3: Fetch unit address
  const { data: unit, error: unitError } = await supabaseAdmin
    .from('units')
    .select('address')
    .eq('id', unit_id)
    .single();

  if (unitError || !unit) {
    return NextResponse.json({ error: 'Failed to fetch unit' }, { status: 500 });
  }

  // Step 4: Fetch violations (last 2 years)
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const { data: violations, error: violationsError } = await supabaseAdmin
    .from('violation_reports')
    .select(
      'id, submitted_at, location, violation_type, status, resolution_type, final_license_plate, license_plate, final_violation_type, final_location'
    )
    .eq('unit_address', unit.address)
    .gte('submitted_at', twoYearsAgo.toISOString())
    .order('submitted_at', { ascending: false });

  if (violationsError) {
    return NextResponse.json({ error: 'Failed to fetch violations' }, { status: 500 });
  }

  // Step 5: Fetch visitor quota for current month
  const yearMonth = getYearMonth();
  const { start, end } = monthBounds(yearMonth);

  const { data: visitorRegs, error: quotaError } = await supabaseAdmin
    .from('visitor_registrations')
    .select('*')
    .eq('unit_id', unit_id)
    .gte('start_date', start)
    .lte('start_date', end);

  if (quotaError) {
    return NextResponse.json({ error: 'Failed to fetch visitor quota' }, { status: 500 });
  }

  const nights_used = (visitorRegs ?? []).reduce((total, reg) => {
    return total + countNights(reg.start_date, reg.end_date);
  }, 0);

  return NextResponse.json({
    vehicles: vehicles ?? [],
    unit_address: unit.address,
    violations: violations ?? [],
    quota: {
      nights_used,
      quota_limit: VISITOR_QUOTA_LIMIT,
    },
  });
}
