import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { VISITOR_QUOTA_LIMIT, countNights, monthBounds, getYearMonth } from '@/lib/utils'
import { decodeVerificationToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { verification_token } = await req.json()

  const tokenData = decodeVerificationToken(verification_token)
  if (!tokenData) {
    return NextResponse.json({ status: 'invalid_token' }, { status: 403 })
  }

  const { unit_id } = tokenData

  const { data: vehicles, error } = await supabaseAdmin
    .from('resident_vehicles')
    .select('owner_email, created_at')
    .eq('unit_id', unit_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json({ status: 'no_vehicles' })
  }

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const isOverdue = vehicles.some(
    (v) => new Date(v.created_at) < oneYearAgo
  )

  if (isOverdue) {
    return NextResponse.json({ status: 'overdue' })
  }

  // Compute nights used dynamically from actual visitor_registrations
  const yearMonth = getYearMonth()
  const { start, end } = monthBounds(yearMonth)

  const { data: regs } = await supabaseAdmin
    .from('visitor_registrations')
    .select('start_datetime, end_datetime')
    .eq('unit_id', unit_id)
    .gte('start_datetime', start)
    .lt('start_datetime', end)

  const nights_used = (regs ?? []).reduce(
    (sum, r) => sum + countNights(r.start_datetime, r.end_datetime),
    0
  )

  return NextResponse.json({
    status: 'ok',
    quota: {
      used: nights_used,
      limit: VISITOR_QUOTA_LIMIT,
    },
  })
}
