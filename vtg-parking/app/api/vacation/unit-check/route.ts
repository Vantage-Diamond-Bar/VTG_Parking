import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { maskEmail } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const unit_id = new URL(req.url).searchParams.get('unit_id')
  if (!unit_id) return NextResponse.json({ error: 'Missing unit_id' }, { status: 400 })

  // Get all vehicles for this unit
  const { data: vehicles } = await supabaseAdmin
    .from('resident_vehicles')
    .select('id, year, make, model, color, license_plate, plate_state, is_oversized, registration_doc_url, created_at, owner_email')
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

  // Get email hints — use all rows and deduplicate (maybeSingle fails when unit has 3+ vehicles)
  const uniqueEmails = [...new Set(
    vehicles.map((v: any) => v.owner_email).filter((e: any): e is string => !!e)
  )]
  const emailHints = uniqueEmails.map(maskEmail)

  return NextResponse.json({
    has_vehicles: true,
    has_overdue: hasOverdue,
    is_eligible: isEligible,
    email_hints: emailHints,
    vehicle_count: vehicles.length,
    has_oversized: hasOversized,
  })
}
