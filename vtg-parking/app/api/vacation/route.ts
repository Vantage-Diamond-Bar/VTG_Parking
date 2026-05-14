import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    unit_id, registrant_type, first_name, last_name, phone, phone_country_code, email, reason,
    emergency_first_name, emergency_last_name, emergency_phone, emergency_phone_country_code,
    start_datetime, end_datetime,
    year, make, model, color, license_plate, plate_state,
  } = body

  // Check if the submitted vehicle is registered to this unit
  const { data: matchedVehicle } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id, is_oversized')
    .eq('unit_id', unit_id)
    .ilike('license_plate', license_plate)
    .maybeSingle()

  const isRegistered = matchedVehicle !== null

  // Enhanced eligibility: registered AND (oversized OR unit has 3+ vehicles)
  let isEligible = false
  if (isRegistered) {
    if (matchedVehicle.is_oversized) {
      isEligible = true
    } else {
      const { count } = await supabaseAdmin
        .from('resident_vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('unit_id', unit_id)
      isEligible = (count ?? 0) >= 3
    }
  }

  // Block submission if unit has overdue registrations
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const { data: unitVehicles } = await supabaseAdmin
    .from('resident_vehicles')
    .select('created_at')
    .eq('unit_id', unit_id)
  const hasOverdue = (unitVehicles ?? []).some(
    (v) => new Date(v.created_at) < oneYearAgo
  )
  if (hasOverdue) {
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
