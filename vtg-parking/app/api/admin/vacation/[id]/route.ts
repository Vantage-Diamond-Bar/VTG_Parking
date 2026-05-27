import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { sendVacationDecision } from '@/lib/email'

const ACCESS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateAccessCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += ACCESS_CODE_CHARS[Math.floor(Math.random() * ACCESS_CODE_CHARS.length)]
  }
  return code
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { status, admin_notes, rejection_reason } = await req.json()

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

  let access_code: string | null = null
  if (status === 'approved') {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateAccessCode()
      const { data: collision } = await supabaseAdmin
        .from('vacation_parking_requests')
        .select('id')
        .eq('access_code', candidate)
        .maybeSingle()
      if (!collision) { access_code = candidate; break }
    }
    if (!access_code) return NextResponse.json({ error: 'Failed to generate unique access code' }, { status: 500 })
  }

  const { error } = await supabaseAdmin
    .from('vacation_parking_requests')
    .update({
      status,
      admin_notes: admin_notes ?? null,
      rejection_reason: status === 'rejected' ? (rejection_reason ?? null) : null,
      access_code: access_code,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.username,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send email to applicant — best effort
  try {
    if (request.email) {
      await sendVacationDecision({
        applicantEmail: request.email,
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
        access_code: access_code ?? undefined,
        rejection_reason: rejection_reason ?? undefined,
        admin_notes: admin_notes ?? undefined,
      })
    }
  } catch {}

  return NextResponse.json({ success: true, access_code })
}
