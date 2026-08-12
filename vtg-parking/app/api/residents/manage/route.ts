import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizedPlate, RESIDENT_VEHICLE_LIMIT } from '@/lib/utils';
import { decodeVerificationToken } from '@/lib/auth';

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { action, unit_id, token } = body;

  if (!unit_id || !token || !action) {
    return NextResponse.json({ error: 'unit_id, token, and action are required' }, { status: 400 });
  }

  const tokenData = decodeVerificationToken(token);
  if (!tokenData || tokenData.unit_id !== unit_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  const email = tokenData.email;

  if (action === 'update_owner') {
    const { owner_name, owner_phone, new_email, registrant_type } = body;
    const storedEmail = new_email || email;

    const { error } = await supabaseAdmin
      .from('resident_vehicles')
      .update({ owner_name, owner_phone, owner_email: storedEmail, registrant_type })
      .eq('unit_id', unit_id);

    if (error) {
      return NextResponse.json({ error: 'Failed to update owner info' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (action === 'update_vehicle') {
    const { vehicle_id, year, make, model, color, license_plate, plate_state, is_oversized } = body;

    if (!vehicle_id) {
      return NextResponse.json({ error: 'vehicle_id is required' }, { status: 400 });
    }

    const plate = normalizedPlate(license_plate);

    // Check for plate conflict with any other vehicle (excluding this one)
    const { data: conflictVehicle } = await supabaseAdmin
      .from('resident_vehicles')
      .select('id')
      .ilike('license_plate', plate)
      .neq('id', vehicle_id)
      .maybeSingle();

    if (conflictVehicle) {
      return NextResponse.json({ error: 'plate_conflict', plate }, { status: 409 });
    }

    // Fetch current oversized state; also validates vehicle belongs to this unit
    const { data: current, error: currentError } = await supabaseAdmin
      .from('resident_vehicles')
      .select('is_oversized')
      .eq('id', vehicle_id)
      .eq('unit_id', unit_id)
      .single();

    if (currentError || !current) {
      return NextResponse.json({ error: 'Vehicle not found for this unit' }, { status: 404 });
    }

    const upgradingToOversized = is_oversized === true && current.is_oversized === false;

    const { error } = await supabaseAdmin
      .from('resident_vehicles')
      .update({
        year,
        make,
        model,
        color,
        license_plate: plate,
        plate_state,
        is_oversized,
        // Re-entering oversized flow: reset to pending and clear prior review/rejection state
        ...(upgradingToOversized
          ? { approval_status: 'pending', reviewed_at: null, reviewed_by: null, oversized_rejected_at: null }
          : {}),
      })
      .eq('id', vehicle_id)
      .eq('unit_id', unit_id);

    if (error) {
      return NextResponse.json({ error: 'Failed to update vehicle' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  if (action === 'update_doc') {
    const { vehicle_id, registration_doc_base64, registration_doc_filename } = body;

    if (!vehicle_id || !registration_doc_base64 || !registration_doc_filename) {
      return NextResponse.json(
        { error: 'vehicle_id, registration_doc_base64, and registration_doc_filename are required' },
        { status: 400 }
      );
    }

    // Fetch the vehicle's license_plate
    const { data: vehicle, error: fetchError } = await supabaseAdmin
      .from('resident_vehicles')
      .select('license_plate')
      .eq('id', vehicle_id)
      .eq('unit_id', unit_id)
      .single();

    if (fetchError || !vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    const ext = registration_doc_filename.split('.').pop() ?? 'pdf';
    const filePath = `${unit_id}/${normalizedPlate(vehicle.license_plate)}.${ext}`;

    const fileBuffer = Buffer.from(registration_doc_base64, 'base64');

    const { error: uploadError } = await supabaseAdmin.storage
      .from('registration-docs')
      .upload(filePath, fileBuffer, {
        upsert: true,
        contentType: `application/${ext === 'pdf' ? 'pdf' : 'octet-stream'}`,
      });

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('registration-docs')
      .getPublicUrl(filePath);

    const registration_doc_url = publicUrlData.publicUrl;

    const { error: updateError } = await supabaseAdmin
      .from('resident_vehicles')
      .update({ registration_doc_url, created_at: new Date().toISOString() })
      .eq('id', vehicle_id)
      .eq('unit_id', unit_id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update vehicle doc URL' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, unit_id, token } = body;

  if (!unit_id || !token || !action) {
    return NextResponse.json({ error: 'unit_id, token, and action are required' }, { status: 400 });
  }

  const tokenData = decodeVerificationToken(token);
  if (!tokenData || tokenData.unit_id !== unit_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
  }

  if (action === 'add_vehicle') {
    const {
      year,
      make,
      model,
      color,
      license_plate,
      plate_state,
      is_oversized,
      registration_doc_base64,
      registration_doc_filename,
    } = body;

    if (!license_plate) {
      return NextResponse.json({ error: 'license_plate is required' }, { status: 400 });
    }

    // Per-unit vehicle cap. A unit may hold at most RESIDENT_VEHICLE_LIMIT vehicles;
    // a 5th requires HOA approval, after which the management company adds it directly.
    const { count: existingCount } = await supabaseAdmin
      .from('resident_vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('unit_id', unit_id)
      .neq('approval_status', 'rejected');
    const current = existingCount ?? 0;
    if (current + 1 > RESIDENT_VEHICLE_LIMIT) {
      return NextResponse.json(
        { error: 'vehicle_limit_exceeded', limit: RESIDENT_VEHICLE_LIMIT, current, attempted: 1 },
        { status: 409 }
      );
    }

    const plate = normalizedPlate(license_plate);

    // Check for plate conflict
    const { data: conflictVehicle, error: conflictError } = await supabaseAdmin
      .from('resident_vehicles')
      .select('id')
      .eq('license_plate', plate)
      .maybeSingle();

    if (conflictError) {
      return NextResponse.json({ error: 'Failed to check plate conflict' }, { status: 500 });
    }

    if (conflictVehicle) {
      return NextResponse.json({ error: 'plate_conflict' }, { status: 409 });
    }

    // Get owner info from an existing vehicle for this unit
    const { data: existingVehicles, error: existingError } = await supabaseAdmin
      .from('resident_vehicles')
      .select('owner_name, owner_phone, owner_phone_country_code, owner_email, registrant_type')
      .eq('unit_id', unit_id)
      .limit(1);

    if (existingError || !existingVehicles || existingVehicles.length === 0) {
      return NextResponse.json({ error: 'No existing vehicles found for unit' }, { status: 404 });
    }

    const { owner_name, owner_phone, owner_phone_country_code, owner_email, registrant_type } = existingVehicles[0];

    // Upload doc if provided
    let registration_doc_url: string | null = null;

    if (registration_doc_base64 && registration_doc_filename) {
      const ext = registration_doc_filename.split('.').pop() ?? 'pdf';
      const filePath = `${unit_id}/${plate}.${ext}`;
      const fileBuffer = Buffer.from(registration_doc_base64, 'base64');

      const { error: uploadError } = await supabaseAdmin.storage
        .from('registration-docs')
        .upload(filePath, fileBuffer, {
          upsert: true,
          contentType: `application/${ext === 'pdf' ? 'pdf' : 'octet-stream'}`,
        });

      if (uploadError) {
        return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('registration-docs')
        .getPublicUrl(filePath);

      registration_doc_url = publicUrlData.publicUrl;
    }

    // All vehicles go to resident_vehicles.
    // Oversized enters as 'pending' (awaiting admin garage check); regular as 'approved'.
    const isOversized = is_oversized === true;
    const { error: insertError } = await supabaseAdmin.from('resident_vehicles').insert({
      unit_id,
      year,
      make,
      model,
      color,
      license_plate: plate,
      plate_state: plate_state ?? null,
      is_oversized: isOversized,
      vehicle_type: body.vehicle_type ?? null,
      registration_doc_url,
      owner_name,
      owner_phone,
      owner_phone_country_code: owner_phone_country_code ?? null,
      owner_email,
      registrant_type,
      approval_status: isOversized ? 'pending' : 'approved',
    });

    if (insertError) return NextResponse.json({ error: 'Failed to add vehicle' }, { status: 500 });

    return NextResponse.json({ success: true, oversized_pending: isOversized });
  }

  if (action === 'withdraw_pending') {
    const { vehicle_id } = body;
    if (!vehicle_id) return NextResponse.json({ error: 'vehicle_id is required' }, { status: 400 });

    const { data: vehicle, error: fetchError } = await supabaseAdmin
      .from('resident_vehicles')
      .select('id, approval_status')
      .eq('id', vehicle_id)
      .eq('unit_id', unit_id)
      .single();

    if (fetchError || !vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    if (vehicle.approval_status !== 'pending') return NextResponse.json({ error: 'Only pending applications can be withdrawn' }, { status: 409 });

    const { error: deleteError } = await supabaseAdmin
      .from('resident_vehicles')
      .delete()
      .eq('id', vehicle_id)
      .eq('unit_id', unit_id);

    if (deleteError) return NextResponse.json({ error: 'Failed to withdraw application' }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'delete_vehicle') {
    const { vehicle_id } = body;

    if (!vehicle_id) {
      return NextResponse.json({ error: 'vehicle_id is required' }, { status: 400 });
    }

    // Verify the vehicle belongs to this unit
    const { data: vehicle, error: fetchError } = await supabaseAdmin
      .from('resident_vehicles')
      .select('id')
      .eq('id', vehicle_id)
      .eq('unit_id', unit_id)
      .single();

    if (fetchError || !vehicle) {
      return NextResponse.json({ error: 'Vehicle not found for this unit' }, { status: 404 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('resident_vehicles')
      .delete()
      .eq('id', vehicle_id)
      .eq('unit_id', unit_id);

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete vehicle' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
