import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizedPlate } from '@/lib/utils';

async function verifyOwner(unit_id: string, email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: vehicles, error } = await supabaseAdmin
    .from('resident_vehicles')
    .select('owner_email')
    .eq('unit_id', unit_id);

  if (error || !vehicles) return false;

  return vehicles.some((v) => v.owner_email?.trim().toLowerCase() === normalizedEmail);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { action, unit_id, email } = body;

  if (!unit_id || !email || !action) {
    return NextResponse.json({ error: 'unit_id, email, and action are required' }, { status: 400 });
  }

  const isOwner = await verifyOwner(unit_id, email);
  if (!isOwner) {
    return NextResponse.json({ error: 'email_mismatch' }, { status: 403 });
  }

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
  const { action, unit_id, email } = body;

  if (!unit_id || !email || !action) {
    return NextResponse.json({ error: 'unit_id, email, and action are required' }, { status: 400 });
  }

  const isOwner = await verifyOwner(unit_id, email);
  if (!isOwner) {
    return NextResponse.json({ error: 'email_mismatch' }, { status: 403 });
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

    // Route based on oversized flag
    if (is_oversized === true) {
      // Check for pending application conflict
      const { data: pendingApp } = await supabaseAdmin
        .from('oversized_applications')
        .select('id')
        .ilike('license_plate', plate)
        .eq('status', 'pending')
        .maybeSingle();
      if (pendingApp) {
        return NextResponse.json({ error: 'plate_conflict' }, { status: 409 });
      }

      // Check if there's already an approved application (renewal bypass)
      const { data: approvedApp } = await supabaseAdmin
        .from('oversized_applications')
        .select('id')
        .ilike('license_plate', plate)
        .eq('status', 'approved')
        .maybeSingle();

      if (approvedApp) {
        // Insert directly to resident_vehicles with is_oversized: true
        const { error: insertError } = await supabaseAdmin.from('resident_vehicles').insert({
          unit_id, year, make, model, color,
          license_plate: plate, plate_state,
          is_oversized: true,
          registration_doc_url,
          owner_name, owner_phone, owner_phone_country_code: owner_phone_country_code ?? null, owner_email, registrant_type,
        });
        if (insertError) return NextResponse.json({ error: 'Failed to add vehicle' }, { status: 500 });
      } else {
        // Create a pending oversized application
        const { error: appError } = await supabaseAdmin.from('oversized_applications').insert({
          unit_id,
          owner_name, owner_phone: owner_phone ?? null, owner_phone_country_code: owner_phone_country_code ?? null, owner_email: owner_email ?? null,
          registrant_type: registrant_type ?? 'owner',
          year, make, model, color,
          license_plate: plate,
          plate_state: plate_state ?? null,
          registration_doc_url: registration_doc_url ?? null,
          vehicle_type: body.vehicle_type ?? null,
          status: 'pending',
        });
        if (appError) return NextResponse.json({ error: 'Failed to create oversized application' }, { status: 500 });
        return NextResponse.json({ success: true, oversized_pending: true });
      }
    } else {
      // Insert regular vehicle row
      const { error: insertError } = await supabaseAdmin.from('resident_vehicles').insert({
        unit_id,
        year,
        make,
        model,
        color,
        license_plate: plate,
        plate_state,
        is_oversized: false,
        registration_doc_url,
        owner_name,
        owner_phone,
        owner_phone_country_code: owner_phone_country_code ?? null,
        owner_email,
        registrant_type,
      });

      if (insertError) {
        return NextResponse.json({ error: 'Failed to add vehicle' }, { status: 500 });
      }
    }

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
