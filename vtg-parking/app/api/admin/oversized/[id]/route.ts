import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { sendOversizedDecision } from '@/lib/email';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { status, admin_notes } = await req.json();

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // Fetch the vehicle — guard ensures only genuinely pending applications are processed
  const { data: vehicle } = await supabaseAdmin
    .from('resident_vehicles')
    .select('*, units(address)')
    .eq('id', id)
    .eq('is_oversized', true)
    .eq('approval_status', 'pending')
    .single();

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date().toISOString();

  // Rejection converts the vehicle to a regular approved registration so patrol
  // can still find it and the resident retains their registration.
  // oversized_rejected_at preserves history for the admin panel.
  const updatePayload: Record<string, unknown> =
    status === 'rejected'
      ? {
          approval_status: 'approved',
          is_oversized: false,
          oversized_rejected_at: now,
          admin_notes: admin_notes ?? null,
          reviewed_at: now,
          reviewed_by: session.username,
        }
      : {
          approval_status: 'approved',
          is_oversized: true,
          oversized_rejected_at: null,
          admin_notes: admin_notes ?? null,
          reviewed_at: now,
          reviewed_by: session.username,
        };

  const { error: updateError } = await supabaseAdmin
    .from('resident_vehicles')
    .update(updatePayload)
    .eq('id', id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Send decision email to applicant
  if (vehicle.owner_email) {
    try {
      await sendOversizedDecision({
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
    } catch (emailErr) {
      console.error('sendOversizedDecision failed:', emailErr);
    }
  }

  return NextResponse.json({ success: true });
}
