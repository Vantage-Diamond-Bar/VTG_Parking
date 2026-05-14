import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSessionFromRequest } from '@/lib/auth'
import { countNights, VISITOR_QUOTA_LIMIT } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const search = new URL(req.url).searchParams.get('search') || ''

  // Fetch all visitor registrations (no pagination — aggregate in JS)
  const { data: regs, error: regsError } = await supabaseAdmin
    .from('visitor_registrations')
    .select('id, unit_id, start_datetime, end_datetime, license_plate, plate_state, visitor_name, make, model, color, visitor_phone, access_code')
    .order('start_datetime', { ascending: false })

  if (regsError) return NextResponse.json({ error: regsError.message }, { status: 500 })

  // Fetch all units
  const { data: units } = await supabaseAdmin
    .from('units')
    .select('id, address')

  const unitAddressMap: Record<string, string> = {}
  for (const u of units ?? []) unitAddressMap[u.id] = u.address

  // Group registrations by unit_id
  type MonthEntry = { year_month: string; nights_used: number; count: number; limit: number }
  type UnitEntry = {
    unit_id: string
    address: string
    total_nights: number
    months: Record<string, MonthEntry>
    registrations: Array<{
      id: string; start_datetime: string; end_datetime: string
      license_plate: string; plate_state: string; visitor_name: string
      make: string; model: string; color: string; visitor_phone: string
      access_code: string; nights: number
    }>
  }

  const unitMap: Record<string, UnitEntry> = {}

  for (const reg of regs ?? []) {
    if (!reg.unit_id) continue
    if (!unitMap[reg.unit_id]) {
      unitMap[reg.unit_id] = {
        unit_id: reg.unit_id,
        address: unitAddressMap[reg.unit_id] ?? 'Unknown',
        total_nights: 0,
        months: {},
        registrations: [],
      }
    }
    const entry = unitMap[reg.unit_id]
    const nights = countNights(reg.start_datetime, reg.end_datetime)
    const yearMonth = (reg.start_datetime ?? '').slice(0, 7)

    if (yearMonth) {
      if (!entry.months[yearMonth]) {
        entry.months[yearMonth] = { year_month: yearMonth, nights_used: 0, count: 0, limit: VISITOR_QUOTA_LIMIT }
      }
      entry.months[yearMonth].nights_used += nights
      entry.months[yearMonth].count++
    }

    entry.total_nights += nights
    entry.registrations.push({
      id: reg.id,
      start_datetime: reg.start_datetime,
      end_datetime: reg.end_datetime,
      license_plate: reg.license_plate ?? '',
      plate_state: reg.plate_state ?? '',
      visitor_name: reg.visitor_name ?? '',
      make: reg.make ?? '',
      model: reg.model ?? '',
      color: reg.color ?? '',
      visitor_phone: reg.visitor_phone ?? '',
      access_code: reg.access_code ?? '',
      nights,
    })
  }

  // Convert to sorted array
  let result = Object.values(unitMap).map((u) => ({
    ...u,
    months: Object.values(u.months).sort((a, b) => b.year_month.localeCompare(a.year_month)),
  })).sort((a, b) => b.total_nights - a.total_nights)

  // Also include units with zero registrations when no search
  if (!search) {
    for (const u of units ?? []) {
      if (!unitMap[u.id]) {
        result.push({ unit_id: u.id, address: u.address, total_nights: 0, months: [], registrations: [] })
      }
    }
  }

  // Filter by search
  if (search) {
    const q = search.toLowerCase()
    result = result.filter((u) =>
      u.address.toLowerCase().includes(q) ||
      u.registrations.some(
        (r) =>
          r.license_plate.toLowerCase().includes(q) ||
          r.visitor_name.toLowerCase().includes(q) ||
          r.make.toLowerCase().includes(q) ||
          r.model.toLowerCase().includes(q)
      )
    )
  }

  return NextResponse.json({ data: result, total: result.length })
}
