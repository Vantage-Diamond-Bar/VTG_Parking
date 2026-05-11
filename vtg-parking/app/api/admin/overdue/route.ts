import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const { data, error } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id, owner_name, owner_email, make, model, color, license_plate, plate_state, created_at, registrant_type, units(address)')
    .lt('created_at', oneYearAgo.toISOString())
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
