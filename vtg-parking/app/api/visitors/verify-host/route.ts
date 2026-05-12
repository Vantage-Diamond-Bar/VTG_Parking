import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { VISITOR_QUOTA_LIMIT } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const { unit_id, email } = await req.json()

  if (!unit_id || !email) {
    return NextResponse.json({ error: 'unit_id and email required' }, { status: 400 })
  }

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

  const emailLower = email.trim().toLowerCase()
  const matched = vehicles.some(
    (v) => v.owner_email && v.owner_email.trim().toLowerCase() === emailLower
  )

  if (!matched) {
    return NextResponse.json({ status: 'mismatch' })
  }

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const isOverdue = vehicles.some(
    (v) => new Date(v.created_at) < oneYearAgo
  )

  if (isOverdue) {
    return NextResponse.json({ status: 'overdue' })
  }

  const yearMonth = new Date().toISOString().slice(0, 7)
  const { data: quotaRow } = await supabaseAdmin
    .from('visitor_monthly_quota')
    .select('nights_used')
    .eq('unit_id', unit_id)
    .eq('year_month', yearMonth)
    .maybeSingle()

  return NextResponse.json({
    status: 'ok',
    quota: {
      used: quotaRow?.nights_used ?? 0,
      limit: VISITOR_QUOTA_LIMIT,
    },
  })
}
