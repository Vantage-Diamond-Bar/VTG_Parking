import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    unit_id, registrant_type, first_name, last_name, phone,
    emergency_first_name, emergency_last_name, emergency_phone,
    start_datetime, end_datetime,
    year, make, model, color, license_plate, plate_state,
  } = body

  // Check if the submitted vehicle is registered to this unit
  const { data: matchedVehicle } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id')
    .eq('unit_id', unit_id)
    .ilike('license_plate', license_plate)
    .maybeSingle()

  const { data, error } = await supabaseAdmin
    .from('vacation_parking_requests')
    .insert({
      unit_id, registrant_type, first_name, last_name, phone,
      emergency_first_name, emergency_last_name, emergency_phone,
      start_datetime, end_datetime,
      year, make, model, color, license_plate, plate_state,
      is_registered_vehicle: matchedVehicle !== null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data.id })
}
