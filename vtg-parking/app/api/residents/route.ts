import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizedPlate } from '@/lib/utils';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { unit_id, owner_name, owner_phone, owner_email, opt_in_sms, opt_in_email, registrant_type, vehicles } = body;

  for (const vehicle of vehicles) {
    const plate = normalizedPlate(vehicle.license_plate);

    // Check for plate conflict
    const { data: existing } = await supabaseAdmin
      .from('resident_vehicles')
      .select('id')
      .ilike('license_plate', plate)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'plate_conflict', plate }, { status: 409 });
    }

    // Handle document upload
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

  const rows = vehicles.map((v: any) => ({
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
  }));

  const { error } = await supabaseAdmin.from('resident_vehicles').insert(rows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: vehicles.length });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '0', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = page * limit;

  let query = supabaseAdmin
    .from('resident_vehicles')
    .select('*, units(address)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(
      `license_plate.ilike.%${search}%,owner_name.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, total: count, page, limit });
}
