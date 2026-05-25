export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getYearMonth, monthBounds, countNights, VISITOR_QUOTA_LIMIT } from '@/lib/utils';
import { decodeVerificationToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const unit_id = searchParams.get('unit_id');
  const token = searchParams.get('token');

  if (!unit_id || !token) {
    return NextResponse.json({ error: 'unit_id and token are required' }, { status: 400 });
  }

  const tokenData = decodeVerificationToken(token);
  if (!tokenData || tokenData.unit_id !== unit_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const normalizedEmail = tokenData.email;

  // Step 1: Fetch all resident_vehicles for unit_id (approved + pending)
  const { data: vehicles, error: vehiclesError } = await supabaseAdmin
    .from('resident_vehicles')
    .select('*')
    .eq('unit_id', unit_id);

  if (vehiclesError) {
    console.error('[unit-data] vehicles error:', vehiclesError);
    return NextResponse.json({ error: 'Failed to fetch vehicles', detail: vehiclesError.message }, { status: 500 });
  }

  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json({ error: 'no_vehicles' }, { status: 404 });
  }

  // Confirm the verified email still matches (any status — pending owners can view their data too)
  const emailMatches = vehicles.some(
    (v) => v.owner_email?.trim().toLowerCase() === normalizedEmail
  );

  if (!emailMatches) {
    return NextResponse.json({ error: 'email_mismatch' }, { status: 403 });
  }

  // Step 3: Get unit address — prefer resident_vehicles unit_id join, fallback to direct query
  let unit_address: string | null = null;
  try {
    const { data: unit } = await supabaseAdmin
      .from('units')
      .select('address')
      .eq('id', unit_id)
      .maybeSingle();
    unit_address = unit?.address ?? null;
  } catch {
    // non-fatal: proceed without unit_address
  }

  // If units table lookup failed, try to get address from existing vehicles
  if (!unit_address) {
    const { data: vehicleWithUnit } = await supabaseAdmin
      .from('resident_vehicles')
      .select('units(address)')
      .eq('unit_id', unit_id)
      .limit(1)
      .maybeSingle();
    unit_address = (vehicleWithUnit?.units as any)?.address ?? null;
  }

  // Step 4: Fetch violations (last 2 years) — only if we have unit_address
  let violations: any[] = [];
  if (unit_address) {
    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const { data: vData } = await supabaseAdmin
        .from('violation_reports')
        .select('id, submitted_at, location, violation_type, status, resolution_type, final_license_plate, license_plate, final_violation_type, final_location')
        .eq('unit_address', unit_address)
        .gte('submitted_at', twoYearsAgo.toISOString())
        .order('submitted_at', { ascending: false });
      violations = vData ?? [];
    } catch {
      // non-fatal
    }
  }

  // Step 5: Fetch visitor quota for current month
  let nights_used = 0;
  try {
    const yearMonth = getYearMonth();
    const { start, end } = monthBounds(yearMonth);
    const { data: visitorRegs } = await supabaseAdmin
      .from('visitor_registrations')
      .select('start_datetime, end_datetime')
      .eq('unit_id', unit_id)
      .gte('start_datetime', start)
      .lt('start_datetime', end);
    nights_used = (visitorRegs ?? []).reduce(
      (total, reg) => total + countNights(reg.start_datetime, reg.end_datetime),
      0
    );
  } catch {
    // non-fatal
  }

  // Step 6: Split vehicles by approval_status
  // Approved vehicles are the active registrations; pending are awaiting garage check.
  const approvedVehicles = vehicles.filter((v) => v.approval_status === 'approved');
  const oversized_pending = vehicles
    .filter((v) => v.approval_status === 'pending')
    .map((v) => ({
      id: v.id,
      year: v.year,
      make: v.make,
      model: v.model,
      color: v.color,
      license_plate: v.license_plate,
      plate_state: v.plate_state,
      vehicle_type: v.vehicle_type,
      status: v.approval_status,
      created_at: v.created_at,
      // Owner contact fields — needed when all vehicles are pending (no approved firstVehicle)
      owner_name: v.owner_name,
      owner_phone: v.owner_phone,
      owner_phone_country_code: v.owner_phone_country_code,
      owner_email: v.owner_email,
      registrant_type: v.registrant_type,
    }));

  return NextResponse.json({
    vehicles: approvedVehicles,
    oversized_pending,
    unit_address,
    violations,
    quota: {
      nights_used,
      quota_limit: VISITOR_QUOTA_LIMIT,
    },
  });
}
