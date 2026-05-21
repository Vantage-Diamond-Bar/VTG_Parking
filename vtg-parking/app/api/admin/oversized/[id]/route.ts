import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionFromRequest } from '@/lib/auth';
import { sendOversizedDecision } from '@/lib/email';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { status, admin_notes } = await req.json();

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // Fetch the application
  const { data: application } = await supabaseAdmin
    .from('oversized_applications')
    .select('*, units(address)')
    .eq('id', id)
    .single();

  if (!application) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (status === 'approved') {
    // Insert the vehicle into resident_vehicles with is_oversized: true
    const { error: insertError } = await supabaseAdmin.from('resident_vehicles').insert({
      unit_id: application.unit_id,
      owner_name: application.owner_name,
      owner_phone: application.owner_phone ?? null,
      owner_phone_country_code: application.owner_phone_country_code ?? null,
      owner_email: application.owner_email ?? null,
      registrant_type: application.registrant_type ?? 'owner',
      opt_in_sms: false,
      opt_in_email: true,
      year: application.year,
      make: application.make,
      model: application.model,
      color: application.color,
      license_plate: application.license_plate,
      plate_state: application.plate_state ?? null,
      registration_doc_url: application.registration_doc_url ?? null,
      is_oversized: true,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // Update the oversized_applications record
  const { error: updateError } = await supabaseAdmin
    .from('oversized_applications')
    .update({
      status,
      admin_notes: admin_notes ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.username,
    })
    .eq('id', id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Send decision email to applicant
  if (application.owner_email) {
    sendOversizedDecision({
      applicantEmail: application.owner_email,
      ownerName: application.owner_name,
      unitAddress: (application.units as any)?.address ?? '',
      vehicle: {
        year: application.year,
        make: application.make,
        model: application.model,
        color: application.color,
        license_plate: application.license_plate,
        plate_state: application.plate_state,
      },
      status,
      admin_notes: admin_notes ?? null,
    })
  }

  return NextResponse.json({ success: true });
}
