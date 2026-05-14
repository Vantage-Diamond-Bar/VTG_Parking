import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizedPlate } from '@/lib/utils';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { unit_id, owner_name, owner_phone, owner_email, opt_in_sms, opt_in_email, registrant_type, vehicles } = body;

  // First pass: validate plates and upload docs
  for (const vehicle of vehicles) {
    const plate = normalizedPlate(vehicle.license_plate);

    // Check for plate conflict in resident_vehicles
    const { data: existing } = await supabaseAdmin
      .from('resident_vehicles')
      .select('id')
      .ilike('license_plate', plate)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'plate_conflict', plate }, { status: 409 });

    // For oversized vehicles, also check if there's a pending application for this plate
    if (vehicle.is_oversized === true) {
      const { data: pendingApp } = await supabaseAdmin
        .from('oversized_applications')
        .select('id')
        .ilike('license_plate', plate)
        .eq('status', 'pending')
        .maybeSingle();
      if (pendingApp) return NextResponse.json({ error: 'plate_conflict', plate }, { status: 409 });
    }

    // Upload registration doc if provided
    let registration_doc_url: string | null = null;
    if (vehicle.registration_doc_base64 && vehicle.registration_doc_filename) {
      const ext = vehicle.registration_doc_filename.split('.').pop();
      const buffer = Buffer.from(vehicle.registration_doc_base64, 'base64');
      const path = `${unit_id}/${plate}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('registration-docs')
        .upload(path, buffer, { contentType: 'application/octet-stream', upsert: true });
      if (!uploadError) {
        registration_doc_url = supabaseAdmin.storage
          .from('registration-docs')
          .getPublicUrl(path).data.publicUrl;
      }
    }

    vehicle._normalized_plate = plate;
    vehicle._registration_doc_url = registration_doc_url;
  }

  // Second pass: route each vehicle to the right destination
  const regularRows: object[] = [];
  const oversizedPendingRows: object[] = [];

  for (const v of vehicles) {
    if (v.is_oversized === true) {
      // Check if there is already an approved application for this plate (renewal bypass)
      const { data: approvedApp } = await supabaseAdmin
        .from('oversized_applications')
        .select('id')
        .ilike('license_plate', v._normalized_plate)
        .eq('status', 'approved')
        .maybeSingle();

      if (approvedApp) {
        // Renewal bypass — insert directly to resident_vehicles with is_oversized: true
        regularRows.push({
          unit_id,
          owner_name,
          owner_phone,
          owner_email,
          registrant_type: registrant_type ?? 'owner',
          opt_in_sms: opt_in_sms ?? false,
          opt_in_email: opt_in_email ?? true,
          year: v.year,
          make: v.make,
          model: v.model,
          color: v.color,
          license_plate: v._normalized_plate,
          plate_state: v.plate_state,
          registration_doc_url: v._registration_doc_url,
          is_oversized: true,
          vehicle_type: v.vehicle_type ?? null,
        });
      } else {
        // No approved application — create a pending oversized_application record
        oversizedPendingRows.push({
          unit_id,
          owner_name,
          owner_phone: owner_phone ?? null,
          owner_email: owner_email ?? null,
          registrant_type: registrant_type ?? 'owner',
          year: v.year,
          make: v.make,
          model: v.model,
          color: v.color,
          license_plate: v._normalized_plate,
          plate_state: v.plate_state ?? null,
          registration_doc_url: v._registration_doc_url ?? null,
          vehicle_type: v.vehicle_type ?? null,
          status: 'pending',
        });
      }
    } else {
      // Regular (non-oversized) vehicle — insert directly to resident_vehicles
      regularRows.push({
        unit_id,
        owner_name,
        owner_phone,
        owner_email,
        registrant_type: registrant_type ?? 'owner',
        opt_in_sms: opt_in_sms ?? false,
        opt_in_email: opt_in_email ?? true,
        year: v.year,
        make: v.make,
        model: v.model,
        color: v.color,
        license_plate: v._normalized_plate,
        plate_state: v.plate_state,
        registration_doc_url: v._registration_doc_url,
        is_oversized: false,
        vehicle_type: v.vehicle_type ?? null,
      });
    }
  }

  // Insert regular vehicles
  if (regularRows.length > 0) {
    const { error } = await supabaseAdmin.from('resident_vehicles').insert(regularRows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Insert oversized pending applications
  if (oversizedPendingRows.length > 0) {
    const { error } = await supabaseAdmin.from('oversized_applications').insert(oversizedPendingRows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    regular_count: regularRows.length,
    oversized_pending_count: oversizedPendingRows.length,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const unitId = searchParams.get('unit_id') || '';
  const page = parseInt(searchParams.get('page') || '0', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = page * limit;

  let query = supabaseAdmin
    .from('resident_vehicles')
    .select('*, units(address)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (unitId) {
    query = query.eq('unit_id', unitId);
  } else if (search) {
    // First find unit_ids where address matches (joined table can't be searched in .or())
    const { data: matchingUnits } = await supabaseAdmin
      .from('units')
      .select('id')
      .ilike('address', `%${search}%`);
    const matchingUnitIds = (matchingUnits ?? []).map((u) => u.id);

    const baseOr = `license_plate.ilike.%${search}%,owner_name.ilike.%${search}%,owner_phone.ilike.%${search}%,owner_email.ilike.%${search}%`;
    if (matchingUnitIds.length > 0) {
      query = query.or(`${baseOr},unit_id.in.(${matchingUnitIds.join(',')})`);
    } else {
      query = query.or(baseOr);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, total: count, page, limit });
}
