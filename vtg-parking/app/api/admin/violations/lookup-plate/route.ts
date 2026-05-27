import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { normalizedPlate } from '@/lib/utils'

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { plate: rawPlate } = await req.json()
  if (!rawPlate) return NextResponse.json({ unit_address: null })

  const plate = normalizedPlate(rawPlate)

  const { data: rv } = await supabaseAdmin
    .from('resident_vehicles')
    .select('units(address)')
    .ilike('license_plate', plate)
    .maybeSingle()

  if (rv) {
    return NextResponse.json({ unit_address: (rv.units as any)?.address ?? null, source: 'resident' })
  }

  const { data: vr } = await supabaseAdmin
    .from('visitor_registrations')
    .select('units(address)')
    .ilike('license_plate', plate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (vr) {
    return NextResponse.json({ unit_address: (vr.units as any)?.address ?? null, source: 'visitor' })
  }

  return NextResponse.json({ unit_address: null })
}
