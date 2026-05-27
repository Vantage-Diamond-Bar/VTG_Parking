import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { normalizedPlate } from '@/lib/utils';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { unit_id, owner_name, owner_phone, owner_phone_country_code, owner_email, opt_in_sms, opt_in_email, registrant_type, vehicles } = body;

  // First pass: validate plates and upload docs
  for (const vehicle of vehicles) {
    const plate = normalizedPlate(vehicle.license_plate);

    // Plate conflict: resident_vehicles now holds both pending and approved
    const { data: existing } = await supabaseAdmin
      .from('resident_vehicles')
      .select('id')
      .ilike('license_plate', plate)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: 'plate_conflict', plate }, { status: 409 });

    // Use pre-uploaded URL if provided; otherwise fall back to base64 upload
    let registration_doc_url: string | null = vehicle.registration_doc_url ?? null;
    if (!registration_doc_url && vehicle.registration_doc_base64 && vehicle.registration_doc_filename) {
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

  // Second pass: all vehicles go to resident_vehicles.
  // Oversized vehicles enter as 'pending' (awaiting admin garage check).
  // Regular vehicles enter as 'approved' immediately.
  const rows = vehicles.map((v: any) => ({
    unit_id,
    owner_name,
    owner_phone,
    owner_phone_country_code: owner_phone_country_code ?? null,
    owner_email,
    registrant_type: registrant_type ?? 'owner',
    opt_in_sms: opt_in_sms ?? false,
    opt_in_email: opt_in_email ?? true,
    year: v.year,
    make: v.make,
    model: v.model,
    color: v.color,
    license_plate: v._normalized_plate,
    plate_state: v.plate_state ?? null,
    registration_doc_url: v._registration_doc_url ?? null,
    is_oversized: v.is_oversized === true,
    vehicle_type: v.vehicle_type ?? null,
    approval_status: v.is_oversized === true ? 'pending' : 'approved',
  }));

  const { error } = await supabaseAdmin.from('resident_vehicles').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const oversized_pending_count = rows.filter((r: any) => r.approval_status === 'pending').length;
  return NextResponse.json({
    success: true,
    regular_count: rows.length - oversized_pending_count,
    oversized_pending_count,
  });
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rawSearch = searchParams.get('search') || '';
  const unitId = searchParams.get('unit_id') || '';
  const page = parseInt(searchParams.get('page') || '0', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = page * limit;

  // Strip characters that carry special meaning in PostgREST .or() filter strings
  // (commas separate conditions; parentheses are used in .in.() syntax)
  const search = rawSearch.replace(/[,()]/g, '');

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
    // matchingUnitIds are UUIDs from DB — safe to join
    const matchingUnitIds = (matchingUnits ?? []).map((u) => u.id);

    const likePattern = `%${search}%`;
    const baseOr = `license_plate.ilike.${likePattern},owner_name.ilike.${likePattern},owner_phone.ilike.${likePattern},owner_email.ilike.${likePattern}`;
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
