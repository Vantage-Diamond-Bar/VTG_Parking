import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unit_id = new URL(req.url).searchParams.get('unit_id')
  if (!unit_id) return NextResponse.json({ error: 'Missing unit_id' }, { status: 400 })

  // Get all vehicles for this unit
  const { data: vehicles } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id, year, make, model, color, license_plate, plate_state, is_oversized, registration_doc_url, created_at')
    .eq('unit_id', unit_id)

  if (!vehicles || vehicles.length === 0) {
    return NextResponse.json({ has_vehicles: false, has_overdue: false, is_eligible: false })
  }

  // Check for overdue (> 1 year since created_at)
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const hasOverdue = vehicles.some(v => new Date(v.created_at) < oneYearAgo)

  // Check eligibility: ≥3 vehicles OR any oversized
  const hasOversized = vehicles.some(v => v.is_oversized)
  const isEligible = vehicles.length >= 3 || hasOversized

  // Get email hints
  const { data: emailRow } = await supabaseAdmin
    .from('resident_vehicles')
    .select('owner_email')
    .eq('unit_id', unit_id)
    .maybeSingle()

  let emailHints: string[] = []
  if (emailRow?.owner_email) {
    const e = emailRow.owner_email
    const [local, domain] = e.split('@')
    if (local && domain) {
      const maskedLocal = local[0] + '*'.repeat(Math.max(1, local.length - 2)) + (local.length > 1 ? local[local.length - 1] : '')
      const dotIdx = domain.lastIndexOf('.')
      const maskedDomain = domain[0] + '*'.repeat(Math.max(1, dotIdx - 1)) + domain.slice(dotIdx)
      emailHints = [`${maskedLocal}@${maskedDomain}`]
    }
  }

  return NextResponse.json({
    has_vehicles: true,
    has_overdue: hasOverdue,
    is_eligible: isEligible,
    email_hints: emailHints,
    vehicle_count: vehicles.length,
    has_oversized: hasOversized,
  })
}
