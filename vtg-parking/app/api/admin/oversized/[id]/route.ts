import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { sendOversizedDecision } from '@/lib/email';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { status, admin_notes } = await req.json();

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // Fetch the vehicle from resident_vehicles
  const { data: vehicle } = await supabaseAdmin
    .from('resident_vehicles')
    .select('*, units(address)')
    .eq('id', id)
    .eq('is_oversized', true)
    .single();

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Update approval_status in-place — no separate insert needed
  const { error: updateError } = await supabaseAdmin
    .from('resident_vehicles')
    .update({
      approval_status: status,
      admin_notes: admin_notes ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.username,
    })
    .eq('id', id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Send decision email to applicant
  if (vehicle.owner_email) {
    sendOversizedDecision({
      applicantEmail: vehicle.owner_email,
      ownerName: vehicle.owner_name,
      unitAddress: (vehicle.units as any)?.address ?? '',
      vehicle: {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        color: vehicle.color,
        license_plate: vehicle.license_plate,
        plate_state: vehicle.plate_state,
      },
      status,
      admin_notes: admin_notes ?? null,
    });
  }

  return NextResponse.json({ success: true });
}
