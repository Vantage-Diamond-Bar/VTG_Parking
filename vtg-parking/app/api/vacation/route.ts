import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { decodeVerificationToken } from '@/lib/auth'
import { hasOverdueRegistration } from '@/lib/unit-eligibility'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    token, unit_id, registrant_type, first_name, last_name, phone, phone_country_code, email, reason,
    emergency_first_name, emergency_last_name, emergency_phone, emergency_phone_country_code,
    start_datetime, end_datetime,
    year, make, model, color, license_plate, plate_state,
  } = body

  // Verify caller owns this unit via signed token
  const tokenData = decodeVerificationToken(token)
  if (!tokenData || tokenData.unit_id !== unit_id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 })
  }

  // Check if the submitted vehicle is registered to this unit
  const { data: matchedVehicle } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id, is_oversized')
    .eq('unit_id', unit_id)
    .eq('approval_status', 'approved')
    .ilike('license_plate', license_plate)
    .maybeSingle()

  const isRegistered = matchedVehicle !== null

  // Enhanced eligibility: registered AND (oversized OR unit has 3+ approved vehicles)
  let isEligible = false
  if (isRegistered) {
    if (matchedVehicle.is_oversized) {
      isEligible = true
    } else {
      const { count } = await supabaseAdmin
        .from('resident_vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('unit_id', unit_id)
        .eq('approval_status', 'approved')
      isEligible = (count ?? 0) >= 3
    }
  }

  // Overdue-only on purpose: eligibility here is decided by this route's own
  // rules (3+ vehicles, or oversized), so a unit with no vehicles is rejected
  // earlier rather than by the shared visitor-parking gate.
  if (await hasOverdueRegistration(unit_id)) {
    return NextResponse.json({ error: 'registration_overdue' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('vacation_parking_requests')
    .insert({
      unit_id, registrant_type, first_name, last_name, phone,
      phone_country_code: phone_country_code ?? null,
      email: email ?? null,
      reason: reason ?? null,
      emergency_first_name, emergency_last_name, emergency_phone,
      emergency_phone_country_code: emergency_phone_country_code ?? null,
      start_datetime, end_datetime,
      year, make, model, color, license_plate, plate_state,
      is_registered_vehicle: isRegistered,
      is_eligible: isEligible,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id })
}
