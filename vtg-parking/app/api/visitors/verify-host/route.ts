import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { VISITOR_QUOTA_LIMIT, countNights, monthBounds, getPTYearMonth } from '@/lib/utils'
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
    .eq('approval_status', 'approved')

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

  // Compute nights used dynamically from actual visitor_registrations.
  // Use the same overlap query + month-boundary clamping as GET /api/visitors/quota
  // so that verify-host and the quota display always agree.
  //
  // Previous bugs fixed here:
  //   1. Wrong filter: .gte('start_datetime', start).lt('start_datetime', end) only
  //      matched bookings whose START falls within the month — it missed bookings that
  //      begin before the month but end within it.
  //   2. No clamping: countNights(start, end) on a cross-month booking counted the
  //      full stay duration against a single month (e.g. May 29–June 5 = 7 nights
  //      all charged to May instead of the correct 2).
  // getPTYearMonth() is timezone-safe on UTC servers; getYearMonth() would
  // return the UTC month which can be one calendar day ahead of PDT.
  const yearMonth = getPTYearMonth()
  const { start, end } = monthBounds(yearMonth)

  const { data: regs } = await supabaseAdmin
    .from('visitor_registrations')
    .select('start_datetime, end_datetime')
    .eq('unit_id', unit_id)
    .lt('start_datetime', end)   // started before the month ends
    .gt('end_datetime', start)   // ended after the month started

  const nights_used = (regs ?? []).reduce((sum, r) => {
    // Clamp each booking to the current month before counting nights
    const clampedStart = r.start_datetime > start ? r.start_datetime : start
    const clampedEnd   = r.end_datetime   < end   ? r.end_datetime   : end
    return sum + countNights(clampedStart, clampedEnd)
  }, 0)

  return NextResponse.json({
    status: 'ok',
    quota: {
      used: nights_used,
      limit: VISITOR_QUOTA_LIMIT,
    },
  })
}
