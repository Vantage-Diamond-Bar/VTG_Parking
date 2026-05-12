import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth'
import { sendVacationDecision } from '@/lib/email'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { status, admin_notes } = await req.json()

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Fetch full request to send notification
  const { data: request } = await supabaseAdmin
    .from('vacation_parking_requests')
    .select('*, units(address)')
    .eq('id', id)
    .single()

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('vacation_parking_requests')
    .update({
      status,
      admin_notes: admin_notes ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.username,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send email notification — best effort
  try {
    await sendVacationDecision({
      firstName: request.first_name,
      lastName: request.last_name,
      unitAddress: (request.units as any)?.address ?? '',
      vehicle: {
        year: request.year,
        make: request.make,
        model: request.model,
        color: request.color,
        license_plate: request.license_plate,
      },
      startDatetime: request.start_datetime,
      endDatetime: request.end_datetime,
      status,
      admin_notes: admin_notes ?? undefined,
    })
  } catch {}

  return NextResponse.json({ success: true })
}
