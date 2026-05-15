import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const unit_id = searchParams.get('unit_id')
  const email = searchParams.get('email')

  if (!unit_id || !email) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const { data: vehicles } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id, year, make, model, color, license_plate, plate_state, is_oversized, owner_name, owner_phone, owner_phone_country_code, owner_email, registrant_type')
    .eq('unit_id', unit_id)
    .ilike('owner_email', email)

  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json({ error: 'email_mismatch' }, { status: 403 })
  }

  return NextResponse.json({
    vehicles,
    owner: {
      name: vehicles[0].owner_name,
      phone: vehicles[0].owner_phone,
      phone_country_code: vehicles[0].owner_phone_country_code,
      email: vehicles[0].owner_email,
      registrant_type: vehicles[0].registrant_type,
    },
  })
}
