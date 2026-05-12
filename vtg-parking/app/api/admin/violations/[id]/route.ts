import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendViolationHearing } from '@/lib/email'
import { normalizedPlate } from '@/lib/utils'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const {
    status,
    resolution_type,
    admin_notes,
    call_hearing,
    final_license_plate,
    final_violation_type,
    final_location,
  } = body

  const updates: Record<string, any> = {}
  if (status !== undefined) updates.status = status
  if (resolution_type !== undefined) updates.resolution_type = resolution_type
  if (admin_notes !== undefined) updates.admin_notes = admin_notes
  if (call_hearing !== undefined) updates.call_hearing = call_hearing
  if (final_violation_type !== undefined) updates.final_violation_type = final_violation_type
  if (final_location !== undefined) updates.final_location = final_location

  // Normalize and re-lookup plate if changed
  if (final_license_plate !== undefined) {
    const plate = normalizedPlate(final_license_plate)
    updates.final_license_plate = plate

    let unit_address: string | null = null
    if (plate) {
      const { data: rv } = await supabaseAdmin
        .from('resident_vehicles')
        .select('unit_id, units(address)')
        .ilike('license_plate', plate)
        .maybeSingle()
      if (rv) {
        unit_address = (rv.units as any)?.address ?? null
      } else {
        const { data: vr } = await supabaseAdmin
          .from('visitor_registrations')
          .select('unit_id, units(address)')
          .ilike('license_plate', plate)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (vr) unit_address = (vr.units as any)?.address ?? null
      }
    }
    updates.unit_address = unit_address
  }

  if (status === 'resolved' || status === 'no_action') {
    updates.processed_at = new Date().toISOString()
  }

  const { data, error } = await supabaseAdmin
    .from('violation_reports')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send hearing email after save if requested
  if (call_hearing) {
    try {
      await sendViolationHearing({
        violation_id: id,
        location: data.final_location ?? data.location,
        violation_type: data.final_violation_type ?? data.violation_type,
        license_plate: data.final_license_plate ?? data.license_plate,
        unit_address: data.unit_address,
        submitted_at: data.submitted_at,
        admin_notes: data.admin_notes,
      })
    } catch {}
  }

  return NextResponse.json({ success: true, data })
}
